import { ITextAIProvider } from './text-provider.interface';
import { IVoiceAIProvider } from './voice-provider.interface';
import { GeminiTextAIProvider } from './gemini.provider';
import { GeminiVoiceAIProvider } from './gemini-voice.provider';
import { loadAIProvidersConfig, AIProvidersConfig } from './config';
import { ProviderStatus } from '../../shared/types/provider';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private textProvider: ITextAIProvider;
  private voiceProvider: IVoiceAIProvider;
  private config: AIProvidersConfig;

  private constructor() {
    this.config = loadAIProvidersConfig();
    this.textProvider = new GeminiTextAIProvider();
    this.voiceProvider = new GeminiVoiceAIProvider();

    if (this.textProvider.isConfigured) {
      console.log('[AIProviderRegistry] Connected to real Gemini Text Provider (gemini-3.8-flash).');
    } else {
      console.warn('[AIProviderRegistry] GEMINI_API_KEY not configured. Real errors will be returned on chat requests.');
    }

    if (this.voiceProvider.isConfigured) {
      console.log('[AIProviderRegistry] Connected to real Gemini Voice Provider (gemini-3.8-flash-lite-tts).');
    } else {
      console.warn('[AIProviderRegistry] Voice API not configured. Real errors will be returned on voice requests.');
    }
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public getTextProvider(): ITextAIProvider {
    return this.textProvider;
  }

  public getVoiceProvider(): IVoiceAIProvider {
    return this.voiceProvider;
  }

  public registerTextProvider(provider: ITextAIProvider): void {
    this.textProvider = provider;
  }

  public registerVoiceProvider(provider: IVoiceAIProvider): void {
    this.voiceProvider = provider;
  }

  public getStatus(hasSupabase: boolean): ProviderStatus {
    const hasTextKey = this.textProvider.isConfigured;
    const hasVoiceKey = this.voiceProvider.isConfigured;

    return {
      textProvider: {
        type: this.textProvider.providerType,
        isConfigured: hasTextKey,
        hasApiKey: hasTextKey,
        model: this.textProvider.modelName,
        status: hasTextKey ? 'ready' : 'fallback_active',
        description: hasTextKey ? 'Active primary provider' : 'Fallback provider active',
      },
      voiceProvider: {
        type: this.voiceProvider.providerType,
        isConfigured: hasVoiceKey,
        hasApiKey: hasVoiceKey,
        model: this.voiceProvider.modelName,
        status: hasVoiceKey ? 'ready' : 'fallback_active',
        description: hasVoiceKey ? 'Active voice engine' : 'Fallback voice engine',
      },
      database: {
        type: hasSupabase ? 'supabase' : 'in_memory_fallback',
        isConfigured: hasSupabase,
        status: hasSupabase ? 'connected' : 'unconfigured_fallback',
      },
      isProductionReady: hasTextKey && hasVoiceKey && hasSupabase,
    };
  }
}
