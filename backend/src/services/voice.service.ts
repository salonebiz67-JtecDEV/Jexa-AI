import { AIProviderRegistry } from '../../../ai/providers/registry';
import {
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  VoiceProviderType,
  VoiceHealthResponse,
  ProviderError,
} from '../../../shared/types/provider';
import { DatabaseService } from '../database/db-service';
import { UsageTracker } from './usage-tracker.service';

export class VoiceService {
  /**
   * Main unified entry point: converts text into speech using the active or requested voice provider.
   * Internal routing delegates to Gemini or ElevenLabs without exposing provider mechanics.
   */
  public static async speak(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    return this.synthesizeSpeech(request);
  }

  public static async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const registry = AIProviderRegistry.getInstance();
    let targetProviderType = request.provider;

    if (!targetProviderType) {
      try {
        const profile = await DatabaseService.getBrainProfile();
        targetProviderType = profile.selectedVoiceProvider || registry.getDefaultVoiceType();
      } catch {
        targetProviderType = registry.getDefaultVoiceType();
      }
    }

    const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> => {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProviderError(
              'Voice synthesis timed out after 20 seconds.',
              targetProviderType || 'voice_ai',
              'VOICE_TIMEOUT',
              504
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
      const primaryProvider = registry.getVoiceProvider(targetProviderType);
      const res = await runWithTimeout(primaryProvider.synthesizeSpeech(request), 20000);

      const textTokens = Math.ceil((request.text?.length || 0) / 4);
      UsageTracker.recordAICall({
        provider: targetProviderType || 'gemini',
        model: request.voiceId || 'gemini-3.8-flash-lite-tts',
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
      console.warn(`[VoiceService] Voice provider '${targetProviderType}' failed:`, primaryErr.message);

      const textTokens = Math.ceil((request.text?.length || 0) / 4);
      UsageTracker.recordAICall({
        provider: targetProviderType || 'gemini',
        model: request.voiceId || 'gemini-3.8-flash-lite-tts',
        purpose: 'voice_tts',
        promptTokens: textTokens,
        completionTokens: 0,
        totalTokens: textTokens,
        isEstimated: true,
        durationMs: Date.now() - voiceStartTime,
        status: 'error',
      });

      if (primaryErr?.code === 'VOICE_TIMEOUT') {
        throw primaryErr;
      }

      // If ElevenLabs was used in normal chat and failed (and not a timeout), attempt safe fallback to Gemini
      // Note: Never fallback for 'personal' voice so we never generate fake audio or claim cloned speech
      if (targetProviderType === 'elevenlabs' && !request.provider) {
        const fallbackProvider = registry.getVoiceProvider('gemini');
        if (fallbackProvider && fallbackProvider.isConfigured) {
          console.log(`[VoiceService] Attempting voice failover from elevenlabs to Gemini Neural Voice...`);
          try {
            const fallbackResponse = await runWithTimeout(fallbackProvider.synthesizeSpeech(request), 10000);
            fallbackResponse.message = `${fallbackResponse.message} (Automatic failover from ${targetProviderType})`;
            return fallbackResponse;
          } catch (fallbackErr: any) {
            console.error('[VoiceService] Voice failover to Gemini also failed:', fallbackErr.message);
          }
        }
      }

      if (primaryErr instanceof ProviderError) {
        throw primaryErr;
      }

      let friendlyMessage = primaryErr.message || 'Voice synthesis failed.';
      if (targetProviderType === 'gemini') {
        friendlyMessage = 'Gemini voice is temporarily unavailable. Try ElevenLabs.';
      } else if (targetProviderType === 'elevenlabs') {
        friendlyMessage = 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY.';
      } else if (targetProviderType === 'personal') {
        friendlyMessage = 'Personal voice engine not configured.';
      }

      throw new ProviderError(
        friendlyMessage,
        targetProviderType || 'voice_ai',
        'VOICE_SYNTHESIS_ERROR',
        500
      );
    }
  }

  /**
   * Returns current configuration status for Gemini, ElevenLabs, and Personal Voice
   */
  public static getHealth(): VoiceHealthResponse {
    const registry = AIProviderRegistry.getInstance();
    const gemini = registry.getVoiceProvider('gemini');
    const elevenlabs = registry.getVoiceProvider('elevenlabs');
    const personal = registry.getVoiceProvider('personal') as any;

    return {
      gemini: {
        configured: Boolean(gemini?.isConfigured),
        provider: 'gemini',
        model: gemini?.modelName || 'gemini-3.8-flash-lite-tts',
      },
      elevenlabs: {
        configured: Boolean(elevenlabs?.isConfigured),
        provider: 'elevenlabs',
        model: elevenlabs?.modelName || 'eleven_multilingual_v2',
      },
      personal: {
        configured: Boolean(personal?.isConfigured),
        provider: 'personal',
        engine: personal?.engine || 'none',
        referenceVoice: Boolean(personal?.referenceId || personal?.referenceMetadata),
      },
    };
  }

  /**
   * Generates a real test audio clip using the specified provider and verifies end-to-end synthesis
   */
  public static async testProvider(
    providerType: VoiceProviderType,
    customText?: string
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
    const registry = AIProviderRegistry.getInstance();
    const provider = registry.getVoiceProvider(providerType);

    if (providerType === 'personal') {
      if ('testConnection' in provider && typeof (provider as any).testConnection === 'function') {
        const testRes = await (provider as any).testConnection();
        if (!testRes.success) {
          throw new ProviderError(
            testRes.error || 'Personal voice engine not configured.',
            'personal',
            testRes.code || 'NOT_CONFIGURED',
            400,
            testRes.model
          );
        }
        return {
          success: true,
          provider: 'personal',
          model: testRes.model,
          audioUrl: testRes.audioUrl,
          latencyMs: testRes.latencyMs,
          message: testRes.message || 'Personal voice generated successfully.',
        };
      }
      throw new ProviderError(
        'Personal voice engine not configured. Please configure PERSONAL_VOICE_ENGINE.',
        'personal',
        'NOT_CONFIGURED',
        400,
        provider?.modelName || 'none'
      );
    }

    if (!provider || !provider.isConfigured) {
      const cleanMsg =
        providerType === 'elevenlabs'
          ? 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY in Render environment.'
          : 'Gemini voice is temporarily unavailable. Check GEMINI_API_KEY on the server.';
      throw new ProviderError(cleanMsg, providerType, 'MISSING_CREDENTIALS', 400, provider?.modelName);
    }

    const startTime = Date.now();
    const testText =
      customText ||
      (providerType === 'elevenlabs'
        ? 'JEXA voice system online. ElevenLabs speech generation test successful.'
        : 'JEXA voice system online. Gemini neural speech generation test successful.');

    const res = await provider.synthesizeSpeech({
      text: testText,
      voiceId: 'aura',
      provider: providerType,
    });

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      provider: providerType,
      model: res.model || provider.modelName,
      audioUrl: res.audioUrl,
      format: res.format,
      durationSeconds: res.durationSeconds,
      latencyMs,
      message: 'Voice generated successfully',
    };
  }
}
