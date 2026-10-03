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
  groq: {
    apiKey?: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  voice: {
    provider: VoiceProviderType;
    apiKey?: string;
    model: string;
    voiceId: string;
    endpoint?: string;
  };
  elevenlabs: {
    apiKey?: string;
    voiceId: string;
    modelId: string;
  };
}

export function loadAIProvidersConfig(): AIProvidersConfig {
  // Check process.env in Node.js backend
  const textApiKey = process.env.TEXT_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  const textProvider = (process.env.TEXT_AI_PROVIDER as TextProviderType) || (textApiKey ? 'gemini' : 'development_mock');

  const voiceApiKey = process.env.VOICE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  const voiceProvider = (process.env.VOICE_AI_PROVIDER as VoiceProviderType) || 'gemini';

  const groqApiKey = process.env.GROQ_API_KEY || '';
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
  const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
  const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  return {
    text: {
      provider: textProvider,
      apiKey: textApiKey,
      model: process.env.TEXT_AI_MODEL || 'gemini-3.8-flash',
      temperature: parseFloat(process.env.TEXT_AI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.TEXT_AI_MAX_TOKENS || '2048', 10),
      endpoint: process.env.TEXT_AI_ENDPOINT,
    },
    groq: {
      apiKey: groqApiKey,
      model: groqModel,
      temperature: parseFloat(process.env.GROQ_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.GROQ_MAX_TOKENS || '2048', 10),
    },
    voice: {
      provider: voiceProvider,
      apiKey: voiceApiKey,
      model: process.env.VOICE_AI_MODEL || 'gemini-3.8-flash-lite-tts',
      voiceId: process.env.VOICE_AI_VOICE_ID || 'aura',
      endpoint: process.env.VOICE_AI_ENDPOINT,
    },
    elevenlabs: {
      apiKey: elevenLabsApiKey,
      voiceId: elevenLabsVoiceId,
      modelId: elevenLabsModelId,
    },
  };
}
