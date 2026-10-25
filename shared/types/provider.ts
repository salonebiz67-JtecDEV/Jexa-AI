export type TextProviderType = 'development_mock' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'custom_http';
export type VoiceProviderType = 'development_mock' | 'elevenlabs' | 'openai_voice' | 'browser_speech' | 'custom_tts' | 'gemini' | 'personal';

export type ProviderHealthStatus =
  | 'CONNECTED'
  | 'READY'
  | 'UNAVAILABLE'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'AUTHENTICATION_ERROR'
  | 'PAYMENT_REQUIRED'
  | 'MODEL_NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'ERROR';

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

export interface PersonalVoiceReferenceMetadata {
  id: string;
  name: string;
  format?: string;
  durationSeconds?: number;
  sampleRate?: number;
  recordedAt: string;
  sizeBytes?: number;
  isLocalOnly?: boolean;
}

export interface PersonalVoiceStatusResponse {
  configured: boolean;
  engine: string;
  referenceVoice: boolean;
  referenceMetadata?: PersonalVoiceReferenceMetadata | null;
  ready: boolean;
  model?: string;
  apiUrl?: string;
  message: string;
  status: ProviderHealthStatus;
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
  personal?: {
    configured: boolean;
    provider: 'personal';
    engine?: string;
    referenceVoice?: boolean;
  };
}

export class ProviderError extends Error {
  public provider: string;
  public code: string;
  public statusCode: number;
  public model?: string;
  public retryAfterSeconds?: number;

  constructor(
    message: string,
    provider: string,
    code = 'PROVIDER_ERROR',
    statusCode = 500,
    model?: string,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.statusCode = statusCode;
    this.model = model;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function formatCleanProviderError(error: any): {
  cleanMessage: string;
  code: string;
  statusCode: number;
  provider?: string;
  retryAfterSeconds?: number;
} {
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
  const rawProvider = (error?.provider || errObj.provider || '').toString().toLowerCase();
  const fullText = `${rawMsg} ${innerMsg} ${error?.code || ''} ${rawProvider}`.toLowerCase();

  // Detect genuine provider and counterpart
  let providerName = 'AI';
  let alternateProviderName = 'another provider';
  let resolvedProviderKey: string | undefined = rawProvider || undefined;

  if (rawProvider.includes('groq') || fullText.includes('groq')) {
    providerName = 'Groq';
    alternateProviderName = 'Gemini';
    resolvedProviderKey = 'groq';
  } else if (rawProvider.includes('gemini') || fullText.includes('gemini') || fullText.includes('google')) {
    providerName = 'Gemini';
    alternateProviderName = 'Groq';
    resolvedProviderKey = 'gemini';
  } else if (rawProvider) {
    providerName = rawProvider.charAt(0).toUpperCase() + rawProvider.slice(1);
    alternateProviderName = 'another provider in Settings';
  }

  // Extract retry-after if provided
  let retryAfterSeconds: number | undefined = error?.retryAfterSeconds;
  if (!retryAfterSeconds) {
    const retryMatch =
      fullText.match(/retry(?:-|\s+)after[:\s]+([0-9.]+)(?:s|ms|sec)?/i) ||
      fullText.match(/try\s+again\s+in\s+([0-9.]+)\s*(?:s|seconds)?/i) ||
      fullText.match(/wait\s+([0-9.]+)\s*(?:s|seconds)?/i);
    if (retryMatch) {
      const parsed = parseFloat(retryMatch[1]);
      if (!isNaN(parsed)) {
        retryAfterSeconds = fullText.includes('ms') && parsed > 100 ? parsed / 1000 : parsed;
      }
    }
  }

  // 1. Quota / Rate limit / 429
  if (
    statusNum === 429 ||
    error?.code === 'QUOTA_EXHAUSTED' ||
    error?.code === 'RATE_LIMITED' ||
    fullText.includes('429') ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('quota') ||
    fullText.includes('rate_limited') ||
    fullText.includes('rate limit') ||
    fullText.includes('too many requests')
  ) {
    const isVoice =
      (resolvedProviderKey === 'gemini' || resolvedProviderKey === 'elevenlabs' || fullText.includes('elevenlabs')) &&
      (error?.model?.includes('tts') || error?.model?.includes('voice') || fullText.includes('voice') || fullText.includes('synthesize'));

    if (isVoice) {
      const voiceProvider = resolvedProviderKey === 'elevenlabs' ? 'ElevenLabs' : 'Gemini Voice';
      const altVoice = resolvedProviderKey === 'elevenlabs' ? 'Gemini' : 'ElevenLabs';
      return {
        cleanMessage: `${voiceProvider} quota is temporarily exhausted. Try again later or switch to ${altVoice} in Settings.`,
        code: 'QUOTA_EXHAUSTED',
        statusCode: 429,
        provider: resolvedProviderKey || 'voice',
        retryAfterSeconds,
      };
    }

    return {
      cleanMessage: `${providerName} rate limit reached. Wait about a minute or switch to ${alternateProviderName} in Settings.`,
      code: 'QUOTA_EXHAUSTED',
      statusCode: 429,
      provider: resolvedProviderKey || providerName.toLowerCase(),
      retryAfterSeconds,
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
      cleanMessage: `${providerName} authentication or permission failed. Check your API key in environment variables.`,
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
      provider: resolvedProviderKey || providerName.toLowerCase(),
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
      cleanMessage: `${providerName} is temporarily unavailable or experiencing high demand. Please try again shortly.`,
      code: 'PROVIDER_UNAVAILABLE',
      statusCode: 503,
      provider: resolvedProviderKey || providerName.toLowerCase(),
    };
  }

  // 6. Personal Voice not configured / missing reference
  if (
    error?.provider === 'personal' ||
    fullText.includes('personal voice') ||
    fullText.includes('personal_voice')
  ) {
    if (fullText.includes('sample') || fullText.includes('reference')) {
      return {
        cleanMessage: 'Personal Voice sample not recorded yet. Record or upload your voice sample in Settings.',
        code: 'NOT_CONFIGURED',
        statusCode: 400,
        provider: 'personal',
      };
    }
    return {
      cleanMessage: 'Personal voice engine not configured.',
      code: 'NOT_CONFIGURED',
      statusCode: 400,
      provider: 'personal',
    };
  }

  // Fallback: strip raw JSON blob if any
  const stripped = rawMsg.replace(/\{[\s\S]*\}/, '').trim();
  return {
    cleanMessage: stripped || `${providerName} encountered an unexpected error.`,
    code: error?.code || 'PROVIDER_ERROR',
    statusCode: typeof statusNum === 'number' && statusNum >= 400 && statusNum < 600 ? statusNum : 500,
    provider: resolvedProviderKey || providerName.toLowerCase(),
  };
}
