export type TextProviderType = 'gemini' | 'litellm' | 'groq';
export type VoiceProviderType = 'gemini';

export interface GeminiModelOption {
  id: string;
  label: string;
  badge?: string;
  isDefault?: boolean;
}

export const DEFAULT_CHAT_ALIAS = 'jexa-chat-primary';
export const DEFAULT_BACKUP_ALIAS = 'jexa-chat-backup';
export const DEFAULT_BACKGROUND_ALIAS = 'jexa-chat-background';
export const GROQ_FAST_ALIAS = 'jexa-groq-fast';
export const GROQ_VERSATILE_ALIAS = 'jexa-groq-versatile';

export const DEFAULT_CHAT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_BACKUP_MODEL = 'gemini-3.7-flash';
export const DEFAULT_BACKGROUND_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_VOICE_MODEL = 'gemini-3.8-flash-lite-tts';

export const FREE_GEMINI_CHAT_MODELS: GeminiModelOption[] = [
  { id: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen', badge: 'new, fast coding' },
  { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash', badge: 'default', isDefault: true },
  { id: 'gemini-3.7-flash', label: 'gemini-3.7-flash' },
  { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
  { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
  { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite' },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
];

export const FREE_GEMINI_VOICE_MODELS: GeminiModelOption[] = [
  { id: 'gemini-3.8-flash-lite-tts', label: 'gemini-3.8-flash-lite-tts', badge: 'default', isDefault: true },
  { id: 'gemini-3.8-flash-tts', label: 'gemini-3.8-flash-tts' },
];

export function isTtsModel(modelId?: string | null): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  return /(?:^|[-_\s])tts(?:$|[-_\s])|tts$/i.test(modelId.trim());
}

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
    backupModel?: string;
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
  model?: string;
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

type ErrorLogHandler = (source: string, message: any, details?: Record<string, any>) => void;
let registeredErrorLogger: ErrorLogHandler | null = null;

export function setErrorLogger(logger: ErrorLogHandler): void {
  registeredErrorLogger = logger;
}

export function scrubSecretsAndUrls(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  // 1. Scrub URLs
  s = s.replace(/https?:\/\/[^\s"'<>]+/gi, '');
  // 2. Scrub standard API keys and tokens
  s = s.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  s = s.replace(/sk-[A-Za-z0-9_\-]{14,}/gi, 'sk-[REDACTED]');
  s = s.replace(/gsk_[A-Za-z0-9]{14,}/gi, 'gsk_[REDACTED]');
  s = s.replace(/AIza[0-9A-Za-z\-_]{30,}/g, 'AIza[REDACTED]');
  s = s.replace(/ghp_[0-9a-zA-Z]{30,}/g, 'ghp_[REDACTED]');
  s = s.replace(/eyJhbGciOi[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[REDACTED_JWT]');
  // 3. Scrub key=, secret=, token=, password=
  s = s.replace(/(?:key|secret|token|password|apiKey|api_key|access_key|master_key)\s*[:=]\s*["']?([^"',\s]+)["']?/gi, (m, val) => {
    return m.replace(val, '[REDACTED]');
  });
  // 4. Scrub long random strings
  s = s.replace(/[A-Za-z0-9_\-]{28,}/g, '[REDACTED]');
  // 5. Clean up extra punctuation, braces, whitespace
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[:\-\s,]+|[:\-\s,]+$/g, '');
  return s;
}

export function formatCleanProviderError(error: any): {
  cleanMessage: string;
  code: string;
  statusCode: number;
  provider?: string;
  model?: string;
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
  const rawProvider = (error?.provider || errObj.provider || 'gemini').toString().toLowerCase();
  const rawModel = (error?.model || errObj?.model || (typeof error === 'object' && error?.modelName) || '').toString().trim();
  const fullText = `${rawMsg} ${innerMsg} ${error?.code || ''} ${rawProvider}`.toLowerCase();

  const resolvedProviderKey =
    rawProvider === 'litellm'
      ? 'litellm'
      : rawProvider === 'groq'
      ? 'groq'
      : 'gemini';
  const providerName =
    resolvedProviderKey === 'litellm'
      ? 'AI Gateway'
      : resolvedProviderKey === 'groq'
      ? 'Groq'
      : 'Gemini';

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

  // Extract concise real reason scrubbed of secrets and URLs
  let realReason = '';
  if (errObj.message && typeof errObj.message === 'string') {
    realReason = scrubSecretsAndUrls(errObj.message);
  } else if (error?.message && typeof error.message === 'string') {
    const stripped = error.message.replace(/\{[\s\S]*\}/, '').trim();
    realReason = scrubSecretsAndUrls(stripped || error.message);
  } else if (rawMsg) {
    const stripped = rawMsg.replace(/\{[\s\S]*\}/, '').trim();
    realReason = scrubSecretsAndUrls(stripped || rawMsg);
  }

  if (!realReason || realReason.toLowerCase().includes('unexpected error') || realReason.length < 3) {
    realReason = error?.code ? `Service returned code ${error.code}` : `Request failed`;
  }
  if (realReason.length > 180) {
    realReason = realReason.slice(0, 177) + '...';
  }

  const modelDisplay = rawModel ? ` (${rawModel})` : '';
  const statusDisplay = `[Status ${statusNum}]`;

  // Always write full raw error to error log via registered logger
  if (registeredErrorLogger) {
    registeredErrorLogger('ai_provider', rawMsg || String(error), {
      provider: resolvedProviderKey,
      model: rawModel,
      statusCode: statusNum,
      realReason,
      rawError: typeof error === 'object' ? (error.stack || error.message || error) : String(error),
    });
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
      isTtsModel(error?.model) || fullText.includes('voice') || fullText.includes('synthesize');

    if (isVoice) {
      return {
        cleanMessage: `Gemini Voice${modelDisplay} quota reached: ${realReason}. Try switching the voice model in Settings or try again shortly. ${statusDisplay}`,
        code: 'QUOTA_EXHAUSTED',
        statusCode: 429,
        provider: resolvedProviderKey,
        model: rawModel,
        retryAfterSeconds,
      };
    }

    return {
      cleanMessage: `${providerName}${modelDisplay} rate limit reached: ${realReason}. Try again shortly or pick another Gemini model in Settings. ${statusDisplay}`,
      code: 'QUOTA_EXHAUSTED',
      statusCode: 429,
      provider: resolvedProviderKey,
      model: rawModel,
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
      cleanMessage: `${providerName}${modelDisplay} requires a paid plan: ${realReason}. ${statusDisplay}`,
      code: 'PAYMENT_REQUIRED',
      statusCode: 402,
      provider: resolvedProviderKey,
      model: rawModel,
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
      cleanMessage: `${providerName}${modelDisplay} model not found: ${realReason}. ${statusDisplay}`,
      code: 'MODEL_NOT_FOUND',
      statusCode: 404,
      provider: resolvedProviderKey,
      model: rawModel,
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
      cleanMessage: `${providerName}${modelDisplay} authentication failed: ${realReason}. Check GEMINI_API_KEY. ${statusDisplay}`,
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
      provider: resolvedProviderKey,
      model: rawModel,
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
      cleanMessage: `${providerName}${modelDisplay} temporarily unavailable: ${realReason}. ${statusDisplay}`,
      code: 'PROVIDER_UNAVAILABLE',
      statusCode: 503,
      provider: resolvedProviderKey,
      model: rawModel,
    };
  }

  // General fallback
  return {
    cleanMessage: `${providerName}${modelDisplay}: ${realReason} ${statusDisplay}`.trim(),
    code: error?.code || 'PROVIDER_ERROR',
    statusCode: typeof statusNum === 'number' && statusNum >= 400 && statusNum < 600 ? statusNum : 500,
    provider: resolvedProviderKey,
    model: rawModel,
  };
}
