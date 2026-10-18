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

export interface MemoryExtractionResult {
  action: 'saved' | 'updated' | 'deleted' | 'already_remembered' | 'privacy_skipped' | 'none' | 'failed';
  memories: MemoryItem[];
  feedbackMessage?: string;
  factSummary?: string;
  error?: string;
}

export interface ResearchHistorySource {
  title: string;
  url: string;
  domain?: string;
  publishedDate?: string;
}

export interface ResearchHistoryItem {
  id: string;
  userId?: string;
  query: string;
  summary: string;
  sources: ResearchHistorySource[];
  sourceConversationId?: string;
  searchedAt: string;
  createdAt: string;
}

