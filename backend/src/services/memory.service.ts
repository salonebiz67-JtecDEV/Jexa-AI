import { DatabaseService } from '../database/db-service';
import { MemoryItem, MemoryCreateInput, MemorySearchResult } from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';

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
   * Analyzes the user's message for long-term facts, preferences, goals, and identity,
   * saving them scoped directly to the authenticated user.
   */
  public static async extractAndStoreFromMessage(
    userMessage: string,
    conversationId: string,
    userId?: string
  ): Promise<MemoryItem[]> {
    const added: MemoryItem[] = [];
    const lower = userMessage.toLowerCase().trim();

    // 1. Identity / Preferred Name
    if (lower.includes('my name is') || lower.includes("i'm called") || lower.includes('call me')) {
      const match = userMessage.match(/(?:my name is|i'm called|call me)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and|\s+remember)/i);
      if (match && match[1]?.trim()) {
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

    // 2. Direct "Remember that..." or "Remember:..."
    if (lower.includes('remember that') || lower.includes('remember:') || lower.includes("don't forget that")) {
      const match = userMessage.match(/(?:remember that|remember:|don't forget that)\s+(.+?)(?:\.|$|!)/i);
      if (match && match[1]?.trim()) {
        const fact = match[1].trim();
        const mem = await DatabaseService.createMemory(
          {
            category: 'user_fact',
            fact: `User note: "${fact.slice(0, 150)}".`,
            confidence: 0.95,
            sourceConversationId: conversationId,
          },
          userId
        );
        added.push(mem);
      }
    }

    // 3. User Preferences & Passions
    if (lower.includes('i love') || lower.includes('my favorite') || lower.includes('i prefer')) {
      const factClean = userMessage.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim();
      const mem = await DatabaseService.createMemory(
        {
          category: 'preference',
          fact: `User preference: "${factClean.slice(0, 120)}".`,
          confidence: 0.88,
          sourceConversationId: conversationId,
        },
        userId
      );
      added.push(mem);
    }

    // 4. Goals & Projects
    if (lower.includes('i am working on') || lower.includes("i'm working on") || lower.includes('my goal is')) {
      const mem = await DatabaseService.createMemory(
        {
          category: 'goal',
          fact: `User goal: "${userMessage.slice(0, 120)}".`,
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
