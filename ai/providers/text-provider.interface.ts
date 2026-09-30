import { TextProviderType } from '../../shared/types/provider';

export interface TextGenerationRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
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
}

export interface ITextAIProvider {
  readonly providerType: TextProviderType;
  readonly isConfigured: boolean;
  readonly modelName: string;

  generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse>;
  streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse>;
}
