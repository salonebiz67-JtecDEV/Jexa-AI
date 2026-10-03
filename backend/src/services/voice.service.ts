import { AIProviderRegistry } from '../../../ai/providers/registry';
import { VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../../shared/types/provider';
import { DatabaseService } from '../database/db-service';

export class VoiceService {
  public static async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const registry = AIProviderRegistry.getInstance();
    let requestedProvider = request.provider;

    if (!requestedProvider) {
      try {
        const profile = await DatabaseService.getBrainProfile();
        requestedProvider = profile.selectedVoiceProvider;
      } catch (err) {
        // Fall back to registry default
      }
    }

    const voiceProvider = registry.getVoiceProvider(requestedProvider);
    return voiceProvider.synthesizeSpeech(request);
  }
}
