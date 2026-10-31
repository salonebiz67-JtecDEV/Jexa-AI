import { TextProviderType } from '../../shared/types/provider';

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface TextGenerationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallRequest[];
  name?: string;
  rawModelParts?: any;
  rawMessage?: any;
}

export interface TextGenerationRequest {
  systemPrompt: string;
  messages: TextGenerationMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
  tools?: ToolDeclaration[];
  toolChoice?: 'auto' | 'none' | 'required';
  purpose?: 'chat' | 'tool_round' | 'memory_extraction' | 'style_learner' | 'search_decision' | 'voice_tts';
  messageId?: string;
}

export interface TextGenerationResponse {
  content: string;
  model: string;
  provider: TextProviderType;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  isMock: boolean;
  finishReason: 'stop' | 'length' | 'tool_call';
  toolCalls?: ToolCallRequest[];
  rawModelParts?: any;
  rawMessage?: any;
}

export interface ITextAIProvider {
  readonly providerType: TextProviderType;
  readonly isConfigured: boolean;
  readonly modelName: string;
  readonly supportsTools?: boolean;

  generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse>;
  streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse>;
}
