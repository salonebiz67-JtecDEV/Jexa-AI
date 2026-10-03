import { ITextAIProvider } from './text-provider.interface';
import { IVoiceAIProvider } from './voice-provider.interface';
import { GeminiTextAIProvider } from './gemini.provider';
import { GeminiVoiceAIProvider } from './gemini-voice.provider';
import { GroqTextAIProvider } from './groq.provider';
import { ElevenLabsVoiceAIProvider } from './elevenlabs.provider';
import { loadAIProvidersConfig, AIProvidersConfig } from './config';
import { ProviderStatus, TextProviderType, VoiceProviderType, ProviderDetail } from '../../shared/types/provider';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private textProviders: Map<TextProviderType, ITextAIProvider> = new Map();
  private voiceProviders: Map<VoiceProviderType, IVoiceAIProvider> = new Map();
  private defaultTextType: TextProviderType = 'gemini';
  private defaultVoiceType: VoiceProviderType = 'gemini';
  private config: AIProvidersConfig;

  private constructor() {
    this.config = loadAIProvidersConfig();

    // Initialize Text Providers
    const geminiText = new GeminiTextAIProvider();
    const groqText = new GroqTextAIProvider();

    this.textProviders.set('gemini', geminiText);
    this.textProviders.set('groq', groqText);

    // Default text provider based on config or availability
    if (this.config.text.provider === 'groq' && groqText.isConfigured) {
      this.defaultTextType = 'groq';
    } else {
      this.defaultTextType = 'gemini';
    }

    // Initialize Voice Providers
    const geminiVoice = new GeminiVoiceAIProvider();
    const elevenLabsVoice = new ElevenLabsVoiceAIProvider();

    this.voiceProviders.set('gemini', geminiVoice);
    this.voiceProviders.set('elevenlabs', elevenLabsVoice);

    // Default voice provider based on config or availability
    if (this.config.voice.provider === 'elevenlabs' && elevenLabsVoice.isConfigured) {
      this.defaultVoiceType = 'elevenlabs';
    } else {
      this.defaultVoiceType = 'gemini';
    }

    console.log(`[AIProviderRegistry] Loaded providers - Text: [gemini (${geminiText.isConfigured ? 'ready' : 'missing key'}), groq (${groqText.isConfigured ? 'ready' : 'missing key'})] | Voice: [gemini (${geminiVoice.isConfigured ? 'ready' : 'missing key'}), elevenlabs (${elevenLabsVoice.isConfigured ? 'ready' : 'missing key'})]`);
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public getTextProvider(type?: TextProviderType): ITextAIProvider {
    const targetType = type || this.defaultTextType;
    const provider = this.textProviders.get(targetType);
    if (provider) {
      return provider;
    }
    const fallback = this.textProviders.get('gemini') || this.textProviders.get('groq');
    if (fallback) {
      return fallback;
    }
    throw new Error('[AIProviderRegistry] No text provider available.');
  }

  public getVoiceProvider(type?: VoiceProviderType): IVoiceAIProvider {
    const targetType = type || this.defaultVoiceType;
    const provider = this.voiceProviders.get(targetType);
    if (provider) {
      return provider;
    }
    const fallback = this.voiceProviders.get('gemini') || this.voiceProviders.get('elevenlabs');
    if (fallback) {
      return fallback;
    }
    throw new Error('[AIProviderRegistry] No voice provider available.');
  }

  public registerTextProvider(provider: ITextAIProvider): void {
    this.textProviders.set(provider.providerType, provider);
  }

  public registerVoiceProvider(provider: IVoiceAIProvider): void {
    this.voiceProviders.set(provider.providerType, provider);
  }

  public setDefaultTextType(type: TextProviderType): void {
    this.defaultTextType = type;
  }

  public setDefaultVoiceType(type: VoiceProviderType): void {
    this.defaultVoiceType = type;
  }

  public getStatus(hasSupabase: boolean, activeTextType?: TextProviderType, activeVoiceType?: VoiceProviderType): ProviderStatus {
    const textType = activeTextType || this.defaultTextType;
    const voiceType = activeVoiceType || this.defaultVoiceType;

    const activeText = this.getTextProvider(textType);
    const activeVoice = this.getVoiceProvider(voiceType);

    const availableTextProviders: ProviderDetail[] = [
      {
        type: 'gemini',
        name: 'Google Gemini',
        isConfigured: Boolean(this.textProviders.get('gemini')?.isConfigured),
        model: this.textProviders.get('gemini')?.modelName || 'gemini-3.8-flash',
        description: 'Deep multimodal reasoning, large context window & fast latency',
      },
      {
        type: 'groq',
        name: 'Groq Cloud',
        isConfigured: Boolean(this.textProviders.get('groq')?.isConfigured),
        model: this.textProviders.get('groq')?.modelName || 'llama-3.3-70b-versatile',
        description: 'Ultra high-speed LPU inference powered by Meta Llama 3.3',
      },
    ];

    const availableVoiceProviders: ProviderDetail[] = [
      {
        type: 'gemini',
        name: 'Gemini Voice TTS',
        isConfigured: Boolean(this.voiceProviders.get('gemini')?.isConfigured),
        model: this.voiceProviders.get('gemini')?.modelName || 'gemini-3.8-flash-lite-tts',
        description: 'Direct expressive neural voice generated by Google GenAI',
      },
      {
        type: 'elevenlabs',
        name: 'ElevenLabs',
        isConfigured: Boolean(this.voiceProviders.get('elevenlabs')?.isConfigured),
        model: this.voiceProviders.get('elevenlabs')?.modelName || 'eleven_multilingual_v2',
        description: 'Industry-standard realistic speech synthesis with emotional nuance',
      },
    ];

    const hasTextKey = activeText.isConfigured;
    const hasVoiceKey = activeVoice.isConfigured;

    return {
      textProvider: {
        type: activeText.providerType,
        isConfigured: hasTextKey,
        hasApiKey: hasTextKey,
        model: activeText.modelName,
        status: hasTextKey ? 'ready' : 'missing_key',
        description: `${activeText.providerType === 'groq' ? 'Groq Llama 3.3' : 'Google Gemini 3.8'} active`,
      },
      voiceProvider: {
        type: activeVoice.providerType,
        isConfigured: hasVoiceKey,
        hasApiKey: hasVoiceKey,
        model: activeVoice.modelName,
        status: hasVoiceKey ? 'ready' : 'missing_key',
        description: `${activeVoice.providerType === 'elevenlabs' ? 'ElevenLabs Speech' : 'Gemini Neural Voice'} active`,
      },
      availableTextProviders,
      availableVoiceProviders,
      database: {
        type: hasSupabase ? 'supabase' : 'in_memory_fallback',
        isConfigured: hasSupabase,
        status: hasSupabase ? 'connected' : 'unconfigured_fallback',
      },
      isProductionReady: hasTextKey && hasVoiceKey && hasSupabase,
    };
  }
}
