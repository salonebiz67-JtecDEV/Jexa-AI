import { DatabaseService } from '../database/db-service';
import { isSupabaseConfigured } from '../database/supabase';
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
import { ErrorLogService } from './error-log.service';

export class MemoryService {
  /**
   * Fast check to determine if the message contains explicit remember directives,
   * privacy requests, or removal instructions.
   */
  public static detectMemoryIntent(text: string): {
    hasIntent: boolean;
    type: 'explicit' | 'privacy' | 'forget' | 'none';
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

    return { hasIntent: false, type: 'none' };
  }

  /**
   * Identifies questions or system/tool commands where automatic AI memory extraction
   * should be skipped to conserve tokens and avoid redundant AI calls.
   */
  public static isQuestionOrCommand(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Check for system or slash commands
    if (
      trimmed.startsWith('/') ||
      /^(?:system_check|recent_errors|check\s+(?:the\s+)?systems?|check\s+servers?|check\s+supabase|is\s+supabase\s+(?:ok|okay)|are\s+systems\s+up|error\s+logs?|any\s+(?:bugs|errors)\??|ping|status\s+check|run\s+test|diagnose)\b/i.test(trimmed)
    ) {
      return true;
    }

    // Check for questions: ends with question mark or begins with standard question phrases
    if (trimmed.endsWith('?')) {
      return true;
    }

    if (
      /^(?:what|who|where|when|why|how|which|whose|whom|can\s+you|could\s+you|would\s+you|should\s+i|should\s+you|do\s+you|did\s+you|does\s+it|is\s+it|is\s+there|are\s+there|are\s+you|will\s+it|tell\s+me\s+about|explain|describe|search\s+for|find\s+out|look\s+up)\b/i.test(
        trimmed
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Identifies casual trivial greetings and very short chit-chat that should not trigger automatic extraction.
   */
  public static isTrivialGreetingOrChitChat(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return true;
    const lower = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    const trivialPhrases = new Set([
      'hi', 'hello', 'hey', 'yo', 'howdy', 'sup', 'heya',
      'good morning', 'good afternoon', 'good evening', 'good day',
      'how are you', 'how are you doing', 'hows it going', 'whats up',
      'ok', 'okay', 'k', 'cool', 'nice', 'great', 'awesome', 'good',
      'thanks', 'thank you', 'thx', 'ty', 'bye', 'goodbye', 'cya', 'see ya',
      'lol', 'haha', 'hahaha', 'yes', 'no', 'yep', 'nope', 'sure'
    ]);
    if (trivialPhrases.has(lower)) return true;

    if (
      trimmed.length < 30 &&
      /^(?:hi|hello|hey|yo|howdy|good\s+(?:morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|thanks|thank\s+you|bye|see\s+ya)\b/i.test(trimmed) &&
      !/(?:remember|name|live|work|stack|goal|prefer|born|wife|husband|sister|brother|friend)/i.test(trimmed)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Fast ranking helper that operates on pre-fetched memories without issuing another database read.
   */
  public static rankMemories(
    query: string,
    allMemories: MemoryItem[],
    limit: number = 8,
    recentDialogue?: string
  ): MemoryItem[] {
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
      return this.rankMemories(query, allMemories, limit, recentDialogue);
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
   * Evaluates user statements with contextual intelligence, supports multiple facts per message,
   * updates conflicting information, respects privacy directives, and persists to Supabase.
   */
  public static async extractAndStoreFromMessage(
    userMessage: string,
    conversationId: string,
    userId?: string,
    onStatusUpdate?: (status: AIActivityStatus, details?: any) => void,
    provider?: ITextAIProvider,
    recentDialogue?: string,
    providedMemories?: MemoryItem[]
  ): Promise<MemoryExtractionResult> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 3) {
      return { action: 'none', memories: [] };
    }

    // Skip pure trivial greetings and pleasantries
    if (this.isTrivialGreetingOrChitChat(trimmed)) {
      const memoryIntent = this.detectMemoryIntent(trimmed);
      if (memoryIntent.type === 'none') {
        return { action: 'none', memories: [] };
      }
    }

    const isProduction =
      process.env.NODE_ENV === 'production' ||
      Boolean(process.env.RENDER);

    if (isProduction && !isSupabaseConfigured) {
      const reason = 'Permanent memory storage is unavailable because Supabase is not configured in production (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).';
      console.warn('[MemoryService] ' + reason);
      onStatusUpdate?.('Memory storage unavailable', { error: reason });
      return {
        action: 'failed',
        memories: [],
        error: reason,
        feedbackMessage: 'Memory storage is currently unavailable in production because database credentials are not configured.',
      };
    }

    try {
      // 1. Re-use existing memories if provided, or load once
      const existingMemories = providedMemories || (await DatabaseService.getMemories(userId));

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

      if ((decision.action === 'saved' || decision.action === 'updated') && decision.candidates.length > 0) {
        const processedItems: MemoryItem[] = [];

        for (const candidate of decision.candidates) {
          onStatusUpdate?.('Saving memory…', { memoryFact: candidate.fact });

          if (candidate.updatesMemoryId) {
            const updated = await DatabaseService.updateMemory(
              candidate.updatesMemoryId,
              {
                fact: candidate.fact,
                category: candidate.category,
                memoryType: candidate.memoryType || 'confirmed_fact',
                confidence: candidate.confidence,
              },
              userId
            );
            processedItems.push(updated);
          } else {
            // Check if there is an existing memory with same category & starting fact to update
            const existing = existingMemories.find((m) =>
              m.category === candidate.category &&
              m.fact.toLowerCase().slice(0, 30) === candidate.fact.toLowerCase().slice(0, 30)
            );
            if (existing) {
              const updated = await DatabaseService.updateMemory(
                existing.id,
                {
                  fact: candidate.fact,
                  memoryType: candidate.memoryType || 'confirmed_fact',
                  confidence: candidate.confidence,
                },
                userId
              );
              processedItems.push(updated);
            } else {
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
              processedItems.push(created);
            }
          }
        }

        const primaryCat = processedItems[0]?.category || decision.candidates[0].category;
        const catLabel = getCategoryLabel(primaryCat);
        const actionLabel = decision.action === 'updated' ? 'Memory updated' : 'Memory saved';
        const displayLabel = processedItems.length > 1
          ? `${actionLabel} — ${catLabel} (${processedItems.length} facts)`
          : `${actionLabel} — ${catLabel}`;

        onStatusUpdate?.(displayLabel as any, {
          memoryFact: processedItems.map((m) => m.fact).join('; '),
          memoryAction: decision.action,
          category: primaryCat,
        });

        return {
          action: decision.action,
          memories: processedItems,
          feedbackMessage: decision.feedbackMessage || (decision.action === 'updated' ? `I've updated that in your memory.` : `I'll remember that.`),
          factSummary: processedItems.map((m) => m.fact).join('; '),
        };
      }

      return { action: 'none', memories: [] };
    } catch (err: any) {
      const errStr = String(err?.message || err?.details || err || '').toLowerCase();
      const isRateLimit =
        err?.status === 429 ||
        err?.statusCode === 429 ||
        err?.code === 429 ||
        err?.code === 'RESOURCE_EXHAUSTED' ||
        /rate[-_\s]?limit|quota|resource_exhausted|too\s+many\s+requests|high\s+demand/i.test(errStr);

      if (isRateLimit) {
        console.warn('[MemoryService] AI Provider rate limit encountered during memory extraction. Skipping extraction silently.');
        return { action: 'none', memories: [] };
      }

      console.error('[MemoryService] Persistence error saving memory:', err);
      ErrorLogService.log('memory', err, { userId, conversationId });
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
