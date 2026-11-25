import {
  DEFAULT_BACKUP_ALIAS,
  DEFAULT_BACKGROUND_ALIAS,
  DEFAULT_CHAT_ALIAS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_BACKGROUND_MODEL,
  GROQ_FAST_ALIAS,
  GROQ_VERSATILE_ALIAS,
  isTtsModel,
} from '../../shared/types/provider';

export interface ModelAliasEntry {
  alias: string;
  targetModel: string;
  provider: 'gemini' | 'groq';
  description: string;
}

export const MODEL_ALIAS_CATALOG: Record<string, ModelAliasEntry> = {
  [DEFAULT_CHAT_ALIAS]: {
    alias: DEFAULT_CHAT_ALIAS,
    targetModel: 'gemini-3.8-flash',
    provider: 'gemini',
    description: 'Primary conversational model with tools and streaming',
  },
  'jexa-chat-fast': {
    alias: 'jexa-chat-fast',
    targetModel: 'gemini-4-hydrogen',
    provider: 'gemini',
    description: 'Fast coding and reasoning primary model',
  },
  [DEFAULT_BACKUP_ALIAS]: {
    alias: DEFAULT_BACKUP_ALIAS,
    targetModel: 'gemini-3.7-flash',
    provider: 'gemini',
    description: 'Secondary Gemini fallback model',
  },
  [DEFAULT_BACKGROUND_ALIAS]: {
    alias: DEFAULT_BACKGROUND_ALIAS,
    targetModel: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    description: 'Lightweight background classification and title generation model',
  },
  [GROQ_FAST_ALIAS]: {
    alias: GROQ_FAST_ALIAS,
    targetModel: 'llama-3.1-8b-instant',
    provider: 'groq',
    description: 'Low-latency Groq fallback model',
  },
  [GROQ_VERSATILE_ALIAS]: {
    alias: GROQ_VERSATILE_ALIAS,
    targetModel: 'llama-3.3-70b-versatile',
    provider: 'groq',
    description: 'High-capability Groq fallback model',
  },
};

const PROVIDER_MODEL_TO_ALIAS: Record<string, string> = {
  'gemini-3.8-flash': DEFAULT_CHAT_ALIAS,
  'gemini-4-hydrogen': 'jexa-chat-fast',
  'gemini-3.7-flash': DEFAULT_BACKUP_ALIAS,
  'gemini-3.5-flash-lite': DEFAULT_BACKGROUND_ALIAS,
  'llama-3.1-8b-instant': GROQ_FAST_ALIAS,
  'llama-3.3-70b-versatile': GROQ_VERSATILE_ALIAS,
  'groq/llama-3.1-8b-instant': GROQ_FAST_ALIAS,
  'groq/llama-3.3-70b-versatile': GROQ_VERSATILE_ALIAS,
};

/**
 * Resolves a requested model name or alias into a LiteLLM model alias when routing
 * through the LiteLLM gateway. Keeps non-aliased valid Gemini chat models pass-through
 * compatible with litellm/config.yaml.
 */
export function resolveLiteLLMModelAlias(requestedModel?: string, fallbackAlias = DEFAULT_CHAT_ALIAS): string {
  const raw = (requestedModel || '').trim();
  if (!raw) return fallbackAlias;
  if (isTtsModel(raw)) {
    throw new Error(`TTS model '${raw}' cannot be used for chat.`);
  }
  if (MODEL_ALIAS_CATALOG[raw]) {
    return raw;
  }
  if (PROVIDER_MODEL_TO_ALIAS[raw]) {
    return PROVIDER_MODEL_TO_ALIAS[raw];
  }
  // Strip optional "gemini/" prefix so LiteLLM matches configured model_name
  if (raw.startsWith('gemini/')) {
    const stripped = raw.slice('gemini/'.length);
    return PROVIDER_MODEL_TO_ALIAS[stripped] || stripped;
  }
  return raw;
}

/**
 * Resolves a logical model alias back to the concrete Gemini model name
 * when direct Gemini SDK mode (fallback when LiteLLM is not configured) is used.
 */
export function resolveDirectGeminiModel(requestedModel?: string, fallbackModel = DEFAULT_CHAT_MODEL): string {
  const raw = (requestedModel || '').trim();
  if (!raw) return fallbackModel;
  if (isTtsModel(raw)) {
    return fallbackModel;
  }
  const entry = MODEL_ALIAS_CATALOG[raw];
  if (entry) {
    if (entry.provider === 'gemini') {
      return entry.targetModel;
    }
    // Groq alias cannot run directly on Gemini SDK; map to lightweight Gemini model
    return DEFAULT_BACKGROUND_MODEL;
  }
  return raw;
}

/**
 * Resolves the fallback chain of aliases for a given primary alias.
 */
export function getFallbackAliasForModel(primaryAliasOrModel: string): string {
  const resolved = resolveLiteLLMModelAlias(primaryAliasOrModel, DEFAULT_CHAT_ALIAS);
  if (resolved === DEFAULT_BACKUP_ALIAS) {
    return GROQ_VERSATILE_ALIAS;
  }
  if (resolved === DEFAULT_BACKGROUND_ALIAS) {
    return GROQ_FAST_ALIAS;
  }
  if (resolved === GROQ_VERSATILE_ALIAS) {
    return GROQ_FAST_ALIAS;
  }
  return DEFAULT_BACKUP_ALIAS;
}

export function getDefaultChatAlias(): string {
  return resolveLiteLLMModelAlias(process.env.TEXT_AI_MODEL || DEFAULT_CHAT_MODEL, DEFAULT_CHAT_ALIAS);
}

export function getDefaultBackupAlias(): string {
  return resolveLiteLLMModelAlias(process.env.TEXT_AI_BACKUP_MODEL || DEFAULT_BACKUP_MODEL, DEFAULT_BACKUP_ALIAS);
}

export function getDefaultBackgroundAlias(): string {
  return resolveLiteLLMModelAlias(process.env.BACKGROUND_AI_MODEL || DEFAULT_BACKGROUND_MODEL, DEFAULT_BACKGROUND_ALIAS);
}
