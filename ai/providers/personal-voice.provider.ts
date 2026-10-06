import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import {
  VoiceProviderType,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  ProviderError,
  ProviderHealthStatus,
  PersonalVoiceReferenceMetadata,
} from '../../shared/types/provider';
import { loadAIProvidersConfig } from './config';

/**
 * JEXA Personal Voice Engine Provider
 *
 * Designed to synthesize AI speech using a personalized reference voice sample.
 * Operates with strict fidelity: never fakes connection, never fakes audio,
 * and maintains configurable server-side adapters (XTTS, Piper, Custom HTTP, None).
 */
export class PersonalVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'personal';
  public readonly modelName: string;
  public readonly engine: string;
  public readonly apiUrl?: string;
  private readonly apiKey?: string;
  public referenceId: string;
  public referenceMetadata: PersonalVoiceReferenceMetadata | null = null;
  public hasSuccessfulTest: boolean = false;
  public lastSuccessfulTest?: { timestamp: string; latencyMs: number };
  public lastError?: string;
  public lastErrorCode?: string;

  constructor(customModel?: string) {
    const config = loadAIProvidersConfig().personalVoice;
    this.engine = config.engine || 'none';
    this.modelName = customModel || config.model || (this.engine !== 'none' ? `personal-${this.engine}` : 'none');
    this.referenceId = config.referenceId || '';
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;

    console.log(
      `[PersonalVoiceAIProvider] Initialized - Engine: '${this.engine}', Model: '${this.modelName}', ReferenceId: '${this.referenceId || 'none'}'`
    );
  }

  public get isConfigured(): boolean {
    const hasEngine = this.engine !== 'none' && Boolean(this.engine);
    const hasReference = Boolean(this.referenceId) || Boolean(this.referenceMetadata);
    return hasEngine && hasReference;
  }

  public getStatus(): ProviderHealthStatus {
    if (this.hasSuccessfulTest) {
      return 'CONNECTED';
    }
    if (this.lastErrorCode === 'UNAVAILABLE' || (this.lastError && this.isConfigured)) {
      return 'UNAVAILABLE';
    }
    // If the user has uploaded/recorded a voice reference sample, but the backend engine is none
    if (this.referenceMetadata || this.referenceId) {
      if (this.engine === 'none') {
        return 'READY';
      }
      return 'NOT_CONFIGURED';
    }
    return 'NOT_CONFIGURED';
  }

  public setReferenceMetadata(meta: PersonalVoiceReferenceMetadata | null): void {
    this.referenceMetadata = meta;
    if (meta?.id) {
      this.referenceId = meta.id;
    } else if (meta === null) {
      this.referenceId = '';
      this.hasSuccessfulTest = false;
      this.lastSuccessfulTest = undefined;
    }
  }

  public getReferenceMetadata(): PersonalVoiceReferenceMetadata | null {
    return this.referenceMetadata;
  }

  /**
   * Generates new speech from the configured voice model and reference sample.
   * Never fakes audio or uses browser speech synthesis.
   */
  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (this.engine === 'none' || !this.engine) {
      this.lastErrorCode = 'NOT_CONFIGURED';
      this.lastError = 'Personal voice engine not configured.';
      throw new ProviderError(
        'Personal voice engine not configured. Please set PERSONAL_VOICE_ENGINE in your server environment.',
        'personal',
        'NOT_CONFIGURED',
        400,
        this.modelName
      );
    }

    if (!this.referenceMetadata && !this.referenceId) {
      this.lastErrorCode = 'NOT_CONFIGURED';
      this.lastError = 'Personal Voice sample not recorded yet.';
      throw new ProviderError(
        'Personal Voice sample not recorded yet. Record or upload your voice sample in Settings.',
        'personal',
        'NOT_CONFIGURED',
        400,
        this.modelName
      );
    }

    const cleanText = request.text.replace(/[*#`_\[\]()]/g, '').trim();
    if (!cleanText) {
      throw new ProviderError('No valid text provided for speech synthesis.', 'personal', 'INVALID_INPUT', 400);
    }

    const startTime = Date.now();

    // If an external adapter URL is configured (e.g. XTTS or Piper REST API)
    if (this.apiUrl) {
      try {
        const response = await fetch(`${this.apiUrl.replace(/\/+$/, '')}/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/wav, audio/mpeg',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            text: cleanText,
            reference_id: this.referenceId,
            model: this.modelName,
            speed: request.speed ?? 1.0,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new ProviderError(
            `Personal voice engine returned HTTP ${response.status}: ${errText}`,
            'personal',
            'SYNTHESIS_FAILED',
            response.status,
            this.modelName
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'audio/wav';
        const base64Audio = buffer.toString('base64');
        const audioUrl = `data:${contentType};base64,${base64Audio}`;

        const latencyMs = Date.now() - startTime;
        this.hasSuccessfulTest = true;
        this.lastSuccessfulTest = { timestamp: new Date().toISOString(), latencyMs };
        this.lastError = undefined;
        this.lastErrorCode = undefined;

        return {
          audioBuffer: buffer,
          contentType,
          audioUrl,
          format: contentType.includes('mpeg') ? 'audio/mpeg' : 'audio/wav',
          durationSeconds: Math.max(1, Math.round(cleanText.length / 15)),
          isSimulated: false,
          message: `Speech synthesized successfully via Personal Voice (${this.engine}).`,
          provider: this.providerType,
          model: this.modelName,
        };
      } catch (err: any) {
        console.error('[PersonalVoiceAIProvider] Custom engine synthesis failed:', err);
        this.lastErrorCode = 'UNAVAILABLE';
        this.lastError = err.message || 'Personal voice synthesis failed.';
        throw new ProviderError(
          err.message || 'Personal voice synthesis failed.',
          'personal',
          'SYNTHESIS_FAILED',
          500,
          this.modelName
        );
      }
    }

    // When engine is set (e.g. piper/xtts) but no endpoint is yet operational
    this.lastErrorCode = 'NOT_CONFIGURED';
    this.lastError = `Personal voice engine '${this.engine}' is set, but no API endpoint is connected.`;
    throw new ProviderError(
      `Personal voice engine '${this.engine}' is set, but no API endpoint is connected. Please configure PERSONAL_VOICE_API_URL.`,
      'personal',
      'NOT_CONFIGURED',
      400,
      this.modelName
    );
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    throw new ProviderError('Personal voice transcription is not supported.', 'personal', 'UNSUPPORTED', 501);
  }

  /**
   * Real end-to-end test connection.
   * If not configured, returns clean failure without faking success.
   */
  public async testConnection(): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    voiceId?: string;
    engine?: string;
    audioUrl?: string;
    code?: string;
    status: ProviderHealthStatus;
    error?: string;
    message?: string;
  }> {
    if (this.engine === 'none' || !this.engine) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        engine: this.engine,
        voiceId: this.referenceId || 'none',
        code: 'NOT_CONFIGURED',
        status: this.getStatus(),
        error: 'Personal voice engine not configured.',
      };
    }

    if (!this.referenceMetadata && !this.referenceId) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        engine: this.engine,
        voiceId: 'none',
        code: 'NOT_CONFIGURED',
        status: this.getStatus(),
        error: 'Personal Voice sample not recorded yet.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.synthesizeSpeech({
        text: 'JEXA personal voice test.',
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: Boolean(res.audioUrl),
        latencyMs,
        model: this.modelName,
        engine: this.engine,
        voiceId: this.referenceId,
        audioUrl: res.audioUrl,
        code: 'CONNECTED',
        status: 'CONNECTED',
        message: 'Personal voice generated successfully.',
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        latencyMs,
        model: this.modelName,
        engine: this.engine,
        voiceId: this.referenceId,
        code: err.code || 'NOT_CONFIGURED',
        status: this.getStatus(),
        error: err.message || 'Personal voice generation test failed.',
      };
    }
  }
}
