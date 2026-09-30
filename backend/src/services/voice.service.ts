import { AIProviderRegistry } from '../../../ai/providers/registry';
import { VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../../shared/types/provider';

export class VoiceService {
  public static async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const registry = AIProviderRegistry.getInstance();
    const voiceProvider = registry.getVoiceProvider();
    return voiceProvider.synthesizeSpeech(request);
  }
}
