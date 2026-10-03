import { AIProviderRegistry } from '../../../ai/providers/registry';
import { VoiceSynthesisRequest, VoiceSynthesisResponse, ProviderError } from '../../../shared/types/provider';
import { DatabaseService } from '../database/db-service';

export class VoiceService {
  public static async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const registry = AIProviderRegistry.getInstance();
    let targetProviderType = request.provider;

    if (!targetProviderType) {
      try {
        const profile = await DatabaseService.getBrainProfile();
        targetProviderType = profile.selectedVoiceProvider || 'gemini';
      } catch (err) {
        targetProviderType = 'gemini';
      }
    }

    try {
      const primaryProvider = registry.getVoiceProvider(targetProviderType);
      return await primaryProvider.synthesizeSpeech(request);
    } catch (primaryErr: any) {
      console.warn(`[VoiceService] Voice provider '${targetProviderType}' failed:`, primaryErr.message);

      // If ElevenLabs failed and Gemini Voice is configured, attempt graceful failover
      if (targetProviderType === 'elevenlabs') {
        const fallbackProvider = registry.getVoiceProvider('gemini');
        if (fallbackProvider && fallbackProvider.isConfigured) {
          console.log('[VoiceService] Attempting voice failover to Gemini Neural Voice...');
          try {
            const fallbackResponse = await fallbackProvider.synthesizeSpeech(request);
            fallbackResponse.message = `${fallbackResponse.message} (Automatic failover from ElevenLabs)`;
            return fallbackResponse;
          } catch (fallbackErr: any) {
            console.error('[VoiceService] Voice failover to Gemini also failed:', fallbackErr.message);
          }
        }
      }

      if (primaryErr instanceof ProviderError) {
        throw primaryErr;
      }
      throw new ProviderError(
        primaryErr.message || 'Voice synthesis failed.',
        targetProviderType || 'voice_ai',
        'VOICE_SYNTHESIS_ERROR',
        500
      );
    }
  }
}
