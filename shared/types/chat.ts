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
  | 'Processing information...'
  | 'Preparing answer...'
  | 'Answer complete'
  | 'Search failed — retry available'
  | 'Checking servers…'
  | 'Reading error logs…'
  | 'Reading source code…'
  | 'Searching code…'
  | 'Writing the answer…'
  | 'Writing the answer...'
  | 'Retrying…'
  | 'Retrying...'
  | 'This is taking too long'
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

export interface ClientHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatStatusEvent {
  type: 'status';
  status: AIActivityStatus;
  details?: {
    query?: string;
    sourcesCount?: number;
    error?: string;
    sources?: WebSearchResultItem[];
    searchStatus?: 'success' | 'failed' | 'missing_key' | 'unneeded' | 'no_results';
    searchTrigger?: 'manual' | 'automatic' | 'none';
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
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
  code?: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
}

export type StreamChatEvent =
  | StreamChatStatusEvent
  | StreamChatChunkEvent
  | StreamChatCompleteEvent
  | StreamChatErrorEvent;

export interface Conversation {
  id: string;
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
  message: string;
  history?: ClientHistoryMessage[];
  aboutMe?: string;
  behaviorInstructions?: string;
  stream?: boolean;
  personaId?: string;
  textProvider?: TextProviderType;
  textModel?: string;
  backupModel?: string;
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
}
