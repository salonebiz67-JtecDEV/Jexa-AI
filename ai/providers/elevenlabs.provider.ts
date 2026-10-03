import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse, ProviderError } from '../../shared/types/provider';

export class ElevenLabsVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'elevenlabs';
  public readonly modelName: string;
  private readonly apiKey: string;
  public readonly isConfigured: boolean;
  public readonly defaultVoiceId: string;
  public lastError?: string;

  constructor() {
    this.apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    this.modelName = (process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();
    this.defaultVoiceId = (process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim(); // Default Rachel
    this.isConfigured = Boolean(this.apiKey);

    if (this.isConfigured) {
      console.log(`[ElevenLabsVoiceAIProvider] Initialized with model: ${this.modelName}, voice: ${this.defaultVoiceId}`);
    } else {
      console.warn('[ElevenLabsVoiceAIProvider] ELEVENLABS_API_KEY is not set. ElevenLabs voice will not be available until configured.');
    }
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new ProviderError(
        'ElevenLabs Voice AI service is not configured. Please set ELEVENLABS_API_KEY in your Render environment variables.',
        'elevenlabs',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
    }

    const cleanText = request.text.replace(/[*#`_\[\]]/g, '').trim();
    if (!cleanText) {
      throw new ProviderError('No valid text provided for speech synthesis.', 'elevenlabs', 'INVALID_INPUT', 400);
    }

    // Voice mapping: allow mapped names or raw ElevenLabs voice IDs
    const voiceMap: Record<string, string> = {
      rachel: '21m00Tcm4TlvDq8ikWAM',
      adam: 'pNInz6obpgDQGcFmaJgB',
      bella: 'EXAVITQu4vr4xnSDxMaL',
      antoni: 'ErXwobaYiN019PkySvjV',
      aura: '21m00Tcm4TlvDq8ikWAM',
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
        this.lastError = errorText;

        if (response.status === 401) {
          throw new ProviderError(
            'Invalid ElevenLabs API key. Please check ELEVENLABS_API_KEY in your Render environment.',
            'elevenlabs',
            'AUTHENTICATION_ERROR',
            401,
            this.modelName
          );
        } else if (response.status === 404) {
          throw new ProviderError(
            `ElevenLabs Voice ID '${targetVoiceId}' or model was not found. Please verify ELEVENLABS_VOICE_ID.`,
            'elevenlabs',
            'VOICE_NOT_FOUND',
            404,
            this.modelName
          );
        }

        throw new ProviderError(
          `ElevenLabs API error (${response.status}): ${errorText}`,
          'elevenlabs',
          'PROVIDER_ERROR',
          response.status,
          this.modelName
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Audio = buffer.toString('base64');
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

      const wordCount = cleanText.split(/\s+/).length;
      const estimatedDuration = Math.max(1, Math.round(wordCount / 2.5));

      return {
        audioUrl,
        format: 'audio/mpeg',
        durationSeconds: estimatedDuration,
        isSimulated: false,
        message: 'Speech synthesized successfully via ElevenLabs.',
        provider: this.providerType,
        model: this.modelName,
      };
    } catch (error: any) {
      console.error('[ElevenLabsVoiceAIProvider] Speech synthesis failed:', error);
      this.lastError = error.message;
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        error.message || 'ElevenLabs speech synthesis failed.',
        'elevenlabs',
        'SYNTHESIS_FAILED',
        500,
        this.modelName
      );
    }
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    throw new ProviderError('ElevenLabs audio transcription is not supported.', 'elevenlabs', 'UNSUPPORTED', 501);
  }

  // Safe minimal credential check via /v1/user endpoint (consumes 0 voice characters)
  public async testConnection(): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    if (!this.isConfigured || !this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        error: 'ELEVENLABS_API_KEY is not configured on the backend server.',
      };
    }

    const startTime = Date.now();
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          model: this.modelName,
          error: `ElevenLabs verification failed (${response.status}): ${errorText}`,
        };
      }

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        model: this.modelName,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: this.modelName,
        error: err.message,
      };
    }
  }
}
