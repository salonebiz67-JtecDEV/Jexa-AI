export type MemoryCategory = 'user_fact' | 'preference' | 'goal' | 'relationship' | 'milestone' | 'interest';

export interface MemoryItem {
  id: string;
  userId?: string;
  category: MemoryCategory;
  fact: string;
  confidence: number; // 0 to 1
  sourceConversationId?: string;
  lastReinforcedAt: string;
  createdAt: string;
}

export interface MemoryCreateInput {
  category: MemoryCategory;
  fact: string;
  confidence?: number;
  sourceConversationId?: string;
}

export interface MemorySearchResult {
  item: MemoryItem;
  relevanceScore: number;
}
