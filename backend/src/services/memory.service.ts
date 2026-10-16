import { DatabaseService } from '../database/db-service';
import { MemoryItem, MemoryCreateInput, MemorySearchResult } from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';

// Common casual / ephemeral words that indicate low-value chatter rather than durable memory
const CASUAL_GREETINGS_PATTERN =
  /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|ok|okay|cool|nice|thanks|thank\s+you|bye|see\s+ya|haha|lol)\b/i;

export class MemoryService {
  /**
   * Retrieves memories belonging to the authenticated user and ranks them by relevance to the query.
   */
  public static async getRelevantMemories(
    query: string,
    limit: number = 5,
    userId?: string
  ): Promise<MemoryItem[]> {
    const allMemories = await DatabaseService.getMemories(userId);
    const ranked: MemorySearchResult[] = searchRelevantMemories(query, allMemories, limit);
    return ranked.map((r: MemorySearchResult) => r.item);
  }

  /**
   * Evaluates incoming user messages with selective intelligence.
   * Discards casual chatter, greetings, and ephemeral noise.
   * Only stores high-value, durable information: technical stacks, project specs,
   * user preferences, key goals, and explicit memory requests.
   */
  public static async extractAndStoreFromMessage(
    userMessage: string,
    conversationId: string,
    userId?: string
  ): Promise<MemoryItem[]> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 8) {
      return [];
    }

    const lower = trimmed.toLowerCase();

    // 1. Filter out pure casual greetings, spam, or ephemeral pleasantries
    if (CASUAL_GREETINGS_PATTERN.test(lower) && trimmed.length < 35 && !lower.includes('remember')) {
      return [];
    }

    const added: MemoryItem[] = [];

    // 2. Identity / Preferred Name
    if (lower.includes('my name is') || lower.includes("i'm called") || lower.includes('call me')) {
      const match = trimmed.match(/(?:my name is|i'm called|call me)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and|\s+remember)/i);
      if (match && match[1]?.trim() && match[1].trim().length > 1) {
        const name = match[1].trim();
        const mem = await DatabaseService.createMemory(
          {
            category: 'user_fact',
            fact: `User's name is ${name}.`,
            confidence: 0.99,
            sourceConversationId: conversationId,
          },
          userId
        );
        added.push(mem);
      }
    }

    // 3. Explicit Memory Directive ("Remember that...", "Remember:", "Don't forget that...")
    if (
      lower.includes('remember that') ||
      lower.includes('remember:') ||
      lower.includes("don't forget that") ||
      lower.includes('please remember') ||
      lower.includes('keep in mind that')
    ) {
      const match = trimmed.match(/(?:remember that|remember:|don't forget that|please remember|keep in mind that)\s+(.+?)(?:\.|$|!)/i);
      if (match && match[1]?.trim() && match[1].trim().length > 4) {
        const fact = match[1].trim();
        const mem = await DatabaseService.createMemory(
          {
            category: 'user_fact',
            fact: `User note: "${fact.slice(0, 160)}".`,
            confidence: 0.96,
            sourceConversationId: conversationId,
          },
          userId
        );
        added.push(mem);
      }
    }

    // 4. Technical Stacks, Tools, & Engineering Choices
    const techStackKeywords = [
      'my stack is',
      'our stack is',
      'we build with',
      'i build with',
      'i use',
      'we use',
      'our tech stack',
      'using typescript',
      'using react',
      'using python',
      'using postgresql',
      'using supabase',
      'using docker',
      'architecture uses',
    ];

    const hasTechStack = techStackKeywords.some((keyword) => lower.includes(keyword));
    if (hasTechStack && trimmed.length >= 15) {
      const cleanStack = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim();
      const mem = await DatabaseService.createMemory(
        {
          category: 'user_fact',
          fact: `Technical stack & tooling: "${cleanStack.slice(0, 150)}".`,
          confidence: 0.92,
          sourceConversationId: conversationId,
        },
        userId
      );
      added.push(mem);
    }

    // 5. Durable User Preferences (excluding transient food/weather remarks)
    if (
      (lower.includes('i prefer') || lower.includes('my preference is') || lower.includes('i always like to')) &&
      !lower.includes('eating') &&
      !lower.includes('right now') &&
      !lower.includes('today')
    ) {
      const factClean = trimmed.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim();
      const mem = await DatabaseService.createMemory(
        {
          category: 'preference',
          fact: `User preference: "${factClean.slice(0, 130)}".`,
          confidence: 0.89,
          sourceConversationId: conversationId,
        },
        userId
      );
      added.push(mem);
    }

    // 6. Project Specifications, Specs, & Requirements
    if (
      (lower.includes('i am working on') ||
        lower.includes("i'm working on") ||
        lower.includes('i am building') ||
        lower.includes("i'm building") ||
        lower.includes('the project is') ||
        lower.includes('my project is') ||
        lower.includes('project requirement')) &&
      trimmed.length >= 20
    ) {
      const mem = await DatabaseService.createMemory(
        {
          category: 'goal',
          fact: `Project specification: "${trimmed.slice(0, 150)}".`,
          confidence: 0.93,
          sourceConversationId: conversationId,
        },
        userId
      );
      added.push(mem);
    }

    // 7. Goals, Milestones, & Objectives
    if (
      (lower.includes('my goal is') || lower.includes('our goal is') || lower.includes('we plan to launch')) &&
      trimmed.length >= 15
    ) {
      const mem = await DatabaseService.createMemory(
        {
          category: 'goal',
          fact: `User goal: "${trimmed.slice(0, 140)}".`,
          confidence: 0.9,
          sourceConversationId: conversationId,
        },
        userId
      );
      added.push(mem);
    }

    return added;
  }

  public static async getAllMemories(userId?: string): Promise<MemoryItem[]> {
    return DatabaseService.getMemories(userId);
  }

  public static async createMemory(input: MemoryCreateInput, userId?: string): Promise<MemoryItem> {
    return DatabaseService.createMemory(input, userId);
  }

  public static async deleteMemory(id: string, userId?: string): Promise<boolean> {
    return DatabaseService.deleteMemory(id, userId);
  }
}
