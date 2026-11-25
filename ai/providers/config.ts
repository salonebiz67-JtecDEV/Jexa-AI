import {
  TextProviderType,
  VoiceProviderType,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_BACKGROUND_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../../shared/types/provider';
import { resolveDirectGeminiModel } from './model-aliases';
import { LocalConfigManager } from '../../shared/config/local-config';

export function sanitizeTextModel(modelName: string | undefined, fallback: string, label: string): string {
  const trimmed = (modelName || '').trim();
  if (!trimmed) return fallback;
  if (isTtsModel(trimmed)) {
    console.warn(`[AIConfig] TTS model '${trimmed}' in ${label} cannot be used as a chat/text model. Reverting to '${fallback}'.`);
    return fallback;
  }
  return trimmed;
}

export function sanitizeVoiceModel(modelName: string | undefined, fallback: string, label: string): string {
  const trimmed = (modelName || '').trim();
  if (!trimmed) return fallback;
  if (!isTtsModel(trimmed)) {
    console.warn(`[AIConfig] Non-TTS chat model '${trimmed}' in ${label} cannot be used as a voice model. Reverting to '${fallback}'.`);
    return fallback;
  }
  return trimmed;
}

export function normalizeGatewayBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Support Render fromService hostport (e.g. "jexa-litellm-gateway:4000") by prepending http://
  const candidate =
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) && /^[a-zA-Z0-9._-]+(?::\d{1,5})?$/.test(trimmed)
      ? `http://${trimmed}`
      : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return candidate;
    }
  } catch {
    // Invalid URL
  }
  return '';
}

export interface AIProvidersConfig {
  text: {
    provider: TextProviderType;
    apiKey?: string;
    model: string;
    backupModel: string;
    backgroundModel: string;
    temperature: number;
    maxTokens: number;
    endpoint?: string;
  };
  gateway: {
    enabled: boolean;
    enforced: boolean;
    baseUrlConfigured: boolean;
    hasGatewayKey: boolean;
  };
  voice: {
    provider: VoiceProviderType;
    apiKey?: string;
    model: string;
    voiceId: string;
    endpoint?: string;
  };
}

export function loadAIProvidersConfig(): AIProvidersConfig {
  const rawBaseUrl = (LocalConfigManager.get('LITELLM_BASE_URL') || '').trim();
  const litellmBaseUrl = normalizeGatewayBaseUrl(rawBaseUrl);
  const litellmKey = (
    LocalConfigManager.get('LITELLM_API_KEY') ||
    LocalConfigManager.get('LITELLM_MASTER_KEY') ||
    ''
  ).trim();
  const gatewayEnabled = Boolean(litellmBaseUrl && litellmKey);
  const gatewayEnforced = LocalConfigManager.get('ENFORCE_LITELLM_GATEWAY') === 'true';

  const requestedProvider = (LocalConfigManager.get('TEXT_AI_PROVIDER') || '').trim().toLowerCase();
  const textProvider: TextProviderType =
    gatewayEnabled || gatewayEnforced || requestedProvider === 'litellm' ? 'litellm' : 'gemini';

  const geminiLocal = LocalConfigManager.getGeminiConfig();

  const textApiKey =
    textProvider === 'litellm'
      ? litellmKey
      : LocalConfigManager.get('TEXT_AI_API_KEY') || geminiLocal.apiKey || '';

  const voiceApiKey =
    LocalConfigManager.get('VOICE_AI_API_KEY') || geminiLocal.voiceApiKey || '';

  const rawTextModel = sanitizeTextModel(
    LocalConfigManager.get('TEXT_AI_MODEL') || LocalConfigManager.get('GEMINI_MODEL') || DEFAULT_CHAT_MODEL,
    DEFAULT_CHAT_MODEL,
    'TEXT_AI_MODEL'
  );
  const rawBackupModel = sanitizeTextModel(
    LocalConfigManager.get('TEXT_AI_BACKUP_MODEL') || DEFAULT_BACKUP_MODEL,
    DEFAULT_BACKUP_MODEL,
    'TEXT_AI_BACKUP_MODEL'
  );
  const rawBackgroundModel = sanitizeTextModel(
    LocalConfigManager.get('BACKGROUND_AI_MODEL') || DEFAULT_BACKGROUND_MODEL,
    DEFAULT_BACKGROUND_MODEL,
    'BACKGROUND_AI_MODEL'
  );

  // When running direct Gemini fallback (no LiteLLM configured), ensure concrete Gemini model IDs
  const textModel =
    textProvider === 'litellm' ? rawTextModel : resolveDirectGeminiModel(rawTextModel, DEFAULT_CHAT_MODEL);
  const textBackupModel =
    textProvider === 'litellm' ? rawBackupModel : resolveDirectGeminiModel(rawBackupModel, DEFAULT_BACKUP_MODEL);
  const backgroundModel =
    textProvider === 'litellm'
      ? rawBackgroundModel
      : resolveDirectGeminiModel(rawBackgroundModel, DEFAULT_BACKGROUND_MODEL);

  const voiceModel = sanitizeVoiceModel(
    LocalConfigManager.get('VOICE_AI_MODEL') || LocalConfigManager.get('GEMINI_VOICE_MODEL') || DEFAULT_VOICE_MODEL,
    DEFAULT_VOICE_MODEL,
    'VOICE_AI_MODEL'
  );

  return {
    text: {
      provider: textProvider,
      apiKey: textApiKey,
      model: textModel,
      backupModel: textBackupModel,
      backgroundModel: backgroundModel,
      temperature: geminiLocal.temperature,
      maxTokens: geminiLocal.maxTokens,
      endpoint: undefined,
    },
    gateway: {
      enabled: gatewayEnabled,
      enforced: gatewayEnforced,
      baseUrlConfigured: Boolean(litellmBaseUrl),
      hasGatewayKey: Boolean(litellmKey),
    },
    voice: {
      provider: 'gemini',
      apiKey: voiceApiKey,
      model: voiceModel,
      voiceId: geminiLocal.voiceName,
      endpoint: LocalConfigManager.get('VOICE_AI_ENDPOINT'),
    },
  };
}
