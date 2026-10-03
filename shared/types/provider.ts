export type TextProviderType = 'development_mock' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'custom_http';
export type VoiceProviderType = 'development_mock' | 'elevenlabs' | 'openai_voice' | 'browser_speech' | 'custom_tts' | 'gemini';

export interface ProviderDetail {
  type: string;
  name: string;
  isConfigured: boolean;
  model: string;
  description?: string;
  error?: string;
}

export interface ProviderStatus {
  textProvider: {
    type: TextProviderType;
    isConfigured: boolean;
    hasApiKey: boolean;
    model: string;
    status: 'ready' | 'missing_key' | 'fallback_active' | 'error';
    description?: string;
    lastError?: string;
  };
  voiceProvider: {
    type: VoiceProviderType;
    isConfigured: boolean;
    hasApiKey: boolean;
    model: string;
    status: 'ready' | 'missing_key' | 'fallback_active' | 'error';
    description?: string;
    lastError?: string;
  };
  availableTextProviders?: ProviderDetail[];
  availableVoiceProviders?: ProviderDetail[];
  database: {
    type: 'supabase' | 'in_memory_fallback';
    isConfigured: boolean;
    status: 'connected' | 'unconfigured_fallback';
  };
  isProductionReady?: boolean;
}

export interface VoiceSynthesisRequest {
  text: string;
  voiceId?: string;
  provider?: VoiceProviderType;
  speed?: number;
  pitch?: number;
}

export interface VoiceSynthesisResponse {
  audioUrl?: string;
  format?: 'audio/mpeg' | 'audio/wav' | 'browser_synthesis';
  durationSeconds?: number;
  isSimulated: boolean;
  message: string;
  provider?: VoiceProviderType;
  model?: string;
}

export class ProviderError extends Error {
  public provider: string;
  public code: string;
  public statusCode: number;
  public model?: string;

  constructor(message: string, provider: string, code = 'PROVIDER_ERROR', statusCode = 500, model?: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.statusCode = statusCode;
    this.model = model;
  }
}
