import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../shared/types/provider';

export class DevelopmentVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'development_mock';
  public readonly isConfigured: boolean = true;
  public readonly modelName: string = 'jexa-neural-voice-dev';

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const wordCount = request.text.split(/\s+/).length;
    // Approximate spoken duration: ~150 words per minute => ~2.5 words per sec
    const estimatedSeconds = Math.max(1.2, +(wordCount / 2.5).toFixed(1));

    return {
      audioUrl: undefined, // Signals frontend to utilize high-fidelity Web Speech API synthesis or simulated waveform
      format: 'browser_synthesis',
      durationSeconds: estimatedSeconds,
      isSimulated: true,
      message: 'Operating in Development Voice mode. Using client-side speech synthesis and audio frequency visualizer until VOICE_AI_API_KEY is configured.',
    };
  }

  public async transcribeAudio(_request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    return {
      transcript: 'Voice transcription received in development mode.',
      confidence: 0.95,
      provider: this.providerType,
      isMock: true,
    };
  }
}
