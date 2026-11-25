import { ITextAIProvider } from './text-provider.interface';
import { IVoiceAIProvider } from './voice-provider.interface';
import { GeminiTextAIProvider } from './gemini.provider';
import { GeminiVoiceAIProvider } from './gemini-voice.provider';
import { LiteLLMTextAIProvider } from './litellm.provider';
import { resolveDirectGeminiModel, resolveLiteLLMModelAlias } from './model-aliases';
import {
  ProviderStatus,
  TextProviderType,
  VoiceProviderType,
  ProviderDetail,
  ProviderHealthStatus,
  DEFAULT_CHAT_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../../shared/types/provider';
import { AIProvidersConfig, loadAIProvidersConfig, sanitizeTextModel, sanitizeVoiceModel } from './config';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private textProviders: Map<TextProviderType, ITextAIProvider> = new Map();
  private voiceProviders: Map<VoiceProviderType, IVoiceAIProvider> = new Map();
  private defaultTextType: TextProviderType = 'gemini';
  private defaultVoiceType: VoiceProviderType = 'gemini';
  private config: AIProvidersConfig;

  private activeTextModel: string;
  private activeBackupModel: string;
  private activeVoiceModel: string;

  private backupTextProvider: ITextAIProvider;
  private backgroundTextProvider: ITextAIProvider;

  private constructor() {
    this.config = loadAIProvidersConfig();
    this.defaultTextType = this.config.text.provider;
    this.activeTextModel = this.config.text.model;
    this.activeBackupModel = this.config.text.backupModel;
    this.activeVoiceModel = this.config.voice.model;

    const geminiText = new GeminiTextAIProvider(
      resolveDirectGeminiModel(this.activeTextModel, DEFAULT_CHAT_MODEL)
    );
    const geminiBackup = new GeminiTextAIProvider(
      resolveDirectGeminiModel(this.activeBackupModel, DEFAULT_BACKUP_MODEL)
    );
    const geminiBackground = new GeminiTextAIProvider(
      resolveDirectGeminiModel(this.config.text.backgroundModel)
    );

    const litellmText = new LiteLLMTextAIProvider(this.activeTextModel);
    const litellmBackup = new LiteLLMTextAIProvider(this.activeBackupModel);
    const litellmBackground = new LiteLLMTextAIProvider(this.config.text.backgroundModel);

    const geminiVoice = new GeminiVoiceAIProvider(this.activeVoiceModel);

    this.textProviders.set('gemini', geminiText);
    this.textProviders.set('litellm', litellmText);
    this.voiceProviders.set('gemini', geminiVoice);

    if (this.defaultTextType === 'litellm' && (litellmText.isConfigured || this.config.gateway.enforced)) {
      this.defaultTextType = 'litellm';
      this.backupTextProvider = litellmBackup.isConfigured || this.config.gateway.enforced ? litellmBackup : litellmText;
      this.backgroundTextProvider =
        litellmBackground.isConfigured || this.config.gateway.enforced ? litellmBackground : litellmText;
      if (!litellmText.isConfigured) {
        console.error(
          '[AIProviderRegistry] CRITICAL: ENFORCE_LITELLM_GATEWAY=true but LiteLLM is not configured. Chat will fail closed until LITELLM_BASE_URL and LITELLM_API_KEY are set.'
        );
      }
    } else {
      this.defaultTextType = 'gemini';
      this.backupTextProvider = geminiBackup.isConfigured ? geminiBackup : geminiText;
      this.backgroundTextProvider = geminiBackground.isConfigured ? geminiBackground : geminiText;
    }

    const activePrimary = this.textProviders.get(this.defaultTextType) || geminiText;
    console.log(
      `[AIProviderRegistry] Active text route: ${this.defaultTextType} (${activePrimary.modelName}, configured=${activePrimary.isConfigured}, enforced=${this.config.gateway.enforced}) | Backup: ${this.backupTextProvider.modelName} | Background: ${this.backgroundTextProvider.modelName} | Voice: gemini (${geminiVoice.modelName}, configured=${geminiVoice.isConfigured})`
    );
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public static reload(): AIProviderRegistry {
    AIProviderRegistry.instance = new AIProviderRegistry();
    return AIProviderRegistry.instance;
  }

  public getConfig(): AIProvidersConfig {
    return this.config;
  }

  public isGatewayActive(): boolean {
    const litellm = this.textProviders.get('litellm');
    return this.defaultTextType === 'litellm' && Boolean(litellm?.isConfigured);
  }

  public isGatewayEnforced(): boolean {
    return Boolean(this.config.gateway.enforced);
  }

  public async checkGatewayHealth(): Promise<{
    configured: boolean;
    active: boolean;
    enforced: boolean;
    reachable: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const litellm = this.textProviders.get('litellm') as LiteLLMTextAIProvider | undefined;
    const active = this.isGatewayActive();
    const enforced = this.isGatewayEnforced();

    if (!litellm || !litellm.isConfigured) {
      return {
        configured: false,
        active,
        enforced,
        reachable: false,
        latencyMs: 0,
        error: litellm?.lastError || 'LiteLLM gateway is not configured.',
      };
    }

    const health = await litellm.checkGatewayHealth();
    return {
      configured: true,
      active,
      enforced,
      reachable: health.reachable,
      latencyMs: health.latencyMs,
      error: health.error,
    };
  }

  public getActiveTextModel(): string {
    return this.activeTextModel;
  }

  public getActiveBackupModel(): string {
    return this.activeBackupModel;
  }

  public getActiveVoiceModel(): string {
    return this.activeVoiceModel;
  }

  public setSelectedModels(models: { textModel?: string; backupModel?: string; voiceModel?: string }): void {
    const useGateway = this.isGatewayActive() || this.isGatewayEnforced();

    if (models.textModel !== undefined) {
      const clean = sanitizeTextModel(models.textModel, DEFAULT_CHAT_MODEL, 'selectedTextModel');
      this.activeTextModel = clean;
      this.textProviders.set('gemini', new GeminiTextAIProvider(resolveDirectGeminiModel(clean, DEFAULT_CHAT_MODEL)));
      if (useGateway || this.textProviders.get('litellm')?.isConfigured) {
        this.textProviders.set('litellm', new LiteLLMTextAIProvider(clean));
      }
    }
    if (models.backupModel !== undefined) {
      const cleanBackup = sanitizeTextModel(models.backupModel, DEFAULT_BACKUP_MODEL, 'selectedBackupModel');
      this.activeBackupModel = cleanBackup;
      this.backupTextProvider = useGateway
        ? new LiteLLMTextAIProvider(cleanBackup)
        : new GeminiTextAIProvider(resolveDirectGeminiModel(cleanBackup, DEFAULT_BACKUP_MODEL));
    }
    if (models.voiceModel !== undefined) {
      const cleanVoice = sanitizeVoiceModel(models.voiceModel, DEFAULT_VOICE_MODEL, 'selectedVoiceModel');
      this.activeVoiceModel = cleanVoice;
      this.voiceProviders.set('gemini', new GeminiVoiceAIProvider(cleanVoice));
    }
  }

  public getTextProvider(type?: TextProviderType, customModel?: string): ITextAIProvider {
    const useGateway = this.isGatewayActive() || this.isGatewayEnforced();
    const effectiveType: TextProviderType =
      useGateway && (!type || type === 'gemini' || type === 'litellm' || type === 'groq')
        ? 'litellm'
        : type === 'litellm' && (this.textProviders.get('litellm')?.isConfigured || this.isGatewayEnforced())
        ? 'litellm'
        : 'gemini';

    if (customModel && customModel.trim()) {
      const trimmed = customModel.trim();
      if (isTtsModel(trimmed)) {
        throw new Error(`TTS model '${trimmed}' cannot be used for chat.`);
      }
      const existing = this.textProviders.get(effectiveType);
      if (effectiveType === 'litellm') {
        const alias = resolveLiteLLMModelAlias(trimmed);
        if (existing && existing.modelName === alias) {
          return existing;
        }
        return new LiteLLMTextAIProvider(alias);
      }

      const directModel = resolveDirectGeminiModel(trimmed, DEFAULT_CHAT_MODEL);
      if (existing && existing.modelName === directModel) {
        return existing;
      }
      return new GeminiTextAIProvider(directModel);
    }

    const provider = this.textProviders.get(effectiveType) || this.textProviders.get('gemini');
    if (provider) return provider;
    throw new Error('[AIProviderRegistry] Text provider unavailable.');
  }

  public getBackupTextProvider(customBackupModel?: string): ITextAIProvider {
    const useGateway = this.isGatewayActive() || this.isGatewayEnforced();
    if (customBackupModel && customBackupModel.trim()) {
      const trimmed = customBackupModel.trim();
      if (isTtsModel(trimmed)) {
        return this.backupTextProvider;
      }
      if (useGateway) {
        const alias = resolveLiteLLMModelAlias(trimmed);
        if (this.backupTextProvider.modelName === alias) {
          return this.backupTextProvider;
        }
        return new LiteLLMTextAIProvider(alias);
      }
      const directModel = resolveDirectGeminiModel(trimmed, DEFAULT_BACKUP_MODEL);
      if (this.backupTextProvider.modelName === directModel) {
        return this.backupTextProvider;
      }
      return new GeminiTextAIProvider(directModel);
    }
    return this.backupTextProvider || this.getTextProvider(this.defaultTextType);
  }

  public getBackgroundTextProvider(): ITextAIProvider {
    return this.backgroundTextProvider || this.getTextProvider(this.defaultTextType);
  }

  public getVoiceProvider(_type?: VoiceProviderType, customModel?: string): IVoiceAIProvider {
    if (customModel && customModel.trim()) {
      const trimmed = customModel.trim();
      if (!isTtsModel(trimmed)) {
        throw new Error(`Chat model '${trimmed}' cannot be used for voice synthesis.`);
      }
      const existing = this.voiceProviders.get('gemini');
      if (existing && existing.modelName === trimmed) {
        return existing;
      }
      return new GeminiVoiceAIProvider(trimmed);
    }
    const provider = this.voiceProviders.get('gemini');
    if (provider) return provider;
    throw new Error('[AIProviderRegistry] Gemini voice provider unavailable.');
  }

  public registerTextProvider(provider: ITextAIProvider): void {
    this.textProviders.set(provider.providerType, provider);
  }

  public registerVoiceProvider(provider: IVoiceAIProvider): void {
    this.voiceProviders.set(provider.providerType, provider);
  }

  public setDefaultTextType(type: TextProviderType): void {
    if (type === 'litellm' && !this.textProviders.get('litellm')?.isConfigured) {
      return;
    }
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

  public async testTextProvider(type?: TextProviderType, customModel?: string): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    code?: string;
    status?: ProviderHealthStatus;
    error?: string;
  }> {
    if (customModel && isTtsModel(customModel)) {
      return {
        success: false,
        latencyMs: 0,
        model: customModel,
        code: 'INVALID_MODEL_TYPE',
        status: 'ERROR',
        error: `Voice/TTS model '${customModel}' cannot be used as a chat model.`,
      };
    }

    const provider = this.getTextProvider(type || this.defaultTextType, customModel);
    if ('testConnection' in provider && typeof (provider as any).testConnection === 'function') {
      const res = await (provider as any).testConnection(customModel);
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
        model: customModel,
        systemPrompt: 'Respond with exactly: ping',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16,
        temperature: 0.1,
      });
      return { success: true, latencyMs: Date.now() - startTime, model: res.model, status: 'CONNECTED' };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: customModel || provider.modelName,
        code: err.code || 'UNAVAILABLE',
        status: !provider.isConfigured ? 'NOT_CONFIGURED' : 'UNAVAILABLE',
        error: err.message,
      };
    }
  }

  public async testVoiceProvider(_type?: VoiceProviderType, customModel?: string): Promise<{
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
    if (customModel && !isTtsModel(customModel)) {
      return {
        success: false,
        latencyMs: 0,
        model: customModel,
        code: 'INVALID_MODEL_TYPE',
        status: 'ERROR',
        error: `Chat model '${customModel}' cannot be used for voice. Select a TTS voice model.`,
      };
    }

    const provider = this.getVoiceProvider('gemini', customModel);
    if ('testConnection' in provider && typeof (provider as any).testConnection === 'function') {
      return await (provider as any).testConnection(customModel);
    }

    const startTime = Date.now();
    try {
      const res = await provider.synthesizeSpeech({ text: 'Hello', voiceId: 'aura', model: customModel });
      return {
        success: Boolean(res.audioUrl),
        latencyMs: Date.now() - startTime,
        model: res.model || provider.modelName,
        audioUrl: res.audioUrl,
        code: 'CONNECTED',
        status: 'CONNECTED',
        message: 'Voice generated successfully',
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: customModel || provider.modelName,
        code: (err as any).code || 'UNAVAILABLE',
        status: !provider.isConfigured ? 'NOT_CONFIGURED' : 'UNAVAILABLE',
        error: err.message,
      };
    }
  }

  public getStatus(
    hasSupabase: boolean,
    _activeTextType?: TextProviderType,
    _activeVoiceType?: VoiceProviderType,
    selectedTextModel?: string,
    selectedBackupModel?: string,
    selectedVoiceModel?: string
  ): ProviderStatus {
    const litellmText = this.textProviders.get('litellm');
    const geminiText = this.textProviders.get('gemini');
    const geminiVoice = this.voiceProviders.get('gemini') as any;

    const gatewayActive = this.isGatewayActive();
    const routeViaGateway = gatewayActive || this.isGatewayEnforced();
    const activeTextProvider = routeViaGateway ? litellmText : geminiText;

    const currentTextModel = selectedTextModel
      ? sanitizeTextModel(selectedTextModel, this.activeTextModel, 'statusTextModel')
      : this.activeTextModel;
    const currentBackupModel = selectedBackupModel
      ? sanitizeTextModel(selectedBackupModel, this.activeBackupModel, 'statusBackupModel')
      : this.activeBackupModel;
    const currentVoiceModel = selectedVoiceModel
      ? sanitizeVoiceModel(selectedVoiceModel, this.activeVoiceModel, 'statusVoiceModel')
      : this.activeVoiceModel;

    const textStatus: ProviderHealthStatus = !activeTextProvider?.isConfigured
      ? 'NOT_CONFIGURED'
      : (activeTextProvider as any)?.lastError
      ? 'UNAVAILABLE'
      : 'CONNECTED';

    const geminiTextStatus: ProviderHealthStatus = !geminiText?.isConfigured
      ? 'NOT_CONFIGURED'
      : (geminiText as any)?.lastError
      ? 'UNAVAILABLE'
      : 'CONNECTED';

    const geminiVoiceStatus: ProviderHealthStatus = geminiVoice?.getStatus
      ? geminiVoice.getStatus()
      : !geminiVoice?.isConfigured
      ? 'NOT_CONFIGURED'
      : 'UNAVAILABLE';

    const availableTextProviders: ProviderDetail[] = [
      ...(litellmText?.isConfigured || routeViaGateway
        ? [
            {
              type: 'litellm',
              name: 'LiteLLM AI Gateway',
              isConfigured: Boolean(litellmText?.isConfigured),
              model: resolveLiteLLMModelAlias(currentTextModel),
              description: routeViaGateway && !gatewayActive
                ? 'LiteLLM gateway enforced (missing LITELLM_BASE_URL or LITELLM_API_KEY)'
                : 'Private LiteLLM gateway routing Gemini & Groq with fallback',
              status: textStatus,
              error: (litellmText as any)?.lastError,
            },
          ]
        : []),
      {
        type: 'gemini',
        name: 'Google Gemini',
        isConfigured: Boolean(geminiText?.isConfigured),
        model: currentTextModel,
        description: routeViaGateway
          ? 'Google Gemini (routed via LiteLLM Gateway)'
          : 'Google Gemini chat, reasoning & native tool execution',
        status: routeViaGateway ? textStatus : geminiTextStatus,
        error: routeViaGateway ? (litellmText as any)?.lastError : (geminiText as any)?.lastError,
      },
    ];

    const availableVoiceProviders: ProviderDetail[] = [
      {
        type: 'gemini',
        name: 'Gemini Voice TTS',
        isConfigured: Boolean(geminiVoice?.isConfigured),
        model: currentVoiceModel,
        voiceId: 'Aoede (Aura) / Fenrir (Atlas) / Kore (Lyra)',
        description: 'Expressive neural speech synthesis powered by Google Gemini',
        status: geminiVoiceStatus,
        error: geminiVoice?.lastError,
        lastSuccessfulTest: geminiVoice?.lastSuccessfulTest,
      },
    ];

    return {
      textProvider: {
        type: routeViaGateway ? 'litellm' : 'gemini',
        isConfigured: Boolean(activeTextProvider?.isConfigured),
        hasApiKey: Boolean(activeTextProvider?.isConfigured),
        model: currentTextModel,
        backupModel: currentBackupModel,
        status: textStatus,
        description: gatewayActive
          ? 'Private LiteLLM AI Gateway active'
          : routeViaGateway
          ? 'LiteLLM AI Gateway enforced (unconfigured)'
          : 'Google Gemini active',
        lastError: (activeTextProvider as any)?.lastError,
      },
      voiceProvider: {
        type: 'gemini',
        isConfigured: Boolean(geminiVoice?.isConfigured),
        hasApiKey: Boolean(geminiVoice?.isConfigured),
        model: currentVoiceModel,
        voiceId: 'Aoede / Fenrir / Kore',
        status: geminiVoiceStatus,
        description: 'Gemini Neural Voice active',
        lastError: geminiVoice?.lastError,
        lastSuccessfulTest: geminiVoice?.lastSuccessfulTest,
      },
      availableTextProviders,
      availableVoiceProviders,
      database: {
        type: hasSupabase ? 'supabase' : 'in_memory_fallback',
        isConfigured: hasSupabase,
        status: hasSupabase ? 'connected' : 'unconfigured_fallback',
      },
      isProductionReady: Boolean(activeTextProvider?.isConfigured) && Boolean(geminiVoice?.isConfigured),
    };
  }
}
