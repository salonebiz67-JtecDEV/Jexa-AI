import { DatabaseService } from '../database/db-service';
import {
  MemoryItem,
  MemoryCreateInput,
  MemorySearchResult,
  MemoryCategory,
  MemoryExtractionResult,
} from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';
import { AIActivityStatus } from '../../../shared/types/chat';

// Common casual / ephemeral words that indicate low-value chatter rather than durable memory
const CASUAL_GREETINGS_PATTERN =
  /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|ok|okay|cool|nice|thanks|thank\s+you|bye|see\s+ya|haha|lol)\b/i;

// Explicit privacy request pattern: User requests NOT to save or remember something
const PRIVACY_REQUEST_PATTERN =
  /(?:don'?t|do\s+not|never)\s+(?:remember|save|store)\s+(?:this|that|my)?|(?:off\s+the\s+record|keep\s+this\s+private|do\s+not\s+save\s+to\s+memory|don'?t\s+save\s+to\s+memory)/i;

// Explicit forget or removal request pattern
const FORGET_REQUEST_PATTERN =
  /(?:forget|delete|remove|clear)\s+(?:my|the\s+memory\s+of|the\s+fact\s+that|that|about)\s+(.+)/i;

// Comprehensive explicit memory triggers
const EXPLICIT_MEMORY_TRIGGERS = [
  /^(?:please\s+)?remember\s+(?:this|that|the\s+following)?[;:]?\s*(.+)/i,
  /^(?:please\s+)?save\s+(?:this\s+information|this\s+fact|this\s+to\s+memory|this)?[;:]?\s*(.+)/i,
  /^(?:this\s+is\s+important)[;:]?\s*(.+)/i,
  /^(?:i\s+want\s+you\s+to\s+remember\s+(?:that)?)[;:]?\s*(.+)/i,
  /^(?:update\s+what\s+you\s+remember\s+about\s+me)[;:]?\s*(.+)/i,
  /^(?:don'?t\s+forget\s+(?:that)?)[;:]?\s*(.+)/i,
  /^(?:keep\s+in\s+mind\s+(?:that)?)[;:]?\s*(.+)/i,
  /^(?:note\s+that)[;:]?\s*(.+)/i,
  /^(?:save\s+to\s+memory)[;:]?\s*(.+)/i,
];

export class MemoryService {
  /**
   * Fast check to determine if the message contains explicit remember directives,
   * privacy requests, removal instructions, or obvious personal disclosure.
   */
  public static detectMemoryIntent(text: string): {
    hasIntent: boolean;
    type: 'explicit' | 'privacy' | 'forget' | 'implicit' | 'none';
  } {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 4) return { hasIntent: false, type: 'none' };
    const lower = trimmed.toLowerCase();

    if (PRIVACY_REQUEST_PATTERN.test(lower)) {
      return { hasIntent: true, type: 'privacy' };
    }
    if (FORGET_REQUEST_PATTERN.test(trimmed)) {
      return { hasIntent: true, type: 'forget' };
    }
    for (const pattern of EXPLICIT_MEMORY_TRIGGERS) {
      if (pattern.test(trimmed)) {
        return { hasIntent: true, type: 'explicit' };
      }
    }

    // Implicit personal facts check
    const implicitPatterns = [
      /(?:my\s+name\s+is|i'm\s+called|call\s+me|my\s+preferred\s+name\s+is)\b/i,
      /(?:my\s+(?:wife|husband|partner|son|daughter|kid|child|brother|sister|mother|father|mom|dad|friend|boss|coworker|dog|cat|pet))\s+(?:is|is\s+named|called)\b/i,
      /(?:i\s+live\s+in|i\s+am\s+based\s+in|i'm\s+based\s+in|i\s+moved\s+to)\b/i,
      /(?:my\s+stack\s+is|our\s+stack\s+is|we\s+build\s+with|i\s+build\s+with|i\s+code\s+in|my\s+primary\s+stack\s+is)\b/i,
      /(?:my\s+goal\s+is|our\s+goal\s+is|i\s+am\s+working\s+on|i'm\s+working\s+on|we\s+plan\s+to\s+launch)\b/i,
      /(?:i\s+work\s+as|my\s+job\s+is|i\s+am\s+a\s+[a-zA-Z0-9_\- ]+\s+at)\b/i,
      /(?:i\s+prefer|my\s+preference\s+is|my\s+favorite\s+[a-zA-Z0-9_\- ]+\s+is)\b/i,
      /(?:my\s+birthday\s+is|i\s+am\s+allergic\s+to|i\s+graduated\s+from)\b/i,
    ];

    if (implicitPatterns.some((p) => p.test(trimmed))) {
      return { hasIntent: true, type: 'implicit' };
    }

    return { hasIntent: false, type: 'none' };
  }

  /**
   * Retrieves memories belonging to the authenticated user and ranks them by relevance to the query.
   */
  public static async getRelevantMemories(
    query: string,
    limit: number = 6,
    userId?: string
  ): Promise<MemoryItem[]> {
    try {
      const allMemories = await DatabaseService.getMemories(userId);
      if (!allMemories || allMemories.length === 0) {
        return [];
      }
      const ranked: MemorySearchResult[] = searchRelevantMemories(query, allMemories, limit);
      return ranked.map((r: MemorySearchResult) => r.item);
    } catch (err: any) {
      console.warn('[MemoryService] getRelevantMemories warning:', err.message);
      return [];
    }
  }

  /**
   * Evaluates incoming user messages with selective intelligence.
   * Respects user privacy, prevents duplicate memories, performs memory updates,
   * handles removal directives, and persists verified memories to Supabase.
   */
  public static async extractAndStoreFromMessage(
    userMessage: string,
    conversationId: string,
    userId?: string,
    onStatusUpdate?: (status: AIActivityStatus, details?: any) => void
  ): Promise<MemoryExtractionResult> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 3) {
      return { action: 'none', memories: [] };
    }

    const lower = trimmed.toLowerCase();

    // 1. PRIVACY CHECK: User explicitly requested NOT to remember or save
    if (PRIVACY_REQUEST_PATTERN.test(lower)) {
      return {
        action: 'privacy_skipped',
        memories: [],
        feedbackMessage: 'Understood. I will not save this to memory.',
      };
    }

    // 2. FORGET / REMOVAL DIRECTIVE: User asked to forget or remove a memory
    const forgetMatch = trimmed.match(FORGET_REQUEST_PATTERN);
    if (forgetMatch && forgetMatch[1]) {
      const subject = forgetMatch[1].trim().toLowerCase().replace(/[.?!]+$/, '');
      try {
        const existingMemories = await DatabaseService.getMemories(userId);
        const match = existingMemories.find(
          (m) =>
            m.fact.toLowerCase().includes(subject) ||
            subject.split(' ').every((w) => m.fact.toLowerCase().includes(w))
        );

        if (match) {
          await DatabaseService.deleteMemory(match.id, userId);
          return {
            action: 'deleted',
            memories: [match],
            feedbackMessage: `I have removed "${match.fact}" from your memory.`,
            factSummary: match.fact,
          };
        }
      } catch (err: any) {
        console.error('[MemoryService] Forget memory error:', err);
        return {
          action: 'failed',
          memories: [],
          error: err.message,
          feedbackMessage: 'Could not remove memory from database.',
        };
      }
    }

    // 3. Filter out pure casual greetings or ephemeral pleasantries without memory content
    if (
      CASUAL_GREETINGS_PATTERN.test(lower) &&
      trimmed.length < 35 &&
      !lower.includes('remember') &&
      !lower.includes('my name') &&
      !lower.includes('save')
    ) {
      return { action: 'none', memories: [] };
    }

    try {
      const existingMemories = await DatabaseService.getMemories(userId);

      // Helper to check existing memories for updates vs duplicates
      const findExisting = (predicate: (m: MemoryItem) => boolean): MemoryItem | undefined => {
        return existingMemories.find(predicate);
      };

      // 4. PRIORITY 1: Explicit Remember Directives
      for (const pattern of EXPLICIT_MEMORY_TRIGGERS) {
        const match = trimmed.match(pattern);
        if (match && match[1]?.trim() && match[1].trim().length > 2) {
          const rawDirective = match[1].trim().replace(/^[;:\-\s]+/, '').replace(/[.?!]+$/, '');
          const factSummary = rawDirective.slice(0, 200);

          onStatusUpdate?.('Saving memory...', { memoryFact: factSummary });

          // Determine category based on content
          let cat: MemoryCategory = 'user_fact';
          const rLower = rawDirective.toLowerCase();
          if (/(?:prefer|preference|favorite|like|dislike)/i.test(rLower)) cat = 'preference';
          else if (/(?:goal|plan|building|working on|aim|launch)/i.test(rLower)) cat = 'goal';
          else if (/(?:wife|husband|partner|son|daughter|kid|brother|sister|mother|father|mom|dad|dog|cat|pet)/i.test(rLower)) cat = 'relationship';
          else if (/(?:graduated|born|anniversary|wedding|hired|founded)/i.test(rLower)) cat = 'milestone';
          else if (/(?:hobby|play|interest|guitar|chess|gaming|music)/i.test(rLower)) cat = 'interest';

          const newFact = `User note: "${factSummary}".`;

          // Deduplication: Check if identical or very similar fact already exists
          const existingMatch = findExisting((m) => {
            const mFact = m.fact.toLowerCase();
            return mFact.includes(rLower.slice(0, 30)) || rLower.includes(mFact.slice(0, 30));
          });

          if (existingMatch) {
            if (existingMatch.fact.toLowerCase() === newFact.toLowerCase()) {
              return {
                action: 'already_remembered',
                memories: [existingMatch],
                feedbackMessage: `I already have this noted in your memory.`,
                factSummary,
              };
            }

            const updated = await DatabaseService.updateMemory(
              existingMatch.id,
              { fact: newFact, category: cat, confidence: 0.98 },
              userId
            );

            onStatusUpdate?.('Memory updated', { memoryFact: factSummary, memoryAction: 'updated' });
            return {
              action: 'updated',
              memories: [updated],
              feedbackMessage: `I've updated that note in your memory.`,
              factSummary,
            };
          }

          const created = await DatabaseService.createMemory(
            {
              category: cat,
              fact: newFact,
              confidence: 0.98,
              sourceConversationId: conversationId,
            },
            userId
          );

          onStatusUpdate?.('Memory saved', { memoryFact: factSummary, memoryAction: 'saved' });
          return {
            action: 'saved',
            memories: [created],
            feedbackMessage: `I'll remember that.`,
            factSummary,
          };
        }
      }

      // 5. PRIORITY 2: Structured Personal Details

      // A. Preferred Name / Identity
      if (
        lower.includes('my name is') ||
        lower.includes("i'm called") ||
        lower.includes('call me') ||
        lower.includes('my preferred name is')
      ) {
        const match = trimmed.match(
          /(?:my name is|i'm called|call me|my preferred name is)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and|\s+remember)/i
        );
        if (match && match[1]?.trim() && match[1].trim().length > 1) {
          const rawName = match[1].trim().replace(/[.?!]+$/, '');
          const newFact = `User's preferred name is ${rawName}.`;

          onStatusUpdate?.('Saving memory...', { memoryFact: `Preferred name: ${rawName}` });

          const existingName = findExisting(
            (m) =>
              m.category === 'user_fact' &&
              (m.fact.toLowerCase().includes("user's preferred name is") ||
                m.fact.toLowerCase().includes("user's name is"))
          );

          if (existingName) {
            if (existingName.fact.toLowerCase() === newFact.toLowerCase()) {
              return {
                action: 'already_remembered',
                memories: [existingName],
                feedbackMessage: `I already remember that your name is ${rawName}.`,
                factSummary: newFact,
              };
            }
            const updated = await DatabaseService.updateMemory(
              existingName.id,
              { fact: newFact, confidence: 0.99 },
              userId
            );
            onStatusUpdate?.('Memory updated', { memoryFact: `Preferred name: ${rawName}` });
            return {
              action: 'updated',
              memories: [updated],
              feedbackMessage: `I've updated your name in memory to ${rawName}.`,
              factSummary: newFact,
            };
          }

          const created = await DatabaseService.createMemory(
            {
              category: 'user_fact',
              fact: newFact,
              confidence: 0.99,
              sourceConversationId: conversationId,
            },
            userId
          );
          onStatusUpdate?.('Memory saved', { memoryFact: `Preferred name: ${rawName}` });
          return {
            action: 'saved',
            memories: [created],
            feedbackMessage: `I'll remember that your preferred name is ${rawName}.`,
            factSummary: newFact,
          };
        }
      }

      // B. Relationships & Family & Pets
      const relPattern =
        /(?:my\s+(wife|husband|partner|son|daughter|kid|child|brother|sister|mother|father|mom|dad|friend|boss|coworker|dog|cat|pet))\s+(?:is|is\s+named|called)\s+([a-zA-Z0-9_\- ]+)/i;
      const relMatch = trimmed.match(relPattern);
      if (relMatch && relMatch[1] && relMatch[2]) {
        const relation = relMatch[1].toLowerCase();
        const personName = relMatch[2].trim().replace(/[.?!]+$/, '');
        const newFact = `User's ${relation} is ${personName}.`;

        onStatusUpdate?.('Saving memory...', { memoryFact: `${relation}: ${personName}` });

        const existingRel = findExisting(
          (m) => m.category === 'relationship' && m.fact.toLowerCase().includes(`user's ${relation} is`)
        );

        if (existingRel) {
          if (existingRel.fact.toLowerCase() === newFact.toLowerCase()) {
            return { action: 'already_remembered', memories: [existingRel], factSummary: newFact };
          }
          const updated = await DatabaseService.updateMemory(
            existingRel.id,
            { fact: newFact, confidence: 0.96 },
            userId
          );
          onStatusUpdate?.('Memory updated', { memoryFact: `${relation}: ${personName}` });
          return {
            action: 'updated',
            memories: [updated],
            feedbackMessage: `I've updated your ${relation}'s name in memory to ${personName}.`,
            factSummary: newFact,
          };
        }

        const created = await DatabaseService.createMemory(
          {
            category: 'relationship',
            fact: newFact,
            confidence: 0.96,
            sourceConversationId: conversationId,
          },
          userId
        );
        onStatusUpdate?.('Memory saved', { memoryFact: `${relation}: ${personName}` });
        return {
          action: 'saved',
          memories: [created],
          feedbackMessage: `I'll remember that your ${relation} is ${personName}.`,
          factSummary: newFact,
        };
      }

      // C. Location & Residence
      if (
        lower.includes('i live in') ||
        lower.includes('i am based in') ||
        lower.includes("i'm based in") ||
        lower.includes('i moved to')
      ) {
        const match = trimmed.match(
          /(?:i live in|i am based in|i'm based in|i moved to)\s+([a-zA-Z0-9_\- ,]+?)(?:\.|$|!|\s+and)/i
        );
        if (match && match[1]?.trim() && match[1].trim().length > 2) {
          const loc = match[1].trim().replace(/[.?!]+$/, '');
          const newFact = `User lives in ${loc}.`;

          onStatusUpdate?.('Saving memory...', { memoryFact: `Location: ${loc}` });

          const existingLoc = findExisting(
            (m) => m.category === 'user_fact' && m.fact.toLowerCase().includes('user lives in')
          );

          if (existingLoc) {
            if (existingLoc.fact.toLowerCase() === newFact.toLowerCase()) {
              return { action: 'already_remembered', memories: [existingLoc], factSummary: newFact };
            }
            const updated = await DatabaseService.updateMemory(
              existingLoc.id,
              { fact: newFact, confidence: 0.95 },
              userId
            );
            onStatusUpdate?.('Memory updated', { memoryFact: `Location: ${loc}` });
            return {
              action: 'updated',
              memories: [updated],
              feedbackMessage: `I've updated your location in memory to ${loc}.`,
              factSummary: newFact,
            };
          }

          const created = await DatabaseService.createMemory(
            {
              category: 'user_fact',
              fact: newFact,
              confidence: 0.95,
              sourceConversationId: conversationId,
            },
            userId
          );
          onStatusUpdate?.('Memory saved', { memoryFact: `Location: ${loc}` });
          return {
            action: 'saved',
            memories: [created],
            feedbackMessage: `I'll remember that you live in ${loc}.`,
            factSummary: newFact,
          };
        }
      }

      // D. Technical Stack & Tooling
      const techStackKeywords = [
        'my stack is',
        'our stack is',
        'we build with',
        'i build with',
        'i code in',
        'my primary stack is',
        'our tech stack is',
        'using typescript and react',
        'using python and postgresql',
      ];
      const hasTechStack = techStackKeywords.some((kw) => lower.includes(kw));
      if (hasTechStack && trimmed.length >= 12) {
        const cleanStack = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim().replace(/[.?!]+$/, '');
        const newFact = `Technical stack & tooling: "${cleanStack.slice(0, 160)}".`;

        onStatusUpdate?.('Saving memory...', { memoryFact: 'Technical stack & tooling' });

        const existingStack = findExisting(
          (m) => m.category === 'user_fact' && m.fact.toLowerCase().includes('technical stack')
        );

        if (existingStack) {
          const updated = await DatabaseService.updateMemory(
            existingStack.id,
            { fact: newFact, confidence: 0.94 },
            userId
          );
          onStatusUpdate?.('Memory updated', { memoryFact: 'Technical stack updated' });
          return {
            action: 'updated',
            memories: [updated],
            feedbackMessage: `I've updated your technical stack in memory.`,
            factSummary: newFact,
          };
        }

        const created = await DatabaseService.createMemory(
          {
            category: 'user_fact',
            fact: newFact,
            confidence: 0.94,
            sourceConversationId: conversationId,
          },
          userId
        );
        onStatusUpdate?.('Memory saved', { memoryFact: 'Technical stack saved' });
        return {
          action: 'saved',
          memories: [created],
          feedbackMessage: `I've saved your technical stack to memory.`,
          factSummary: newFact,
        };
      }

      // E. Career / Occupation
      if (
        (lower.includes('i work as') ||
          lower.includes('my job is') ||
          lower.includes('i work at') ||
          lower.includes('i am a software') ||
          lower.includes("i'm a software") ||
          lower.includes('i am an engineer') ||
          lower.includes("i'm an engineer") ||
          lower.includes('i am a founder') ||
          lower.includes("i'm a founder") ||
          lower.includes('i study') ||
          lower.includes('i am a student')) &&
        trimmed.length >= 12
      ) {
        const cleanJob = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim().replace(/[.?!]+$/, '');
        const newFact = `User occupation / role: "${cleanJob.slice(0, 150)}".`;

        onStatusUpdate?.('Saving memory...', { memoryFact: 'Occupation / role' });

        const existingJob = findExisting(
          (m) => m.category === 'user_fact' && m.fact.toLowerCase().includes('user occupation')
        );

        if (existingJob) {
          const updated = await DatabaseService.updateMemory(
            existingJob.id,
            { fact: newFact, confidence: 0.93 },
            userId
          );
          onStatusUpdate?.('Memory updated', { memoryFact: 'Occupation updated' });
          return {
            action: 'updated',
            memories: [updated],
            feedbackMessage: `I've updated your professional role in memory.`,
            factSummary: newFact,
          };
        }

        const created = await DatabaseService.createMemory(
          {
            category: 'user_fact',
            fact: newFact,
            confidence: 0.93,
            sourceConversationId: conversationId,
          },
          userId
        );
        onStatusUpdate?.('Memory saved', { memoryFact: 'Occupation saved' });
        return { action: 'saved', memories: [created], factSummary: newFact };
      }

      // F. Goals & Project Ambitions
      if (
        (lower.includes('my goal is') ||
          lower.includes('our goal is') ||
          lower.includes('i am working on') ||
          lower.includes("i'm working on") ||
          lower.includes('we plan to launch') ||
          lower.includes('my project is')) &&
        trimmed.length >= 14
      ) {
        const newFact = `User goal / project: "${trimmed.slice(0, 160)}".`;

        onStatusUpdate?.('Saving memory...', { memoryFact: 'Project / goal' });

        const created = await DatabaseService.createMemory(
          {
            category: 'goal',
            fact: newFact,
            confidence: 0.92,
            sourceConversationId: conversationId,
          },
          userId
        );
        onStatusUpdate?.('Memory saved', { memoryFact: 'Goal saved' });
        return { action: 'saved', memories: [created], factSummary: newFact };
      }

      // G. User Preferences
      if (
        (lower.includes('i prefer') ||
          lower.includes('my preference is') ||
          lower.includes('i always like to') ||
          lower.includes('my favorite') ||
          lower.includes('my favourite')) &&
        !lower.includes('eating') &&
        !lower.includes('right now') &&
        !lower.includes('today')
      ) {
        const factClean = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim().replace(/[.?!]+$/, '');
        const newFact = `User preference: "${factClean.slice(0, 140)}".`;

        onStatusUpdate?.('Saving memory...', { memoryFact: 'User preference' });

        const created = await DatabaseService.createMemory(
          {
            category: 'preference',
            fact: newFact,
            confidence: 0.91,
            sourceConversationId: conversationId,
          },
          userId
        );
        onStatusUpdate?.('Memory saved', { memoryFact: 'Preference saved' });
        return { action: 'saved', memories: [created], factSummary: newFact };
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
}
