import { DatabaseService } from '../database/db-service';
import {
  MemoryItem,
  MemoryCreateInput,
  MemorySearchResult,
  MemoryExtractionResult,
  getCategoryLabel,
} from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';
import { AIActivityStatus } from '../../../shared/types/chat';
import { AIMemoryExtractor } from './ai-memory-extractor.service';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { ITextAIProvider } from '../../../ai/providers/text-provider.interface';

export class MemoryService {
  /**
   * Fast check to determine if the message contains explicit remember directives,
   * privacy requests, removal instructions, or personal disclosure.
   */
  public static detectMemoryIntent(text: string): {
    hasIntent: boolean;
    type: 'explicit' | 'privacy' | 'forget' | 'implicit' | 'none';
  } {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return { hasIntent: false, type: 'none' };
    const lower = trimmed.toLowerCase();

    if (/(?:don'?t|do\s+not|never)\s+(?:remember|save|store)|(?:off\s+the\s+record|keep\s+this\s+private)/i.test(lower)) {
      return { hasIntent: true, type: 'privacy' };
    }
    if (/(?:please\s+)?(?:forget|delete|remove|clear)\s+(?:my|the\s+memory|the\s+fact|that|about)?\b/i.test(lower)) {
      return { hasIntent: true, type: 'forget' };
    }
    if (/(?:remember\s+(?:this|that|the|following)|save\s+(?:this|to\s+memory)|this\s+is\s+important|i\s+want\s+you\s+to\s+remember|update\s+what\s+you\s+remember|note\s+that|don't\s+forget)/i.test(lower)) {
      return { hasIntent: true, type: 'explicit' };
    }

    // Natural personal statements
    const personalPatterns = [
      /(?:my\s+name\s+is|i'm\s+called|call\s+me|my\s+preferred\s+name\s+is)\b/i,
      /(?:my\s+(?:wife|husband|partner|son|daughter|kid|child|brother|sister|mother|father|mom|dad|friend|boss|coworker|dog|cat|pet))\s+(?:is|is\s+named|called)\b/i,
      /(?:i\s+live\s+in|i\s+am\s+based\s+in|i'm\s+based\s+in|i\s+moved\s+to)\b/i,
      /(?:my\s+stack\s+is|our\s+stack\s+is|we\s+build\s+with|i\s+build\s+with|i\s+code\s+in|my\s+primary\s+stack\s+is)\b/i,
      /(?:my\s+goal\s+is|our\s+goal\s+is|i\s+am\s+working\s+on|i'm\s+working\s+on|we\s+plan\s+to\s+launch)\b/i,
      /(?:i\s+work\s+as|my\s+job\s+is|i\s+work\s+at|i\s+am\s+a\s+[a-zA-Z0-9_\- ]+\s+at)\b/i,
      /(?:i\s+prefer|my\s+preference\s+is|my\s+favorite\s+[a-zA-Z0-9_\- ]+\s+is)\b/i,
      /(?:my\s+birthday\s+is|i\s+am\s+allergic\s+to|i\s+graduated\s+from)\b/i,
    ];

    if (personalPatterns.some((p) => p.test(trimmed))) {
      return { hasIntent: true, type: 'implicit' };
    }

    // Substantive personal disclosure (> 30 chars with first-person pronouns)
    if (trimmed.length >= 30 && /\b(i|my|mine|we|our)\b/i.test(trimmed) && !/^(hi|hello|how|what|why|who)\b/i.test(trimmed)) {
      return { hasIntent: true, type: 'implicit' };
    }

    return { hasIntent: false, type: 'none' };
  }

  /**
   * Retrieves memories belonging to the authenticated user and ranks them by relevance to the query.
   */
  public static async getRelevantMemories(
    query: string,
    limit: number = 8,
    userId?: string,
    recentDialogue?: string
  ): Promise<MemoryItem[]> {
    try {
      const allMemories = await DatabaseService.getMemories(userId);
      if (!allMemories || allMemories.length === 0) {
        return [];
      }
      const ranked: MemorySearchResult[] = searchRelevantMemories(
        query,
        allMemories,
        limit,
        0.4,
        recentDialogue ? { recentDialogue } : undefined
      );
      return ranked.map((r: MemorySearchResult) => r.item);
    } catch (err: any) {
      console.warn('[MemoryService] getRelevantMemories warning:', err.message);
      return [];
    }
  }

  /**
   * Searches past conversation messages belonging to the authenticated user across ALL past chats.
   * Enables JEXA to recall earlier discussions from different chats without inventing facts.
   */
  public static async searchPastConversations(
    query: string,
    userId?: string,
    excludeConversationId?: string,
    limit: number = 5
  ): Promise<Array<{
    conversationId: string;
    conversationTitle: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>> {
    return DatabaseService.searchPastMessages(userId, query, excludeConversationId, limit);
  }

  /**
   * AI-powered memory extraction pipeline:
   * Evaluates user statements with contextual intelligence, supports explicit instructions,
   * updates conflicting information, respects privacy and deletion directives, and persists to Supabase.
   */
  public static async extractAndStoreFromMessage(
    userMessage: string,
    conversationId: string,
    userId?: string,
    onStatusUpdate?: (status: AIActivityStatus, details?: any) => void,
    provider?: ITextAIProvider,
    recentDialogue?: string
  ): Promise<MemoryExtractionResult> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 3) {
      return { action: 'none', memories: [] };
    }

    try {
      // 1. Load existing memories belonging to the authenticated user for deduplication & context
      const existingMemories = await DatabaseService.getMemories(userId);

      // 2. Resolve active text provider for intelligent AI extraction if not provided
      let activeProvider = provider;
      if (!activeProvider) {
        try {
          const registry = AIProviderRegistry.getInstance();
          activeProvider = registry.getTextProvider();
        } catch {
          // Provider registry fallback
        }
      }

      // 3. Run AI Memory Extractor analysis with contextual dialogue
      onStatusUpdate?.('Identifying useful memory…');
      const decision = await AIMemoryExtractor.analyze(trimmed, existingMemories, activeProvider, recentDialogue);

      if (decision.action === 'privacy_skipped') {
        return {
          action: 'privacy_skipped',
          memories: [],
          feedbackMessage: decision.feedbackMessage || 'Understood. I will not save this to memory.',
        };
      }

      if (decision.action === 'deleted' && decision.deleteMemoryId) {
        await DatabaseService.deleteMemory(decision.deleteMemoryId, userId);
        const deletedItem = existingMemories.find((m) => m.id === decision.deleteMemoryId);
        return {
          action: 'deleted',
          memories: deletedItem ? [deletedItem] : [],
          feedbackMessage: decision.feedbackMessage || 'Memory deleted.',
          factSummary: deletedItem?.fact,
        };
      }

      if (decision.action === 'already_remembered') {
        return {
          action: 'already_remembered',
          memories: [],
          feedbackMessage: decision.feedbackMessage || 'I already remember that.',
        };
      }

      if (decision.action === 'updated' && decision.candidates.length > 0) {
        const candidate = decision.candidates[0];
        onStatusUpdate?.('Saving memory…', { memoryFact: candidate.fact });

        let updatedItem: MemoryItem;
        if (candidate.updatesMemoryId) {
          updatedItem = await DatabaseService.updateMemory(
            candidate.updatesMemoryId,
            {
              fact: candidate.fact,
              category: candidate.category,
              memoryType: candidate.memoryType || 'confirmed_fact',
              confidence: candidate.confidence,
            },
            userId
          );
        } else {
          // Fallback if target ID was not specified: find matching subject or create
          const existing = existingMemories.find((m) => m.category === candidate.category);
          if (existing) {
            updatedItem = await DatabaseService.updateMemory(
              existing.id,
              { fact: candidate.fact, confidence: candidate.confidence, memoryType: candidate.memoryType || 'confirmed_fact' },
              userId
            );
          } else {
            updatedItem = await DatabaseService.createMemory(
              {
                category: candidate.category,
                fact: candidate.fact,
                memoryType: candidate.memoryType || 'confirmed_fact',
                confidence: candidate.confidence,
                sourceConversationId: conversationId,
              },
              userId
            );
          }
        }

        const catLabel = getCategoryLabel(updatedItem.category);
        onStatusUpdate?.((`Memory updated — ${catLabel}`) as any, {
          memoryFact: candidate.fact,
          memoryAction: 'updated',
          category: updatedItem.category,
        });

        return {
          action: 'updated',
          memories: [updatedItem],
          feedbackMessage: decision.feedbackMessage || `I've updated that in your memory.`,
          factSummary: candidate.fact,
        };
      }

      if (decision.action === 'saved' && decision.candidates.length > 0) {
        const createdItems: MemoryItem[] = [];

        for (const candidate of decision.candidates) {
          onStatusUpdate?.('Saving memory…', { memoryFact: candidate.fact });

          const created = await DatabaseService.createMemory(
            {
              category: candidate.category,
              fact: candidate.fact,
              memoryType: candidate.memoryType || 'confirmed_fact',
              confidence: candidate.confidence,
              sourceConversationId: conversationId,
            },
            userId
          );
          createdItems.push(created);
        }

        const primaryFact = createdItems[0]?.fact || 'New memory';
        const primaryCat = createdItems[0]?.category || decision.candidates[0].category;
        const catLabel = getCategoryLabel(primaryCat);

        onStatusUpdate?.((`Memory saved — ${catLabel}`) as any, {
          memoryFact: primaryFact,
          memoryAction: 'saved',
          category: primaryCat,
        });

        return {
          action: 'saved',
          memories: createdItems,
          feedbackMessage: decision.feedbackMessage || `I'll remember that.`,
          factSummary: primaryFact,
        };
      }

      return { action: 'none', memories: [] };
    } catch (err: any) {
      console.error('[MemoryService] Persistence error saving memory:', err);
      onStatusUpdate?.('Memory storage unavailable', { error: err.message });
      return {
        action: 'failed',
        memories: [],
        error: err.message,
        feedbackMessage: 'Memory could not be saved due to a database persistence failure.',
      };
    }
  }

  public static async getAllMemories(userId?: string): Promise<MemoryItem[]> {
    return DatabaseService.getMemories(userId);
  }

  public static async createMemory(input: MemoryCreateInput, userId?: string): Promise<MemoryItem> {
    return DatabaseService.createMemory(input, userId);
  }

  public static async updateMemory(id: string, updates: Partial<MemoryItem>, userId?: string): Promise<MemoryItem> {
    return DatabaseService.updateMemory(id, updates, userId);
  }

  public static async deleteMemory(id: string, userId?: string): Promise<boolean> {
    return DatabaseService.deleteMemory(id, userId);
  }

  public static async getDiagnostics(userId?: string) {
    return DatabaseService.getMemoryDiagnostics(userId);
  }
}
