import { AIProviderRegistry } from '../../../ai/providers/registry';
import {
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  VoiceProviderType,
  VoiceHealthResponse,
  ProviderError,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../../../shared/types/provider';
import { UsageTracker } from './usage-tracker.service';

export class VoiceService {
  /**
   * Main entry point: converts text into speech using Gemini Neural TTS.
   */
  public static async speak(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    return this.synthesizeSpeech(request);
  }

  public static async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const registry = AIProviderRegistry.getInstance();

    const targetModel =
      (typeof request.model === 'string' && request.model.trim()) ||
      registry.getActiveVoiceModel() ||
      DEFAULT_VOICE_MODEL;

    if (!isTtsModel(targetModel)) {
      throw new ProviderError(
        `Chat model '${targetModel}' cannot be used for voice. Select a Gemini TTS voice model in Settings.`,
        'gemini',
        'INVALID_MODEL_TYPE',
        400,
        targetModel
      );
    }

    const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> => {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProviderError(
              'Voice synthesis timed out after 20 seconds.',
              'gemini',
              'VOICE_TIMEOUT',
              504,
              targetModel
            )
          );
        }, timeoutMs);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timer!);
      }
    };

    const voiceStartTime = Date.now();
    try {
      const primaryProvider = registry.getVoiceProvider('gemini', targetModel);
      const res = await runWithTimeout(
        primaryProvider.synthesizeSpeech({ ...request, provider: 'gemini', model: targetModel }),
        20000
      );

      const textTokens = Math.ceil((request.text?.length || 0) / 4);
      UsageTracker.recordAICall({
        provider: 'gemini',
        model: res.model || targetModel,
        purpose: 'voice_tts',
        promptTokens: textTokens,
        completionTokens: 0,
        totalTokens: textTokens,
        isEstimated: true,
        durationMs: Date.now() - voiceStartTime,
        status: 'ok',
      });

      return res;
    } catch (primaryErr: any) {
      console.warn(`[VoiceService] Gemini voice synthesis failed (${targetModel}):`, primaryErr.message);

      const textTokens = Math.ceil((request.text?.length || 0) / 4);
      UsageTracker.recordAICall({
        provider: 'gemini',
        model: targetModel,
        purpose: 'voice_tts',
        promptTokens: textTokens,
        completionTokens: 0,
        totalTokens: textTokens,
        isEstimated: true,
        durationMs: Date.now() - voiceStartTime,
        status: primaryErr?.statusCode === 429 || primaryErr?.code === 'QUOTA_EXHAUSTED' ? 'rate_limited' : 'error',
      });

      if (primaryErr instanceof ProviderError) {
        throw primaryErr;
      }

      throw new ProviderError(
        primaryErr?.message || 'Gemini Voice is temporarily unavailable.',
        'gemini',
        'VOICE_SYNTHESIS_ERROR',
        500,
        targetModel
      );
    }
  }

  /**
   * Returns current configuration status for Gemini Voice
   */
  public static getHealth(): VoiceHealthResponse {
    const registry = AIProviderRegistry.getInstance();
    const gemini = registry.getVoiceProvider('gemini');

    return {
      gemini: {
        configured: Boolean(gemini?.isConfigured),
        provider: 'gemini',
        model: gemini?.modelName || DEFAULT_VOICE_MODEL,
      },
    };
  }

  /**
   * Generates a real test audio clip using Gemini Voice and verifies end-to-end synthesis
   */
  public static async testProvider(
    _providerType: VoiceProviderType = 'gemini',
    customText?: string,
    customModel?: string
  ): Promise<{
    success: boolean;
    provider: VoiceProviderType;
    model: string;
    audioUrl?: string;
    format?: string;
    durationSeconds?: number;
    latencyMs: number;
    message: string;
  }> {
    if (customModel && !isTtsModel(customModel)) {
      throw new ProviderError(
        `Chat model '${customModel}' cannot be used for voice. Select a Gemini TTS voice model.`,
        'gemini',
        'INVALID_MODEL_TYPE',
        400,
        customModel
      );
    }

    const registry = AIProviderRegistry.getInstance();
    const provider = registry.getVoiceProvider('gemini', customModel);
    const targetModel = customModel?.trim() || provider.modelName;

    if (!provider || !provider.isConfigured) {
      throw new ProviderError(
        'Gemini voice is not configured. Check GEMINI_API_KEY on the server.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        targetModel
      );
    }

    const startTime = Date.now();
    const testText =
      customText || 'JEXA voice system online. Gemini neural speech generation test successful.';

    const res = await provider.synthesizeSpeech({
      text: testText,
      voiceId: 'aura',
      provider: 'gemini',
      model: targetModel,
    });

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      provider: 'gemini',
      model: res.model || targetModel,
      audioUrl: res.audioUrl,
      format: res.format,
      durationSeconds: res.durationSeconds,
      latencyMs,
      message: 'Voice generated successfully',
    };
  }
}
