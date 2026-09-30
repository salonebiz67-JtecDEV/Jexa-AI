import { ITextAIProvider } from './text-provider.interface';
import { IVoiceAIProvider } from './voice-provider.interface';
import { DevelopmentTextAIProvider } from './text-development.provider';
import { DevelopmentVoiceAIProvider } from './voice-development.provider';
import { loadAIProvidersConfig, AIProvidersConfig } from './config';
import { ProviderStatus } from '../../shared/types/provider';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private textProvider: ITextAIProvider;
  private voiceProvider: IVoiceAIProvider;
  private config: AIProvidersConfig;

  private constructor() {
    this.config = loadAIProvidersConfig();
    this.textProvider = new DevelopmentTextAIProvider();
    this.voiceProvider = new DevelopmentVoiceAIProvider();
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
    const hasTextKey = Boolean(this.config.text.apiKey);
    const hasVoiceKey = Boolean(this.config.voice.apiKey);

    return {
      textProvider: {
        type: this.textProvider.providerType,
        isConfigured: hasTextKey,
        hasApiKey: hasTextKey,
        model: this.textProvider.modelName,
        status: hasTextKey ? 'ready' : 'fallback_active',
        description: hasTextKey
          ? `Connected to ${this.textProvider.providerType}`
          : 'Operating in Development Mock mode. Add TEXT_AI_API_KEY to activate production model.',
      },
      voiceProvider: {
        type: this.voiceProvider.providerType,
        isConfigured: hasVoiceKey,
        hasApiKey: hasVoiceKey,
        model: this.voiceProvider.modelName,
        status: hasVoiceKey ? 'ready' : 'fallback_active',
        description: hasVoiceKey
          ? `Connected to ${this.voiceProvider.providerType}`
          : 'Operating in Development Mock mode. Add VOICE_AI_API_KEY to activate production voice model.',
      },
      database: {
        type: hasSupabase ? 'supabase' : 'in_memory_fallback',
        isConfigured: hasSupabase,
        status: hasSupabase ? 'connected' : 'unconfigured_fallback',
      },
    };
  }
}
