export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  metadata?: {
    model?: string;
    tokens?: number;
    audioUrl?: string;
    isDevelopmentMock?: boolean;
    memoriesReferenced?: string[];
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  previewMessage?: string;
  messageCount?: number;
  personaId?: string;
}

export interface SendMessagePayload {
  conversationId?: string;
  message: string;
  stream?: boolean;
  personaId?: string;
  isVoiceMode?: boolean;
  userContext?: {
    userName?: string;
    timezone?: string;
    location?: string;
  };
}

export interface ChatResponsePayload {
  message: ChatMessage;
  conversationId: string;
  isNewConversation: boolean;
  memoriesRetrieved?: string[];
}
