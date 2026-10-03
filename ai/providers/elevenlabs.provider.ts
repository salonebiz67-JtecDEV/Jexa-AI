import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../shared/types/provider';

export class ElevenLabsVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'elevenlabs';
  public readonly modelName: string;
  private readonly apiKey: string;
  public readonly isConfigured: boolean;
  private readonly defaultVoiceId: string;

  constructor() {
    this.apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    this.modelName = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    this.defaultVoiceId = (process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim(); // Default Rachel
    this.isConfigured = Boolean(this.apiKey);

    if (this.isConfigured) {
      console.log(`[ElevenLabsVoiceAIProvider] Initialized with voice model: ${this.modelName}`);
    } else {
      console.warn('[ElevenLabsVoiceAIProvider] ELEVENLABS_API_KEY is not set. ElevenLabs voice will not be available until configured.');
    }
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new Error(
        'ElevenLabs Voice AI service is not configured. Please set ELEVENLABS_API_KEY in your environment variables.'
      );
    }

    const cleanText = request.text.replace(/[*#`_\[\]]/g, '').trim();
    if (!cleanText) {
      throw new Error('No valid text provided for speech synthesis.');
    }

    // Voice mapping: allow mapped names or raw ElevenLabs voice IDs
    const voiceMap: Record<string, string> = {
      rachel: '21m00Tcm4TlvDq8ikWAM',
      adam: 'pNInz6obpgDQGcFmaJgB',
      bella: 'EXAVITQu4vr4xnSDxMaL',
      antoni: 'ErXwobaYiN019PkySvjV',
      aura: '21m00Tcm4TlvDq8ikWAM', // Map JEXA's default presets if passed
      atlas: 'pNInz6obpgDQGcFmaJgB',
      lyra: 'EXAVITQu4vr4xnSDxMaL',
    };

    const targetVoiceId = request.voiceId
      ? voiceMap[request.voiceId.toLowerCase()] || request.voiceId
      : this.defaultVoiceId;

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: this.modelName,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: request.speed ?? 1.0,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Audio = buffer.toString('base64');
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

      // Approximate duration: ~150 words per minute -> 2.5 words per second
      const wordCount = cleanText.split(/\s+/).length;
      const estimatedDuration = Math.max(1, Math.round(wordCount / 2.5));

      return {
        audioUrl,
        format: 'audio/mpeg',
        durationSeconds: estimatedDuration,
        isSimulated: false,
        message: 'Speech synthesized successfully via ElevenLabs.',
        provider: this.providerType,
      };
    } catch (error: any) {
      console.error('[ElevenLabsVoiceAIProvider] Speech synthesis failed:', error);
      throw new Error(error.message || 'ElevenLabs speech synthesis failed.');
    }
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    throw new Error('ElevenLabs transcription is not supported; use speech-to-text service.');
  }
}
