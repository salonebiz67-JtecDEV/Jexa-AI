export type MemoryCategory =
  | 'user_profile'
  | 'preferences_settings'
  | 'relationships_dates'
  | 'projects_goals'
  | 'conversation_insights'
  // Legacy aliases for backward compatibility:
  | 'user_fact'
  | 'preference'
  | 'goal'
  | 'relationship'
  | 'milestone'
  | 'interest';

export type MemoryType = 'confirmed_fact' | 'insight';

export interface MemoryItem {
  id: string;
  userId?: string;
  category: MemoryCategory;
  fact: string;
  memoryType?: MemoryType;
  confidence: number; // 0 to 1
  sourceConversationId?: string;
  sourceMessageId?: string;
  lastReinforcedAt: string;
  createdAt: string;
}

export interface MemoryCreateInput {
  category: MemoryCategory;
  fact: string;
  memoryType?: MemoryType;
  confidence?: number;
  sourceConversationId?: string;
  sourceMessageId?: string;
}

export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'user_profile':
    case 'user_fact':
      return 'User Profile';
    case 'preferences_settings':
    case 'preference':
    case 'interest':
      return 'Preferences & Settings';
    case 'relationships_dates':
    case 'relationship':
      return 'Relationships & Important Dates';
    case 'projects_goals':
    case 'goal':
    case 'milestone':
      return 'Projects & Goals';
    case 'conversation_insights':
      return 'Conversation Insights';
    default:
      return 'User Profile';
  }
}

export function normalizeCategory(category: string): MemoryCategory {
  switch (category) {
    case 'user_fact':
      return 'user_profile';
    case 'preference':
    case 'interest':
      return 'preferences_settings';
    case 'relationship':
      return 'relationships_dates';
    case 'goal':
    case 'milestone':
      return 'projects_goals';
    case 'user_profile':
    case 'preferences_settings':
    case 'relationships_dates':
    case 'projects_goals':
    case 'conversation_insights':
      return category as MemoryCategory;
    default:
      return 'user_profile';
  }
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

