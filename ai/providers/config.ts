import {
  TextProviderType,
  VoiceProviderType,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_BACKGROUND_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../../shared/types/provider';

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
  voice: {
    provider: VoiceProviderType;
    apiKey?: string;
    model: string;
    voiceId: string;
    endpoint?: string;
  };
}

export function loadAIProvidersConfig(): AIProvidersConfig {
  const textApiKey = process.env.TEXT_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
  const voiceApiKey = process.env.VOICE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';

  const textModel = sanitizeTextModel(
    process.env.TEXT_AI_MODEL || DEFAULT_CHAT_MODEL,
    DEFAULT_CHAT_MODEL,
    'TEXT_AI_MODEL'
  );
  const textBackupModel = sanitizeTextModel(
    process.env.TEXT_AI_BACKUP_MODEL || DEFAULT_BACKUP_MODEL,
    DEFAULT_BACKUP_MODEL,
    'TEXT_AI_BACKUP_MODEL'
  );
  const backgroundModel = sanitizeTextModel(
    process.env.BACKGROUND_AI_MODEL || DEFAULT_BACKGROUND_MODEL,
    DEFAULT_BACKGROUND_MODEL,
    'BACKGROUND_AI_MODEL'
  );
  const voiceModel = sanitizeVoiceModel(
    process.env.VOICE_AI_MODEL || DEFAULT_VOICE_MODEL,
    DEFAULT_VOICE_MODEL,
    'VOICE_AI_MODEL'
  );

  return {
    text: {
      provider: 'gemini',
      apiKey: textApiKey,
      model: textModel,
      backupModel: textBackupModel,
      backgroundModel: backgroundModel,
      temperature: parseFloat(process.env.TEXT_AI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.TEXT_AI_MAX_TOKENS || '4096', 10),
      endpoint: process.env.TEXT_AI_ENDPOINT,
    },
    voice: {
      provider: 'gemini',
      apiKey: voiceApiKey,
      model: voiceModel,
      voiceId: process.env.VOICE_AI_VOICE_ID || 'aura',
      endpoint: process.env.VOICE_AI_ENDPOINT,
    },
  };
}
