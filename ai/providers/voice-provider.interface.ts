import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../shared/types/provider';

export interface AudioTranscriptionRequest {
  audioBuffer?: Buffer | ArrayBuffer;
  audioData?: string;
  mimeType: string;
  language?: string;
}

export interface AudioTranscriptionResponse {
  transcript: string;
  confidence: number;
  provider: VoiceProviderType;
  isMock: boolean;
}

export interface IVoiceAIProvider {
  readonly providerType: VoiceProviderType;
  readonly isConfigured: boolean;
  readonly modelName: string;

  synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse>;
  transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse>;
}
