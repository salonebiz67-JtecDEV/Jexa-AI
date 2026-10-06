import { DatabaseService } from '../database/db-service';
import { MemoryService } from './memory.service';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { assembleConversationContext } from '../../../ai/brain/context-handler';
import { SendMessagePayload, ChatResponsePayload, ChatMessage } from '../../../shared/types/chat';
import { ProviderError, TextProviderType } from '../../../shared/types/provider';

export class ChatService {
  public static async processMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    let convId = payload.conversationId;
    let isNewConversation = false;

    // 1. Resolve or create conversation
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

    // 2. Persist user message
    const userMessage = await DatabaseService.saveMessage(convId, {
      role: 'user',
      content: payload.message,
    });

    // 3. Retrieve relevant memories & brain profile scoped to authenticated user
    const profile = await DatabaseService.getBrainProfile(payload.userId);
    const relevantMemories = profile.memorySettings.enabled
      ? await MemoryService.getRelevantMemories(payload.message, profile.memorySettings.maxContextMemories, payload.userId)
      : [];

    // 4. Fetch recent conversation history for context window
    const recentMessages = await DatabaseService.getMessages(convId);

    // 5. Assemble modular brain context
    const assembled = assembleConversationContext({
      personality: (payload.personaId as any) || profile.activePersonality,
      memories: relevantMemories,
      recentMessages,
      userContext: payload.userContext,
      isVoiceMode: Boolean(payload.isVoiceMode),
    });

    // 6. Execute Text AI Provider via Registry with Failover
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
        systemPrompt: assembled.systemPrompt,
        messages: assembled.formattedMessages,
        temperature: 0.7,
        maxTokens: 1024,
      });
    } catch (err: any) {
      console.warn(`[ChatService] Primary provider '${primaryProviderType}' failed:`, err.message);
      primaryError = err;

      // Failover to secondary text provider if configured
      const fallbackProvider = registry.getTextProvider(fallbackProviderType);
      if (fallbackProvider && fallbackProvider.isConfigured) {
        console.log(`[ChatService] Attempting automatic failover to '${fallbackProviderType}'...`);
        try {
          providerResponse = await fallbackProvider.generateResponse({
            systemPrompt: assembled.systemPrompt,
            messages: assembled.formattedMessages,
            temperature: 0.7,
            maxTokens: 1024,
          });
          fallbackUsed = true;
          console.log(`[ChatService] Failover to '${fallbackProviderType}' succeeded.`);
        } catch (fallbackErr: any) {
          console.error(
            `[ChatService] Fallback provider '${fallbackProviderType}' also failed:`,
            fallbackErr.message
          );
          throw primaryError;
        }
      } else {
        throw primaryError;
      }
    }

    // 7. Persist assistant message
    const assistantMessage = await DatabaseService.saveMessage(convId, {
      role: 'assistant',
      content: providerResponse.content,
      metadata: {
        model: providerResponse.model,
        provider: providerResponse.provider,
        tokens: providerResponse.tokensUsed?.total,
        isDevelopmentMock: providerResponse.isMock,
        fallbackUsed,
        originalProvider: primaryProviderType,
        memoriesReferenced: assembled.referencedMemoryIds,
      },
    });

    // 8. Extract memories asynchronously if enabled scoped to user
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
