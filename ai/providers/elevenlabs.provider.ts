import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import {
  VoiceProviderType,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  ProviderError,
  ProviderHealthStatus,
} from '../../shared/types/provider';

export class ElevenLabsVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'elevenlabs';
  public readonly modelName: string;
  private readonly apiKey: string;
  public readonly isConfigured: boolean;
  public readonly defaultVoiceId: string;
  public lastError?: string;
  public lastErrorCode?: string;
  public hasSuccessfulTest: boolean = false;
  public lastSuccessfulTest?: { timestamp: string; latencyMs: number };

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

  public getStatus(): ProviderHealthStatus {
    if (!this.isConfigured || !this.apiKey) return 'NOT_CONFIGURED';
    if (this.lastErrorCode === 'PAYMENT_REQUIRED') return 'PAYMENT_REQUIRED';
    if (this.lastErrorCode === 'AUTHENTICATION_ERROR') return 'AUTHENTICATION_ERROR';
    if (this.lastErrorCode === 'MODEL_NOT_FOUND') return 'MODEL_NOT_FOUND';
    if (this.lastErrorCode === 'QUOTA_EXHAUSTED') return 'QUOTA_EXHAUSTED';
    if (this.hasSuccessfulTest) return 'CONNECTED';
    if (this.lastError) return 'UNAVAILABLE';
    return 'UNAVAILABLE';
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

    const startTime = Date.now();
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
        let errorText = '';
        let errorJson: any = null;
        try {
          errorText = await response.text();
          errorJson = JSON.parse(errorText);
        } catch {
          errorJson = null;
        }

        console.error(`[ElevenLabsVoiceAIProvider] API returned HTTP ${response.status}:`, errorText);
        const detailStatus = errorJson?.detail?.status || errorJson?.detail?.code || '';
        const detailMsg = errorJson?.detail?.message || (typeof errorJson?.detail === 'string' ? errorJson.detail : errorText);

        if (
          response.status === 402 ||
          detailStatus === 'voice_not_accessible_on_free_tier' ||
          detailStatus === 'payment_required' ||
          errorText.includes('payment_required') ||
          errorText.includes('voice_not_accessible_on_free_tier') ||
          errorText.includes('subscription')
        ) {
          this.lastErrorCode = 'PAYMENT_REQUIRED';
          this.lastError = 'This ElevenLabs voice requires a paid plan.';
          throw new ProviderError(
            'This ElevenLabs voice requires a paid plan.',
            'elevenlabs',
            'PAYMENT_REQUIRED',
            402,
            this.modelName
          );
        }

        if (response.status === 401 || response.status === 403) {
          this.lastErrorCode = 'AUTHENTICATION_ERROR';
          this.lastError = 'Provider authentication or permission failed.';
          throw new ProviderError(
            'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY in Render environment.',
            'elevenlabs',
            'AUTHENTICATION_ERROR',
            401,
            this.modelName
          );
        }

        if (response.status === 404) {
          this.lastErrorCode = 'MODEL_NOT_FOUND';
          this.lastError = 'The selected model or voice was not found.';
          throw new ProviderError(
            `The selected ElevenLabs voice '${targetVoiceId}' or model was not found.`,
            'elevenlabs',
            'MODEL_NOT_FOUND',
            404,
            this.modelName
          );
        }

        if (response.status === 429) {
          this.lastErrorCode = 'QUOTA_EXHAUSTED';
          this.lastError = 'ElevenLabs quota or rate limit reached.';
          throw new ProviderError(
            'ElevenLabs quota or rate limit reached. Try again later.',
            'elevenlabs',
            'QUOTA_EXHAUSTED',
            429,
            this.modelName
          );
        }

        if (response.status === 503 || response.status === 502) {
          this.lastErrorCode = 'UNAVAILABLE';
          this.lastError = 'The provider is temporarily unavailable.';
          throw new ProviderError(
            'The provider is temporarily unavailable.',
            'elevenlabs',
            'UNAVAILABLE',
            503,
            this.modelName
          );
        }

        this.lastErrorCode = 'UNAVAILABLE';
        this.lastError = detailMsg || 'ElevenLabs speech generation failed.';
        throw new ProviderError(
          detailMsg || `ElevenLabs API error (${response.status})`,
          'elevenlabs',
          'UNAVAILABLE',
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
      const latencyMs = Date.now() - startTime;

      // Real test success confirmed
      this.hasSuccessfulTest = true;
      this.lastSuccessfulTest = {
        timestamp: new Date().toISOString(),
        latencyMs,
      };
      this.lastErrorCode = undefined;
      this.lastError = undefined;

      return {
        audioBuffer: buffer,
        contentType: 'audio/mpeg',
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
      if (error instanceof ProviderError) {
        throw error;
      }
      this.lastErrorCode = 'UNAVAILABLE';
      this.lastError = error.message || 'ElevenLabs speech synthesis failed.';
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

  // Real end-to-end voice test that verifies credentials and produces actual speech
  public async testConnection(): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    voiceId: string;
    audioUrl?: string;
    code?: string;
    status: ProviderHealthStatus;
    error?: string;
    message?: string;
  }> {
    if (!this.isConfigured || !this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        voiceId: this.defaultVoiceId,
        code: 'NOT_CONFIGURED',
        status: 'NOT_CONFIGURED',
        error: 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY in Render environment.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.synthesizeSpeech({
        text: 'JEXA voice system online. ElevenLabs speech test successful.',
        voiceId: this.defaultVoiceId,
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: Boolean(res.audioUrl),
        latencyMs,
        model: this.modelName,
        voiceId: this.defaultVoiceId,
        audioUrl: res.audioUrl,
        code: 'CONNECTED',
        status: 'CONNECTED',
        message: 'Voice generated successfully',
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const status = this.getStatus();
      return {
        success: false,
        latencyMs,
        model: this.modelName,
        voiceId: this.defaultVoiceId,
        code: err.code || 'UNAVAILABLE',
        status,
        error: err.message || 'ElevenLabs speech generation failed.',
      };
    }
  }
}
