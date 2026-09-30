import { DatabaseService } from '../database/db-service';
import { MemoryItem, MemoryCreateInput, MemorySearchResult } from '../../../shared/types/memory';
import { searchRelevantMemories } from '../../../ai/memory/memory-retrieval';

export class MemoryService {
  public static async getRelevantMemories(query: string, limit: number = 5): Promise<MemoryItem[]> {
    const allMemories = await DatabaseService.getMemories();
    const ranked: MemorySearchResult[] = searchRelevantMemories(query, allMemories, limit);
    return ranked.map((r: MemorySearchResult) => r.item);
  }

  public static async extractAndStoreFromMessage(userMessage: string, conversationId: string): Promise<MemoryItem[]> {
    const added: MemoryItem[] = [];
    const lower = userMessage.toLowerCase();

    // Heuristic patterns for development memory extraction
    if (lower.includes('my name is') || lower.includes("i'm called")) {
      const match = userMessage.match(/(?:my name is|i'm called)\s+([a-zA-Z]+)/i);
      if (match && match[1]) {
        const mem = await DatabaseService.createMemory({
          category: 'user_fact',
          fact: `User's name is ${match[1]}.`,
          confidence: 0.98,
          sourceConversationId: conversationId,
        });
        added.push(mem);
      }
    }

    if (lower.includes('i love') || lower.includes('my favorite') || lower.includes('i prefer')) {
      const factClean = userMessage.replace(/^(hey|jexa|so|well)[,\s]*/i, '').trim();
      const mem = await DatabaseService.createMemory({
        category: 'preference',
        fact: `User preference: "${factClean.slice(0, 100)}".`,
        confidence: 0.88,
        sourceConversationId: conversationId,
      });
      added.push(mem);
    }

    if (lower.includes('i am working on') || lower.includes('my goal is')) {
      const mem = await DatabaseService.createMemory({
        category: 'goal',
        fact: `User goal: "${userMessage.slice(0, 100)}".`,
        confidence: 0.9,
        sourceConversationId: conversationId,
      });
      added.push(mem);
    }

    return added;
  }

  public static async getAllMemories(): Promise<MemoryItem[]> {
    return DatabaseService.getMemories();
  }

  public static async createMemory(input: MemoryCreateInput): Promise<MemoryItem> {
    return DatabaseService.createMemory(input);
  }

  public static async deleteMemory(id: string): Promise<boolean> {
    return DatabaseService.deleteMemory(id);
  }
}
