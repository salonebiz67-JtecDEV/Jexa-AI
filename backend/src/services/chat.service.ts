import { DatabaseService } from '../database/db-service';
import { MemoryService } from './memory.service';
import { TavilyService } from './tavily.service';
import { SearchDecisionService } from './search-decision.service';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { assembleConversationContext } from '../../../ai/brain/context-handler';
import { cleanAndNormalizeResponseContent } from '../../../ai/brain/response-cleaner';
import {
  SendMessagePayload,
  ChatResponsePayload,
  AIActivityStatus,
  WebSearchResultItem,
} from '../../../shared/types/chat';
import { TextProviderType } from '../../../shared/types/provider';

export type StatusUpdateCallback = (
  status: AIActivityStatus,
  details?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
  }
) => void;

export class ChatService {
  public static async processMessage(
    payload: SendMessagePayload,
    onStatusUpdate?: StatusUpdateCallback
  ): Promise<ChatResponsePayload> {
    // 1. Initial activity status
    onStatusUpdate?.('Thinking...');

    let convId = payload.conversationId;
    let isNewConversation = false;

    // 2. Resolve or create conversation
    if (!convId) {
      const title = payload.message.slice(0, 30) || 'New Conversation';
      const newConv = await DatabaseService.createConversation(title, payload.personaId, payload.userId);
      convId = newConv.id;
      isNewConversation = true;
    } else {
      const existing = await DatabaseService.getConversation(convId);
      if (!existing) {
        const newConv = await DatabaseService.createConversation('New Conversation', payload.personaId, payload.userId);
        convId = newConv.id;
        isNewConversation = true;
      }
    }

    // 3. Persist user message
    const userMessage = await DatabaseService.saveMessage(convId, {
      role: 'user',
      content: payload.message,
    });

    // 4. Planning & Intelligent Search Evaluation
    onStatusUpdate?.('Planning...');

    const searchDecision = SearchDecisionService.evaluate(payload.message, payload.userContext);
    let searchResults: WebSearchResultItem[] = [];
    let searchPerformed = false;
    let searchStatus: 'success' | 'failed' | 'missing_key' | 'unneeded' = 'unneeded';
    let searchError: string | undefined;

    if (searchDecision.shouldSearch) {
      searchPerformed = true;
      onStatusUpdate?.('Searching the web...', { query: searchDecision.query });

      // Call Tavily Search API
      const searchResponse = await TavilyService.search(searchDecision.query);

      if (searchResponse.code === 'MISSING_TAVILY_KEY') {
        searchStatus = 'missing_key';
        searchError = 'TAVILY_API_KEY is not configured on the backend server.';
        onStatusUpdate?.('Search failed — retry available', {
          query: searchDecision.query,
          error: searchError,
        });
      } else if (!searchResponse.success) {
        searchStatus = 'failed';
        searchError = searchResponse.error || 'Web search failed';
        onStatusUpdate?.('Search failed — retry available', {
          query: searchDecision.query,
          error: searchError,
        });
      } else {
        // Search succeeded
        onStatusUpdate?.('Reading web pages...', { query: searchDecision.query });
        searchResults = searchResponse.results;
        searchStatus = 'success';
        onStatusUpdate?.('Analyzing sources...', {
          query: searchDecision.query,
          sourcesCount: searchResults.length,
        });
      }
    } else {
      // No search needed - advance directly to information processing
      onStatusUpdate?.('Processing information...');
    }

    // 5. Retrieve relevant memories & brain profile scoped to authenticated user
    const profile = await DatabaseService.getBrainProfile(payload.userId);
    const relevantMemories = profile.memorySettings.enabled
      ? await MemoryService.getRelevantMemories(payload.message, profile.memorySettings.maxContextMemories, payload.userId)
      : [];

    // 6. Fetch recent conversation history for context window
    const recentMessages = await DatabaseService.getMessages(convId);

    // 7. Assemble modular brain context
    const assembled = assembleConversationContext({
      personality: (payload.personaId as any) || profile.activePersonality,
      memories: relevantMemories,
      recentMessages,
      userContext: payload.userContext,
      isVoiceMode: Boolean(payload.isVoiceMode),
    });

    // 8. Inject Live Web Search context into system prompt if applicable
    let augmentedSystemPrompt = assembled.systemPrompt;

    // Specialized Sierra Leone & EDSA verification instructions
    const isSierraLeoneOrEDSA =
      searchDecision.category === 'sierra_leone_local' ||
      /\bedsa\b/i.test(payload.message) ||
      /(sierra\s+leone|freetown|salone)/i.test(payload.message);

    if (isSierraLeoneOrEDSA) {
      augmentedSystemPrompt += `\n\n=== SIERRA LEONE & EDSA VERIFICATION DIRECTIVES ===
1. GEOGRAPHIC & UTILITY DISAMBIGUATION:
   "EDSA" refers strictly to the Electricity Distribution and Supply Authority of Sierra Leone (West Africa), NOT the Epifanio de los Santos Avenue / highway in Manila, Philippines. Do not confuse Sierra Leone with the Philippines or another country.
2. OFFICIAL SOURCES FIRST:
   Prioritize official announcements from EDSA Sierra Leone, the Ministry of Energy Sierra Leone, and verified Sierra Leone news organizations (e.g. Awoko, Sierra Leone Telegraph, Calabash, Politico SL, Concord Times).
3. FACT VERIFICATION & ACCURACY:
   - Check publication dates and clearly distinguish whether an announcement is recent/current or historical.
   - Distinguish confirmed official EDSA announcements from rumors or unverified social media posts.
   - NEVER invent or speculate on outage schedules, restoration times, emergency hotline numbers, or fake official quotes.
   - If reliable current information cannot be confirmed from the retrieved sources, tell the user honestly: "I could not find a confirmed recent announcement from EDSA or official authorities regarding this outage."
=== END DIRECTIVES ===`;
    }

    if (searchPerformed && searchStatus === 'success' && searchResults.length > 0) {
      const formattedSources = searchResults
        .map(
          (src, idx) =>
            `[Source ${idx + 1}]\nTitle: ${src.title}\nDomain: ${src.domain || ''}\nURL: ${src.url}\nPublished: ${
              src.publishedDate || 'Recent'
            }\nContent: ${src.content}`
        )
        .join('\n\n');

      augmentedSystemPrompt += `\n\n=== LIVE WEB SEARCH RESULTS ===
Search Query: "${searchDecision.query}"
Retrieved at: ${new Date().toISOString()}

${formattedSources}

CRITICAL CITATION AND MULTI-SOURCE INSTRUCTIONS:
1. Synthesize the live web search results above to answer the user's inquiry thoroughly and factually.
2. If using information from multiple websites, ensure the factual claims in your answer are directly supported by these retrieved sources.
3. Provide clickable markdown links for cited sources using the format: [Source Title](URL).
4. Ground your statements strictly in the facts provided in the search results. Never invent, hallucinate, or fabricate URLs, sources, or claims.
5. If the results do not fully address the question, acknowledge what is known from the sources and explain any missing details.
=== END SEARCH RESULTS ===`;
    } else if (searchPerformed && searchStatus === 'missing_key') {
      augmentedSystemPrompt += `\n\n=== LIVE WEB SEARCH NOTICE ===
The user asked a question requiring live web search (Query: "${searchDecision.query}"), but the backend server does not have TAVILY_API_KEY configured.
INSTRUCTIONS:
1. Briefly notify the user that live web search is not currently active because TAVILY_API_KEY is not set in Render environment variables.
2. Instruct them that they can obtain a free key at https://tavily.com and set TAVILY_API_KEY on Render to enable real-time internet search and source links.
3. Provide the best helpful answer you can using your baseline knowledge, while noting that real-time live data requires configuring the Tavily key.
=== END NOTICE ===`;
    } else if (searchPerformed && searchStatus === 'failed') {
      augmentedSystemPrompt += `\n\n=== LIVE WEB SEARCH NOTICE ===
The user asked a question requiring live web search, but the live search request encountered a temporary error: "${searchError}".
Provide the best answer using your knowledge, noting that the live web search could not be completed and they can retry.
=== END NOTICE ===`;
    }

    // 9. Execute Text AI Provider via Registry with Failover
    onStatusUpdate?.('Preparing answer...', {
      query: searchDecision.shouldSearch ? searchDecision.query : undefined,
      sourcesCount: searchResults.length > 0 ? searchResults.length : undefined,
    });

    const registry = AIProviderRegistry.getInstance();
    const primaryProviderType: TextProviderType =
      payload.textProvider || profile.selectedTextProvider || registry.getDefaultTextType() || 'gemini';
    const fallbackProviderType: TextProviderType =
      primaryProviderType === 'gemini' ? 'groq' : 'gemini';

    let providerResponse: any;
    let fallbackUsed = false;
    let primaryError: any = null;

    try {
      const primaryProvider = registry.getTextProvider(primaryProviderType);
      providerResponse = await primaryProvider.generateResponse({
        systemPrompt: augmentedSystemPrompt,
        messages: assembled.formattedMessages,
        temperature: 0.7,
        maxTokens: 1200,
      });
    } catch (err: any) {
      console.warn(`[ChatService] Primary provider '${primaryProviderType}' failed:`, err.message);
      primaryError = err;

      // Failover 1: Secondary external provider if configured
      const fallbackProvider = registry.getTextProvider(fallbackProviderType);
      if (fallbackProvider && fallbackProvider.isConfigured) {
        console.log(`[ChatService] Attempting automatic failover to '${fallbackProviderType}'...`);
        try {
          providerResponse = await fallbackProvider.generateResponse({
            systemPrompt: augmentedSystemPrompt,
            messages: assembled.formattedMessages,
            temperature: 0.7,
            maxTokens: 1200,
          });
          fallbackUsed = true;
          console.log(`[ChatService] Failover to '${fallbackProviderType}' succeeded.`);
        } catch (fallbackErr: any) {
          console.error(
            `[ChatService] Fallback provider '${fallbackProviderType}' also failed:`,
            fallbackErr.message
          );
        }
      }

      // Failover 2: Resilient local foundation engine (ensures zero crashes for users when quota is hit)
      if (!providerResponse) {
        console.log('[ChatService] Engaging resilient JEXA foundation provider as graceful fallback...');
        const localProvider = registry.getTextProvider('development_mock');
        if (localProvider) {
          try {
            providerResponse = await localProvider.generateResponse({
              systemPrompt: augmentedSystemPrompt,
              messages: assembled.formattedMessages,
              temperature: 0.7,
              maxTokens: 1200,
            });
            fallbackUsed = true;
          } catch (localErr: any) {
            console.error('[ChatService] Foundation fallback error:', localErr);
            throw primaryError;
          }
        } else {
          throw primaryError;
        }
      }
    }

    // 10. Clean, normalize and unwrap assistant message
    const isFirstTurn = isNewConversation || (recentMessages.length <= 1);
    const userAskedIdentity = /^(who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself)\b/i.test(
      payload.message.trim()
    );

    const cleanContent = cleanAndNormalizeResponseContent(providerResponse.content, {
      isFirstTurn,
      userAskedIdentity,
    });

    // 11. Persist assistant message with search metadata & sources
    const assistantMessage = await DatabaseService.saveMessage(convId, {
      role: 'assistant',
      content: cleanContent,
      metadata: {
        model: providerResponse.model,
        provider: providerResponse.provider,
        tokens: providerResponse.tokensUsed?.total,
        isDevelopmentMock: providerResponse.isMock,
        fallbackUsed,
        originalProvider: primaryProviderType,
        memoriesReferenced: assembled.referencedMemoryIds,
        sources: searchResults.length > 0 ? searchResults : undefined,
        searchQuery: searchPerformed ? searchDecision.query : undefined,
        searchPerformed,
        searchStatus,
        searchError,
      },
    });

    // 11. Signal answer complete
    onStatusUpdate?.('Answer complete');

    // 12. Extract memories asynchronously if enabled scoped to user
    if (profile.memorySettings.autoExtract) {
      MemoryService.extractAndStoreFromMessage(payload.message, convId, payload.userId).catch((err) => {
        console.error('[MemoryService] Background memory extraction error:', err);
      });
    }

    return {
      message: assistantMessage,
      userMessage,
      conversationId: convId,
      isNewConversation,
      memoriesRetrieved: assembled.referencedMemoryIds,
    };
  }
}
