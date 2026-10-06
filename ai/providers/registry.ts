import { ITextAIProvider } from './text-provider.interface';
import { IVoiceAIProvider } from './voice-provider.interface';
import { GeminiTextAIProvider } from './gemini.provider';
import { GeminiVoiceAIProvider } from './gemini-voice.provider';
import { GroqTextAIProvider } from './groq.provider';
import { ElevenLabsVoiceAIProvider } from './elevenlabs.provider';
import { PersonalVoiceAIProvider } from './personal-voice.provider';
import { ProviderStatus, TextProviderType, VoiceProviderType, ProviderDetail, ProviderHealthStatus } from '../../shared/types/provider';
import { AIProvidersConfig, loadAIProvidersConfig } from './config';

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
    const personalVoice = new PersonalVoiceAIProvider();

    this.voiceProviders.set('gemini', geminiVoice);
    this.voiceProviders.set('elevenlabs', elevenLabsVoice);
    this.voiceProviders.set('personal', personalVoice);

    // Default voice provider based on config or availability
    if (this.config.voice.provider === 'elevenlabs' && elevenLabsVoice.isConfigured) {
      this.defaultVoiceType = 'elevenlabs';
    } else if (this.config.voice.provider === 'personal' && personalVoice.isConfigured) {
      this.defaultVoiceType = 'personal';
    } else {
      this.defaultVoiceType = 'gemini';
    }

    console.log(
      `[AIProviderRegistry] Loaded providers - Text: [gemini (${geminiText.isConfigured ? 'ready' : 'missing key'}), groq (${groqText.isConfigured ? 'ready' : 'missing key'})] | Voice: [gemini (${geminiVoice.isConfigured ? 'ready' : 'missing key'}), elevenlabs (${elevenLabsVoice.isConfigured ? 'ready' : 'missing key'})]`
    );
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
    const fallback =
      this.voiceProviders.get('gemini') ||
      this.voiceProviders.get('elevenlabs') ||
      this.voiceProviders.get('personal');
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

  public getDefaultTextType(): TextProviderType {
    return this.defaultTextType;
  }

  public getDefaultVoiceType(): VoiceProviderType {
    return this.defaultVoiceType;
  }

  public async testTextProvider(type: TextProviderType): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    code?: string;
    status?: ProviderHealthStatus;
    error?: string;
  }> {
    const provider = this.textProviders.get(type);
    if (!provider) {
      return { success: false, latencyMs: 0, model: 'unknown', code: 'UNAVAILABLE', status: 'UNAVAILABLE', error: `Text provider '${type}' is not registered.` };
    }
    if ('testConnection' in provider && typeof (provider as any).testConnection === 'function') {
      const res = await (provider as any).testConnection();
      const status: ProviderHealthStatus = res.success
        ? 'CONNECTED'
        : !provider.isConfigured
        ? 'NOT_CONFIGURED'
        : res.error?.includes('404') || res.error?.includes('not found')
        ? 'MODEL_NOT_FOUND'
        : res.error?.includes('401') || res.error?.includes('API_KEY')
        ? 'AUTHENTICATION_ERROR'
        : res.error?.includes('429') || res.error?.includes('quota')
        ? 'QUOTA_EXHAUSTED'
        : 'UNAVAILABLE';
      return { ...res, status };
    }

    const startTime = Date.now();
    try {
      const res = await provider.generateResponse({
        systemPrompt: 'Respond with exactly: ping',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
        temperature: 0.1,
      });
      return { success: true, latencyMs: Date.now() - startTime, model: res.model, status: 'CONNECTED' };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: provider.modelName,
        code: 'UNAVAILABLE',
        status: !provider.isConfigured ? 'NOT_CONFIGURED' : 'UNAVAILABLE',
        error: err.message,
      };
    }
  }

  public async testVoiceProvider(type: VoiceProviderType): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    voiceId?: string;
    audioUrl?: string;
    code?: string;
    status?: ProviderHealthStatus;
    error?: string;
    message?: string;
  }> {
    const provider = this.voiceProviders.get(type);
    if (!provider) {
      return { success: false, latencyMs: 0, model: 'unknown', code: 'UNAVAILABLE', status: 'UNAVAILABLE', error: `Voice provider '${type}' is not registered.` };
    }
    if ('testConnection' in provider && typeof (provider as any).testConnection === 'function') {
      return await (provider as any).testConnection();
    }

    const startTime = Date.now();
    try {
      const res = await provider.synthesizeSpeech({ text: 'Hello', voiceId: 'aura' });
      return {
        success: Boolean(res.audioUrl),
        latencyMs: Date.now() - startTime,
        model: provider.modelName,
        audioUrl: res.audioUrl,
        code: 'CONNECTED',
        status: 'CONNECTED',
        message: 'Voice generated successfully',
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: provider.modelName,
        code: (err as any).code || 'UNAVAILABLE',
        status: !provider.isConfigured ? 'NOT_CONFIGURED' : 'UNAVAILABLE',
        error: err.message,
      };
    }
  }

  public getStatus(hasSupabase: boolean, activeTextType?: TextProviderType, activeVoiceType?: VoiceProviderType): ProviderStatus {
    const textType = activeTextType || this.defaultTextType;
    const voiceType = activeVoiceType || this.defaultVoiceType;

    const activeText = this.getTextProvider(textType);
    const activeVoice = this.getVoiceProvider(voiceType);

    const geminiText = this.textProviders.get('gemini');
    const groqText = this.textProviders.get('groq');

    const geminiVoice = this.voiceProviders.get('gemini') as any;
    const elevenLabsVoice = this.voiceProviders.get('elevenlabs') as any;
    const personalVoice = this.voiceProviders.get('personal') as any;

    const geminiTextStatus: ProviderHealthStatus = !geminiText?.isConfigured
      ? 'NOT_CONFIGURED'
      : (geminiText as any)?.lastError
      ? 'UNAVAILABLE'
      : 'CONNECTED';

    const groqTextStatus: ProviderHealthStatus = !groqText?.isConfigured
      ? 'NOT_CONFIGURED'
      : (groqText as any)?.lastError?.includes('404')
      ? 'MODEL_NOT_FOUND'
      : (groqText as any)?.lastError
      ? 'UNAVAILABLE'
      : 'CONNECTED';

    const geminiVoiceStatus: ProviderHealthStatus = geminiVoice?.getStatus
      ? geminiVoice.getStatus()
      : !geminiVoice?.isConfigured
      ? 'NOT_CONFIGURED'
      : 'UNAVAILABLE';

    const elevenLabsVoiceStatus: ProviderHealthStatus = elevenLabsVoice?.getStatus
      ? elevenLabsVoice.getStatus()
      : !elevenLabsVoice?.isConfigured
      ? 'NOT_CONFIGURED'
      : 'UNAVAILABLE';

    const personalVoiceStatus: ProviderHealthStatus = personalVoice?.getStatus
      ? personalVoice.getStatus()
      : !personalVoice?.isConfigured
      ? 'NOT_CONFIGURED'
      : 'UNAVAILABLE';

    const availableTextProviders: ProviderDetail[] = [
      {
        type: 'gemini',
        name: 'Google Gemini',
        isConfigured: Boolean(geminiText?.isConfigured),
        model: geminiText?.modelName || 'gemini-3.8-flash',
        description: 'Deep multimodal reasoning, large context window & fast latency',
        status: geminiTextStatus,
        error: (geminiText as any)?.lastError,
      },
      {
        type: 'groq',
        name: 'Groq Cloud',
        isConfigured: Boolean(groqText?.isConfigured),
        model: groqText?.modelName || 'llama-3.3-70b-versatile',
        description: 'Ultra high-speed LPU inference powered by Meta Llama 3.3',
        status: groqTextStatus,
        error: (groqText as any)?.lastError,
      },
    ];

    const availableVoiceProviders: ProviderDetail[] = [
      {
        type: 'gemini',
        name: 'Gemini Voice TTS',
        isConfigured: Boolean(geminiVoice?.isConfigured),
        model: geminiVoice?.modelName || 'gemini-3.8-flash-lite-tts',
        voiceId: 'Aoede (Aura) / Fenrir (Atlas) / Kore (Lyra)',
        description: 'Direct expressive neural voice generated by Google GenAI',
        status: geminiVoiceStatus,
        error: geminiVoice?.lastError,
        lastSuccessfulTest: geminiVoice?.lastSuccessfulTest,
      },
      {
        type: 'elevenlabs',
        name: 'ElevenLabs',
        isConfigured: Boolean(elevenLabsVoice?.isConfigured),
        model: elevenLabsVoice?.modelName || 'eleven_multilingual_v2',
        voiceId: elevenLabsVoice?.defaultVoiceId || '21m00Tcm4TlvDq8ikWAM (Rachel)',
        description: 'Industry-standard realistic speech synthesis with emotional nuance',
        status: elevenLabsVoiceStatus,
        error: elevenLabsVoice?.lastError,
        lastSuccessfulTest: elevenLabsVoice?.lastSuccessfulTest,
      },
      {
        type: 'personal',
        name: 'JEXA Personal Voice',
        isConfigured: Boolean(personalVoice?.isConfigured),
        model: personalVoice?.modelName || 'none',
        voiceId: personalVoice?.referenceId || (personalVoice?.referenceMetadata ? 'Sample uploaded' : 'No voice sample'),
        description: 'Personal reference-based voice synthesis using your recorded audio',
        status: personalVoiceStatus,
        error: personalVoice?.lastError,
        lastSuccessfulTest: personalVoice?.lastSuccessfulTest,
      },
    ];

    const activeTextStatus = activeText.providerType === 'groq' ? groqTextStatus : geminiTextStatus;
    const activeVoiceStatus =
      activeVoice.providerType === 'elevenlabs'
        ? elevenLabsVoiceStatus
        : activeVoice.providerType === 'personal'
        ? personalVoiceStatus
        : geminiVoiceStatus;

    return {
      textProvider: {
        type: activeText.providerType,
        isConfigured: activeText.isConfigured,
        hasApiKey: activeText.isConfigured,
        model: activeText.modelName,
        status: activeTextStatus,
        description: `${activeText.providerType === 'groq' ? 'Groq LPU' : 'Google Gemini'} active`,
        lastError: (activeText as any)?.lastError,
      },
      voiceProvider: {
        type: activeVoice.providerType,
        isConfigured: activeVoice.isConfigured,
        hasApiKey: activeVoice.isConfigured,
        model: activeVoice.modelName,
        voiceId:
          activeVoice.providerType === 'elevenlabs'
            ? elevenLabsVoice?.defaultVoiceId || '21m00Tcm4TlvDq8ikWAM'
            : activeVoice.providerType === 'personal'
            ? personalVoice?.referenceId || (personalVoice?.referenceMetadata ? 'Sample uploaded' : 'No voice sample')
            : 'Aoede / Fenrir / Kore',
        status: activeVoiceStatus,
        description:
          activeVoice.providerType === 'elevenlabs'
            ? 'ElevenLabs Speech active'
            : activeVoice.providerType === 'personal'
            ? `JEXA Personal Voice (${personalVoice?.engine || 'none'}) active`
            : 'Gemini Neural Voice active',
        lastError: (activeVoice as any)?.lastError,
        lastSuccessfulTest: (activeVoice as any)?.lastSuccessfulTest,
      },
      availableTextProviders,
      availableVoiceProviders,
      database: {
        type: hasSupabase ? 'supabase' : 'in_memory_fallback',
        isConfigured: hasSupabase,
        status: hasSupabase ? 'connected' : 'unconfigured_fallback',
      },
      isProductionReady: activeText.isConfigured && activeVoice.isConfigured && hasSupabase,
    };
  }
}
