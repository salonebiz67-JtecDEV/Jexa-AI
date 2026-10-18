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
import { MemoryExtractionResult, ResearchHistoryItem } from '../../../shared/types/memory';

export type StatusUpdateCallback = (
  status: AIActivityStatus,
  details?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
    memoryFact?: string;
    memoryAction?: string;
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

    // 4. Retrieve Brain profile & active Text AI Provider
    const profile = await DatabaseService.getBrainProfile(payload.userId);
    const registry = AIProviderRegistry.getInstance();
    const primaryProviderType: TextProviderType =
      payload.textProvider || profile.selectedTextProvider || registry.getDefaultTextType() || 'gemini';
    const primaryProvider = registry.getTextProvider(primaryProviderType);

    // 5. Memory Management: Scoped to authenticated user across ALL conversations
    let relevantMemories: any[] = [];
    let activeMemoryResult: MemoryExtractionResult | undefined;

    if (profile.memorySettings.enabled) {
      onStatusUpdate?.('Checking memories...');
      try {
        relevantMemories = await MemoryService.getRelevantMemories(
          payload.message,
          profile.memorySettings.maxContextMemories || 8,
          payload.userId
        );
      } catch (err: any) {
        console.warn('[ChatService] Memory retrieval notice:', err.message);
        onStatusUpdate?.('Memory retrieval failed', { error: err.message });
      }

      // Check if current user message contains explicit remember instructions or durable personal facts
      const memoryIntent = MemoryService.detectMemoryIntent(payload.message);
      const isExplicitInstruction =
        memoryIntent.type === 'explicit' ||
        memoryIntent.type === 'forget' ||
        memoryIntent.type === 'privacy';
      const shouldExtract =
        isExplicitInstruction ||
        (profile.memorySettings.autoExtract && memoryIntent.hasIntent);

      if (shouldExtract) {
        try {
          activeMemoryResult = await MemoryService.extractAndStoreFromMessage(
            payload.message,
            convId,
            payload.userId,
            onStatusUpdate,
            primaryProvider
          );

          // If a memory was successfully saved or updated, include it in context memories
          if (activeMemoryResult && (activeMemoryResult.action === 'saved' || activeMemoryResult.action === 'updated')) {
            if (activeMemoryResult.memories && activeMemoryResult.memories.length > 0) {
              const newMem = activeMemoryResult.memories[0];
              const exists = relevantMemories.some((m) => m.id === newMem.id);
              if (!exists) {
                relevantMemories = [newMem, ...relevantMemories];
              }
            }
          }
        } catch (err: any) {
          console.error('[ChatService] Memory extraction/storage error:', err);
          activeMemoryResult = {
            action: 'failed',
            memories: [],
            error: err.message,
            feedbackMessage: 'Could not persist memory to database.',
          };
          onStatusUpdate?.('Memory storage unavailable', { error: err.message });
        }
      }
    }

    // 6. Cross-conversation Research History
    let relevantResearch: ResearchHistoryItem[] = [];
    try {
      relevantResearch = await DatabaseService.getResearchHistory(payload.userId, undefined, 4);
    } catch (err: any) {
      console.warn('[ChatService] Research history retrieval notice:', err.message);
    }

    // 6b. Cross-conversation Past Messages (Connected history across all chats)
    let relevantPastConversations: Array<{
      conversationId: string;
      conversationTitle: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
    }> = [];
    try {
      const isPastChatInquiry =
        /(?:past\s+conversation|earlier\s+chat|other\s+chat|previous\s+chat|what\s+have\s+i\s+told\s+you|analyze\s+my\s+past|what\s+patterns\s+do\s+you\s+notice|last\s+time\s+we\s+talked|remember\s+when|we\s+discussed|did\s+i\s+mention)/i.test(
          payload.message
        );

      const pastMsgs = await DatabaseService.searchPastMessages(
        payload.userId,
        isPastChatInquiry ? payload.message : undefined,
        convId,
        4
      );
      if (pastMsgs && pastMsgs.length > 0) {
        relevantPastConversations = pastMsgs;
      }
    } catch (err: any) {
      console.warn('[ChatService] Past messages retrieval notice:', err.message);
    }

    // 7. Planning & Intelligent Search Evaluation (Automatic AI-driven + manual fallback)
    onStatusUpdate?.('Planning...');

    const searchDecision = await SearchDecisionService.evaluate(
      payload.message,
      payload.userContext,
      primaryProvider
    );
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

        // Persist research summary into research_history
        if (searchResults.length > 0) {
          const topSources = searchResults.slice(0, 4).map((s) => ({
            title: s.title,
            url: s.url,
            domain: s.domain,
            publishedDate: s.publishedDate,
          }));
          const summarySnippet = searchResults[0].content?.slice(0, 240) || 'Verified live web results';
          DatabaseService.saveResearchHistory(
            {
              query: searchDecision.query,
              summary: summarySnippet,
              sources: topSources,
              sourceConversationId: convId,
            },
            payload.userId
          ).catch((e) => console.warn('[ChatService] Error saving research history:', e.message));
        }
      }
    } else {
      // No search needed - advance directly to information processing
      onStatusUpdate?.('Processing information...');
    }

    // 8. Fetch recent conversation history for context window
    const recentMessages = await DatabaseService.getMessages(convId);

    // 9. Assemble modular brain context
    const assembled = assembleConversationContext({
      personality: (payload.personaId as any) || profile.activePersonality,
      memories: relevantMemories,
      activeMemoryResult,
      researchHistory: relevantResearch,
      pastConversationMessages: relevantPastConversations,
      recentMessages,
      userContext: payload.userContext,
      isVoiceMode: Boolean(payload.isVoiceMode),
    });

    // 10. Inject Live Web Search context into system prompt if applicable
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
1. Synthesize the live web search results above to answer the user's inquiry thoroughly, naturally, and factually.
2. Structure research and news updates into clearly spaced sections with readable headlines (e.g. ### Headline), concise factual summaries, and publication dates when verified.
3. Keep the body text clean and readable: DO NOT dump raw URLs or repeat website links throughout your answer prose. The UI automatically displays a dedicated, collapsible, ChatGPT-style Sources section below your response with clickable cards.
4. Only include direct markdown links [Source Title](URL) inside your text if the user explicitly asked for links or websites.
5. Ground your statements strictly in the facts provided in the search results. Accurately distinguish confirmed facts from uncertainty or unverified reports. Never fabricate headlines, dates, citations, or summaries.
6. If the results do not fully address the question, honestly acknowledge what is known from the sources and note any missing details.
=== END SEARCH RESULTS ===`;
    } else if (searchPerformed && searchStatus === 'missing_key') {
      augmentedSystemPrompt += `\n\n=== LIVE WEB SEARCH NOTICE ===
The user asked a question requiring live web search (Query: "${searchDecision.query}"), but the backend server does not have TAVILY_API_KEY configured.
INSTRUCTIONS:
1. State honestly that live web search is not currently configured on the server.
2. Do not invent current real-time data or fabricate today's news.
3. Answer what you know based on your general knowledge cutoff while clearly disclaiming that live verification was unavailable.`;
    } else if (searchPerformed && searchStatus === 'failed') {
      augmentedSystemPrompt += `\n\n=== LIVE WEB SEARCH NOTICE ===
The web search for "${searchDecision.query}" encountered an error (${searchError}).
INSTRUCTIONS:
1. Inform the user that live internet search could not be completed.
2. Provide a helpful response from general knowledge, acknowledging that live sources could not be reached.`;
    }

    // 11. Prepare answer
    onStatusUpdate?.('Preparing answer...');

    let providerResponse;
    let fallbackUsed = false;

    try {
      if (!primaryProvider) {
        throw new Error(`AI Provider '${primaryProviderType}' is not available.`);
      }

      providerResponse = await primaryProvider.generateResponse({
        systemPrompt: augmentedSystemPrompt,
        messages: assembled.formattedMessages,
        temperature: 0.7,
        maxTokens: 1200,
      });
    } catch (primaryError: any) {
      console.warn(
        `[ChatService] Primary provider '${primaryProviderType}' failed:`,
        primaryError.message
      );

      // Failover 1: Alternate Cloud Provider (e.g., Gemini <-> Groq)
      const fallbackProviderType: TextProviderType =
        primaryProviderType === 'gemini' ? 'groq' : 'gemini';
      const fallbackProvider = registry.getTextProvider(fallbackProviderType);

      if (fallbackProvider) {
        try {
          console.log(`[ChatService] Attempting automatic failover to '${fallbackProviderType}'...`);
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

    // 12. Clean, normalize and unwrap assistant message
    const isFirstTurn = isNewConversation || recentMessages.length <= 1;
    const userAskedIdentity = /^(who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself)\b/i.test(
      payload.message.trim()
    );

    const cleanContent = cleanAndNormalizeResponseContent(providerResponse.content, {
      isFirstTurn,
      userAskedIdentity,
    });

    // 13. Persist assistant message with search & memory metadata
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
        memoryActionTaken: activeMemoryResult?.action,
        memoryFactSaved: activeMemoryResult?.factSummary,
        sources: searchResults.length > 0 ? searchResults : undefined,
        searchQuery: searchPerformed ? searchDecision.query : undefined,
        searchPerformed,
        searchStatus,
        searchError,
        searchDecisionCategory: searchDecision.category,
        searchDecisionReason: searchDecision.reason,
        searchTrigger: searchDecision.isManual ? 'manual' : searchPerformed ? 'automatic' : 'none',
      },
    });

    // 14. Signal answer complete
    onStatusUpdate?.('Answer complete');

    return {
      message: assistantMessage,
      userMessage,
      conversationId: convId,
      isNewConversation,
      memoriesRetrieved: assembled.referencedMemoryIds,
    };
  }
}
