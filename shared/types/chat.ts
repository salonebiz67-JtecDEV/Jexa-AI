import { TextProviderType } from './provider';

export type Role = 'user' | 'assistant' | 'system';

export type AIActivityStatus =
  | 'Thinking...'
  | 'Planning...'
  | 'Selecting tool...'
  | 'Using web research...'
  | 'Verifying results...'
  | 'Tool failed'
  | 'Searching the web...'
  | 'Reading sources...'
  | 'Reading web pages...'
  | 'Analyzing sources...'
  | 'Checking relevant memories...'
  | 'Checking memories...'
  | 'Identifying useful memory…'
  | 'Saving memory...'
  | 'Saving memory…'
  | 'Memory saved'
  | 'Memory saved — User Profile'
  | 'Memory saved — Preferences & Settings'
  | 'Memory saved — Relationships & Important Dates'
  | 'Memory saved — Projects & Goals'
  | 'Memory saved — Conversation Insights'
  | 'Memory updated'
  | 'Memory updated — User Profile'
  | 'Memory updated — Preferences & Settings'
  | 'Memory updated — Relationships & Important Dates'
  | 'Memory updated — Projects & Goals'
  | 'Memory updated — Conversation Insights'
  | 'Memory unavailable'
  | 'Memory retrieval failed'
  | 'Memory storage unavailable'
  | 'Processing information...'
  | 'Preparing answer...'
  | 'Answer complete'
  | 'Search failed — retry available'
  | (string & {});

export interface WebSearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
  domain?: string;
  faviconUrl?: string;
  isAccessible?: boolean;
  authoritative?: boolean;
  inaccessibleReason?: string;
  extractedText?: string;
}

export interface ChatMessageMetadata {
  model?: string;
  provider?: string;
  tokens?: number;
  audioUrl?: string;
  isDevelopmentMock?: boolean;
  fallbackUsed?: boolean;
  originalProvider?: string;
  memoriesReferenced?: string[];
  memoryActionTaken?: 'saved' | 'updated' | 'deleted' | 'already_remembered' | 'none' | 'failed' | 'privacy_skipped';
  memoryFactSaved?: string;
  // Web search metadata & clickable citations
  sources?: WebSearchResultItem[];
  searchQuery?: string;
  searchPerformed?: boolean;
  searchStatus?: 'success' | 'failed' | 'missing_key' | 'unneeded' | 'no_results';
  searchError?: string;
  searchDecisionCategory?: string;
  searchDecisionReason?: string;
  searchTrigger?: 'manual' | 'automatic' | 'none';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  metadata?: ChatMessageMetadata;
}

export interface StreamChatStatusEvent {
  type: 'status';
  status: AIActivityStatus;
  details?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
    memoryFact?: string;
    memoryAction?: string;
    sources?: WebSearchResultItem[];
    searchStatus?: 'success' | 'failed' | 'missing_key' | 'unneeded' | 'no_results';
    searchTrigger?: 'manual' | 'automatic' | 'none';
  };
}

export interface StreamChatChunkEvent {
  type: 'chunk';
  chunk: string;
}

export interface StreamChatCompleteEvent {
  type: 'complete';
  data: ChatResponsePayload;
}

export interface StreamChatErrorEvent {
  type: 'error';
  error: string;
  status?: AIActivityStatus;
}

export type StreamChatEvent =
  | StreamChatStatusEvent
  | StreamChatChunkEvent
  | StreamChatCompleteEvent
  | StreamChatErrorEvent;

export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  previewMessage?: string;
  messageCount?: number;
  personaId?: string;
  pinned?: boolean;
  metadata?: Record<string, any>;
}

export interface SendMessagePayload {
  conversationId?: string;
  userId?: string;
  message: string;
  stream?: boolean;
  personaId?: string;
  textProvider?: TextProviderType;
  isVoiceMode?: boolean;
  userContext?: {
    userName?: string;
    timezone?: string;
    location?: string;
  };
}

export interface ChatResponsePayload {
  message: ChatMessage;
  userMessage?: ChatMessage;
  conversationId: string;
  isNewConversation: boolean;
  memoriesRetrieved?: string[];
}
