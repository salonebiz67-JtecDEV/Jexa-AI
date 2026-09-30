import { TextProviderType, VoiceProviderType } from '../../shared/types/provider';

export interface AIProvidersConfig {
  text: {
    provider: TextProviderType;
    apiKey?: string;
    model: string;
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
  // Check process.env in Node.js backend
  const textApiKey = process.env.TEXT_AI_API_KEY || '';
  const textProvider = (process.env.TEXT_AI_PROVIDER as TextProviderType) || (textApiKey ? 'gemini' : 'development_mock');

  const voiceApiKey = process.env.VOICE_AI_API_KEY || '';
  const voiceProvider = (process.env.VOICE_AI_PROVIDER as VoiceProviderType) || 'development_mock';

  return {
    text: {
      provider: textProvider,
      apiKey: textApiKey,
      model: process.env.TEXT_AI_MODEL || 'jexa-foundation-v1',
      temperature: parseFloat(process.env.TEXT_AI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.TEXT_AI_MAX_TOKENS || '2048', 10),
      endpoint: process.env.TEXT_AI_ENDPOINT,
    },
    voice: {
      provider: voiceProvider,
      apiKey: voiceApiKey,
      model: process.env.VOICE_AI_MODEL || 'jexa-voice-neural-1',
      voiceId: process.env.VOICE_AI_VOICE_ID || 'aura-jexa-serene',
      endpoint: process.env.VOICE_AI_ENDPOINT,
    },
  };
}
