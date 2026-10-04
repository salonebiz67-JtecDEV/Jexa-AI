export type TextProviderType = 'development_mock' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'custom_http';
export type VoiceProviderType = 'development_mock' | 'elevenlabs' | 'openai_voice' | 'browser_speech' | 'custom_tts' | 'gemini';

export type ProviderHealthStatus =
  | 'CONNECTED'
  | 'UNAVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'AUTHENTICATION_ERROR'
  | 'PAYMENT_REQUIRED'
  | 'MODEL_NOT_FOUND'
  | 'NOT_CONFIGURED';

export interface ProviderDetail {
  type: string;
  name: string;
  isConfigured: boolean;
  model: string;
  voiceId?: string;
  description?: string;
  status: ProviderHealthStatus;
  error?: string;
  code?: string;
  lastSuccessfulTest?: {
    timestamp: string;
    latencyMs: number;
  };
}

export interface ProviderStatus {
  textProvider: {
    type: TextProviderType;
    isConfigured: boolean;
    hasApiKey: boolean;
    model: string;
    status: ProviderHealthStatus;
    description?: string;
    lastError?: string;
    code?: string;
    lastSuccessfulTest?: {
      timestamp: string;
      latencyMs: number;
    };
  };
  voiceProvider: {
    type: VoiceProviderType;
    isConfigured: boolean;
    hasApiKey: boolean;
    model: string;
    voiceId?: string;
    status: ProviderHealthStatus;
    description?: string;
    lastError?: string;
    code?: string;
    lastSuccessfulTest?: {
      timestamp: string;
      latencyMs: number;
    };
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
  audioBuffer?: any;
  contentType?: string;
  audioUrl?: string;
  format?: 'audio/mpeg' | 'audio/wav' | 'browser_synthesis';
  durationSeconds?: number;
  isSimulated: boolean;
  message: string;
  provider?: VoiceProviderType;
  model?: string;
}

export interface VoiceHealthResponse {
  gemini: {
    configured: boolean;
    provider: 'gemini';
    model?: string;
  };
  elevenlabs: {
    configured: boolean;
    provider: 'elevenlabs';
    model?: string;
  };
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

export function formatCleanProviderError(error: any): { cleanMessage: string; code: string; statusCode: number } {
  const rawMsg = typeof error === 'string' ? error : error?.message || '';
  let parsedJson: any = null;
  const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch {
      parsedJson = null;
    }
  }

  const errObj = parsedJson?.error || parsedJson || {};
  const statusNum = error?.statusCode || error?.status || errObj.code || 500;
  const innerMsg = errObj.message || rawMsg;
  const fullText = `${rawMsg} ${innerMsg} ${error?.code || ''}`.toLowerCase();

  // 1. Quota / 429
  if (
    statusNum === 429 ||
    error?.code === 'QUOTA_EXHAUSTED' ||
    fullText.includes('429') ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('quota') ||
    fullText.includes('rate_limited')
  ) {
    const isVoice = error?.provider === 'gemini' && (error?.model?.includes('tts') || error?.model?.includes('voice') || fullText.includes('voice'));
    return {
      cleanMessage: isVoice
        ? 'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.'
        : 'Gemini Voice is temporarily unavailable because its quota has been reached.',
      code: 'QUOTA_EXHAUSTED',
      statusCode: 429,
    };
  }

  // 2. Paid plan required / 402
  if (
    statusNum === 402 ||
    error?.code === 'PAYMENT_REQUIRED' ||
    fullText.includes('402') ||
    fullText.includes('payment_required') ||
    fullText.includes('paid plan') ||
    fullText.includes('subscription') ||
    fullText.includes('free tier')
  ) {
    return {
      cleanMessage: 'This ElevenLabs voice requires a paid plan.',
      code: 'PAYMENT_REQUIRED',
      statusCode: 402,
    };
  }

  // 3. Model or voice not found / 404
  if (
    statusNum === 404 ||
    error?.code === 'MODEL_NOT_FOUND' ||
    fullText.includes('404') ||
    fullText.includes('not found') ||
    fullText.includes('unknown model')
  ) {
    return {
      cleanMessage: 'The selected model or voice was not found.',
      code: 'MODEL_NOT_FOUND',
      statusCode: 404,
    };
  }

  // 4. Authentication / 401 / 403
  if (
    statusNum === 401 ||
    statusNum === 403 ||
    error?.code === 'AUTHENTICATION_ERROR' ||
    fullText.includes('401') ||
    fullText.includes('403') ||
    fullText.includes('api_key') ||
    fullText.includes('permission_denied') ||
    fullText.includes('unauthorized')
  ) {
    return {
      cleanMessage: 'Provider authentication or permission failed.',
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
    };
  }

  // 5. Service unavailable / 503
  if (
    statusNum === 503 ||
    error?.code === 'PROVIDER_UNAVAILABLE' ||
    fullText.includes('503') ||
    fullText.includes('unavailable') ||
    fullText.includes('high demand') ||
    fullText.includes('overloaded')
  ) {
    return {
      cleanMessage: 'The provider is temporarily unavailable.',
      code: 'PROVIDER_UNAVAILABLE',
      statusCode: 503,
    };
  }

  // Fallback: strip raw JSON blob if any
  const stripped = rawMsg.replace(/\{[\s\S]*\}/, '').trim();
  return {
    cleanMessage: stripped || 'The provider encountered an error.',
    code: error?.code || 'PROVIDER_ERROR',
    statusCode: typeof statusNum === 'number' && statusNum >= 400 && statusNum < 600 ? statusNum : 500,
  };
}
