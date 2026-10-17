import { DatabaseService } from '../database/db-service';
import { MemoryItem, MemoryCreateInput, MemorySearchResult, MemoryCategory } from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';

// Common casual / ephemeral words that indicate low-value chatter rather than durable memory
const CASUAL_GREETINGS_PATTERN =
  /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|ok|okay|cool|nice|thanks|thank\s+you|bye|see\s+ya|haha|lol)\b/i;

// Explicit privacy request pattern: User requests NOT to save or remember something
const PRIVACY_REQUEST_PATTERN =
  /(?:don'?t|do\s+not|never)\s+(?:remember|save|store)\s+(?:this|that|my)?|(?:off\s+the\s+record|keep\s+this\s+private|do\s+not\s+save\s+to\s+memory|don'?t\s+save\s+to\s+memory)/i;

// Explicit forget or removal request pattern
const FORGET_REQUEST_PATTERN =
  /(?:forget|delete|remove|clear)\s+(?:my|the\s+memory\s+of|the\s+fact\s+that|that|about)\s+(.+)/i;

export interface MemoryExtractionResult {
  action: 'saved' | 'updated' | 'deleted' | 'already_remembered' | 'privacy_skipped' | 'none' | 'failed';
  memories: MemoryItem[];
  feedbackMessage?: string;
  error?: string;
}

export class MemoryService {
  /**
   * Retrieves memories belonging to the authenticated user and ranks them by relevance to the query.
   */
  public static async getRelevantMemories(
    query: string,
    limit: number = 5,
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
    userId?: string
  ): Promise<MemoryExtractionResult> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 4) {
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
        const match = existingMemories.find((m) =>
          m.fact.toLowerCase().includes(subject) ||
          subject.split(' ').every((w) => m.fact.toLowerCase().includes(w))
        );

        if (match) {
          await DatabaseService.deleteMemory(match.id, userId);
          return {
            action: 'deleted',
            memories: [match],
            feedbackMessage: `I have removed "${match.fact}" from your memory.`,
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
    if (CASUAL_GREETINGS_PATTERN.test(lower) && trimmed.length < 35 && !lower.includes('remember') && !lower.includes('my name')) {
      return { action: 'none', memories: [] };
    }

    try {
      const existingMemories = await DatabaseService.getMemories(userId);

      // Helper to check existing memories for updates vs duplicates
      const findExisting = (predicate: (m: MemoryItem) => boolean): MemoryItem | undefined => {
        return existingMemories.find(predicate);
      };

      // A. Preferred Name / Identity
      if (
        lower.includes('my name is') ||
        lower.includes("i'm called") ||
        lower.includes('call me') ||
        lower.includes('my preferred name is')
      ) {
        const match = trimmed.match(/(?:my name is|i'm called|call me|my preferred name is)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and|\s+remember)/i);
        if (match && match[1]?.trim() && match[1].trim().length > 1) {
          const rawName = match[1].trim().replace(/[.?!]+$/, '');
          const newFact = `User's preferred name is ${rawName}.`;

          // Check if user already has a name memory
          const existingNameMemory = findExisting(
            (m) => m.category === 'user_fact' && (m.fact.toLowerCase().includes("user's name is") || m.fact.toLowerCase().includes("preferred name is"))
          );

          if (existingNameMemory) {
            if (existingNameMemory.fact.toLowerCase() === newFact.toLowerCase()) {
              return { action: 'already_remembered', memories: [existingNameMemory], feedbackMessage: `I already remember that your name is ${rawName}.` };
            }
            const updated = await DatabaseService.updateMemory(
              existingNameMemory.id,
              { fact: newFact, confidence: 0.99 },
              userId
            );
            return { action: 'updated', memories: [updated], feedbackMessage: `I've updated your name in memory to ${rawName}.` };
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
          return { action: 'saved', memories: [created], feedbackMessage: `I'll remember that your preferred name is ${rawName}.` };
        }
      }

      // B. Explicit Memory Directive ("Remember that...", "Please remember...", "Note that...")
      if (
        lower.includes('remember that') ||
        lower.includes('remember:') ||
        lower.includes("don't forget that") ||
        lower.includes('please remember') ||
        lower.includes('keep in mind that') ||
        lower.includes('note that')
      ) {
        const match = trimmed.match(/(?:remember that|remember:|don't forget that|please remember|keep in mind that|note that)\s+(.+?)(?:\.|$|!)/i);
        if (match && match[1]?.trim() && match[1].trim().length > 3) {
          const rawFact = match[1].trim().replace(/[.?!]+$/, '');
          const newFact = `User note: "${rawFact.slice(0, 160)}".`;

          // Check for existing similar note
          const existingNote = findExisting(
            (m) => m.fact.toLowerCase().includes(rawFact.toLowerCase().slice(0, 30))
          );

          if (existingNote) {
            const updated = await DatabaseService.updateMemory(
              existingNote.id,
              { fact: newFact, confidence: 0.96 },
              userId
            );
            return { action: 'updated', memories: [updated], feedbackMessage: `I've updated that note in your memory.` };
          }

          const created = await DatabaseService.createMemory(
            {
              category: 'user_fact',
              fact: newFact,
              confidence: 0.96,
              sourceConversationId: conversationId,
            },
            userId
          );
          return { action: 'saved', memories: [created], feedbackMessage: `I've saved that to your memory.` };
        }
      }

      // C. Relationships & Family (Wife, husband, partner, children, dog, cat, friends)
      const relPattern =
        /(?:my\s+(wife|husband|partner|son|daughter|kid|child|brother|sister|mother|father|mom|dad|friend|boss|coworker|dog|cat|pet))\s+(?:is|is\s+named|called)\s+([a-zA-Z0-9_\- ]+)/i;
      const relMatch = trimmed.match(relPattern);
      if (relMatch && relMatch[1] && relMatch[2]) {
        const relation = relMatch[1].toLowerCase();
        const personName = relMatch[2].trim().replace(/[.?!]+$/, '');
        const newFact = `User's ${relation} is ${personName}.`;

        const existingRel = findExisting(
          (m) => m.category === 'relationship' && m.fact.toLowerCase().includes(`user's ${relation} is`)
        );

        if (existingRel) {
          if (existingRel.fact.toLowerCase() === newFact.toLowerCase()) {
            return { action: 'already_remembered', memories: [existingRel] };
          }
          const updated = await DatabaseService.updateMemory(
            existingRel.id,
            { fact: newFact, confidence: 0.95 },
            userId
          );
          return { action: 'updated', memories: [updated], feedbackMessage: `I've updated your ${relation}'s name in memory to ${personName}.` };
        }

        const created = await DatabaseService.createMemory(
          {
            category: 'relationship',
            fact: newFact,
            confidence: 0.95,
            sourceConversationId: conversationId,
          },
          userId
        );
        return { action: 'saved', memories: [created], feedbackMessage: `I'll remember that your ${relation} is ${personName}.` };
      }

      // D. Location & Living Base
      if (lower.includes('i live in') || lower.includes('i am based in') || lower.includes("i'm based in") || lower.includes('i moved to')) {
        const match = trimmed.match(/(?:i live in|i am based in|i'm based in|i moved to)\s+([a-zA-Z0-9_\- ,]+?)(?:\.|$|!|\s+and)/i);
        if (match && match[1]?.trim() && match[1].trim().length > 2) {
          const loc = match[1].trim().replace(/[.?!]+$/, '');
          const newFact = `User lives in ${loc}.`;

          const existingLoc = findExisting(
            (m) => m.category === 'user_fact' && m.fact.toLowerCase().includes('user lives in')
          );

          if (existingLoc) {
            if (existingLoc.fact.toLowerCase() === newFact.toLowerCase()) {
              return { action: 'already_remembered', memories: [existingLoc] };
            }
            const updated = await DatabaseService.updateMemory(
              existingLoc.id,
              { fact: newFact, confidence: 0.94 },
              userId
            );
            return { action: 'updated', memories: [updated], feedbackMessage: `I've updated your location in memory to ${loc}.` };
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
          return { action: 'saved', memories: [created], feedbackMessage: `I'll remember that you live in ${loc}.` };
        }
      }

      // E. Technical Stack & Tooling
      const techStackKeywords = [
        'my stack is',
        'our stack is',
        'we build with',
        'i build with',
        'my primary stack is',
        'our tech stack is',
        'using typescript and react',
        'using python and postgresql',
      ];
      const hasTechStack = techStackKeywords.some((kw) => lower.includes(kw));
      if (hasTechStack && trimmed.length >= 14) {
        const cleanStack = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim().replace(/[.?!]+$/, '');
        const newFact = `Technical stack & tooling: "${cleanStack.slice(0, 150)}".`;

        const existingStack = findExisting(
          (m) => m.category === 'user_fact' && m.fact.toLowerCase().includes('technical stack')
        );

        if (existingStack) {
          const updated = await DatabaseService.updateMemory(
            existingStack.id,
            { fact: newFact, confidence: 0.93 },
            userId
          );
          return { action: 'updated', memories: [updated], feedbackMessage: `I've updated your technical stack in memory.` };
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
        return { action: 'saved', memories: [created], feedbackMessage: `I've saved your technical stack to memory.` };
      }

      // F. User Preferences (explicit enduring preferences)
      if (
        (lower.includes('i prefer') || lower.includes('my preference is') || lower.includes('i always like to use')) &&
        !lower.includes('eating') &&
        !lower.includes('right now') &&
        !lower.includes('today')
      ) {
        const factClean = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim().replace(/[.?!]+$/, '');
        const newFact = `User preference: "${factClean.slice(0, 130)}".`;

        const created = await DatabaseService.createMemory(
          {
            category: 'preference',
            fact: newFact,
            confidence: 0.90,
            sourceConversationId: conversationId,
          },
          userId
        );
        return { action: 'saved', memories: [created] };
      }

      // G. Goals & Project Specifications
      if (
        (lower.includes('my goal is') || lower.includes('our goal is') || lower.includes('i am working on') || lower.includes("i'm working on") || lower.includes('we plan to launch')) &&
        trimmed.length >= 16
      ) {
        const newFact = `User goal / project: "${trimmed.slice(0, 150)}".`;

        const created = await DatabaseService.createMemory(
          {
            category: 'goal',
            fact: newFact,
            confidence: 0.91,
            sourceConversationId: conversationId,
          },
          userId
        );
        return { action: 'saved', memories: [created] };
      }

      return { action: 'none', memories: [] };
    } catch (err: any) {
      console.error('[MemoryService] Persistence error saving memory:', err);
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
