import { DatabaseService } from '../database/db-service';
import { MemoryService } from './memory.service';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { assembleConversationContext } from '../../../ai/brain/context-handler';
import { SendMessagePayload, ChatResponsePayload, ChatMessage } from '../../../shared/types/chat';

export class ChatService {
  public static async processMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    let convId = payload.conversationId;
    let isNewConversation = false;

    // 1. Resolve or create conversation
    if (!convId) {
      const title = payload.message.slice(0, 30) || 'New Conversation';
      const newConv = await DatabaseService.createConversation(title, payload.personaId);
      convId = newConv.id;
      isNewConversation = true;
    } else {
      const existing = await DatabaseService.getConversation(convId);
      if (!existing) {
        const newConv = await DatabaseService.createConversation('New Conversation', payload.personaId);
        convId = newConv.id;
        isNewConversation = true;
      }
    }

    // 2. Persist user message
    await DatabaseService.saveMessage(convId, {
      role: 'user',
      content: payload.message,
    });

    // 3. Retrieve relevant memories & brain profile
    const profile = await DatabaseService.getBrainProfile();
    const relevantMemories = profile.memorySettings.enabled
      ? await MemoryService.getRelevantMemories(payload.message, profile.memorySettings.maxContextMemories)
      : [];

    // 4. Fetch recent conversation history for context window
    const recentMessages = await DatabaseService.getMessages(convId);

    // 5. Assemble modular brain context
    const assembled = assembleConversationContext({
      personality: (payload.personaId as any) || profile.activePersonality,
      memories: relevantMemories,
      recentMessages,
      userContext: payload.userContext,
      isVoiceMode: false,
    });

    // 6. Execute Text AI Provider via Registry
    const registry = AIProviderRegistry.getInstance();
    const textProvider = registry.getTextProvider();

    const providerResponse = await textProvider.generateResponse({
      systemPrompt: assembled.systemPrompt,
      messages: assembled.formattedMessages,
      temperature: 0.7,
      maxTokens: 1024,
    });

    // 7. Persist assistant message
    const assistantMessage = await DatabaseService.saveMessage(convId, {
      role: 'assistant',
      content: providerResponse.content,
      metadata: {
        model: providerResponse.model,
        tokens: providerResponse.tokensUsed?.total,
        isDevelopmentMock: providerResponse.isMock,
        memoriesReferenced: assembled.referencedMemoryIds,
      },
    });

    // 8. Extract memories asynchronously if enabled
    if (profile.memorySettings.autoExtract) {
      MemoryService.extractAndStoreFromMessage(payload.message, convId).catch((err) => {
        console.error('[MemoryService] Background memory extraction error:', err);
      });
    }

    return {
      message: assistantMessage,
      conversationId: convId,
      isNewConversation,
      memoriesRetrieved: assembled.referencedMemoryIds,
    };
  }
}
