import { GoogleGenAI } from '@google/genai';
import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import {
  VoiceProviderType,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  ProviderError,
  ProviderHealthStatus,
} from '../../shared/types/provider';

function addWavHeader(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export class GeminiVoiceAIProvider implements IVoiceAIProvider {
  public readonly providerType: VoiceProviderType = 'gemini';
  public readonly modelName: string;
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;
  public lastError?: string;
  public lastErrorCode?: string;
  public quotaExhaustedUntil: number = 0;
  public quotaRetryDelaySeconds: number = 0;
  public hasSuccessfulTest: boolean = false;
  public lastSuccessfulTest?: { timestamp: string; latencyMs: number };

  constructor() {
    this.modelName = (
      process.env.VOICE_AI_MODEL ||
      process.env.GEMINI_VOICE_MODEL ||
      'gemini-3.8-flash-lite-tts'
    ).trim();

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.VOICE_AI_API_KEY;

    if (apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey });
        this.isConfigured = true;
        console.log(`[GeminiVoiceAIProvider] Initialized with model: ${this.modelName}`);
      } catch (err: any) {
        console.error('[GeminiVoiceAIProvider] Initialization error:', err);
        this.isConfigured = false;
        this.lastError = err.message;
        this.lastErrorCode = 'NOT_CONFIGURED';
      }
    }
  }

  public isQuotaExhausted(): boolean {
    return Date.now() < this.quotaExhaustedUntil;
  }

  public getStatus(): ProviderHealthStatus {
    if (!this.isConfigured || !this.ai) return 'NOT_CONFIGURED';
    if (this.isQuotaExhausted() || this.lastErrorCode === 'QUOTA_EXHAUSTED') return 'QUOTA_EXHAUSTED';
    if (this.lastErrorCode === 'AUTHENTICATION_ERROR') return 'AUTHENTICATION_ERROR';
    if (this.lastErrorCode === 'MODEL_NOT_FOUND') return 'MODEL_NOT_FOUND';
    if (this.lastErrorCode === 'PAYMENT_REQUIRED') return 'PAYMENT_REQUIRED';
    if (this.hasSuccessfulTest) return 'CONNECTED';
    if (this.lastError) return 'UNAVAILABLE';
    return 'UNAVAILABLE';
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (!this.ai || !this.isConfigured) {
      this.lastErrorCode = 'NOT_CONFIGURED';
      throw new ProviderError(
        'Voice AI service is not configured. Please configure GEMINI_API_KEY in your Render environment variables.',
        'gemini',
        'NOT_CONFIGURED',
        400,
        this.modelName
      );
    }

    if (this.isQuotaExhausted()) {
      const remainingMs = Math.max(0, this.quotaExhaustedUntil - Date.now());
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      const retryHint = remainingHours > 1 ? `in ~${remainingHours}h` : 'later';
      throw new ProviderError(
        `Gemini Voice quota exhausted. Try again ${retryHint} or switch to ElevenLabs.`,
        'gemini',
        'QUOTA_EXHAUSTED',
        429,
        this.modelName
      );
    }

    const startTime = Date.now();
    try {
      const voiceMap: Record<string, string> = {
        aura: 'Aoede',
        atlas: 'Fenrir',
        lyra: 'Kore',
        puck: 'Puck',
        charon: 'Charon',
      };
      const requestedVoice = (request.voiceId || 'lyra').toLowerCase();
      const voiceName = voiceMap[requestedVoice] || 'Kore';

      const cleanText = request.text.replace(/[*#`_\[\]]/g, '').trim();
      if (!cleanText) {
        throw new ProviderError('No valid text provided for speech synthesis.', 'gemini', 'INVALID_INPUT', 400);
      }

      const responseStream = await this.ai.models.generateContentStream({
        model: this.modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const pcmChunks: Buffer[] = [];
      for await (const chunk of responseStream) {
        const candidate = chunk.candidates?.[0];
        const data = candidate?.content?.parts?.[0]?.inlineData?.data;
        if (data) {
          pcmChunks.push(Buffer.from(data, 'base64'));
        }
      }

      if (pcmChunks.length === 0) {
        throw new ProviderError(
          'Gemini voice synthesis returned empty audio data.',
          'gemini',
          'EMPTY_AUDIO',
          500,
          this.modelName
        );
      }

      const pcmCombined = Buffer.concat(pcmChunks);
      const wavBuffer = addWavHeader(pcmCombined, 24000, 1, 16);
      const base64Wav = wavBuffer.toString('base64');
      const audioUrl = `data:audio/wav;base64,${base64Wav}`;

      const durationSeconds = Math.round(pcmCombined.length / (24000 * 2));
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
        audioBuffer: wavBuffer,
        contentType: 'audio/wav',
        audioUrl,
        format: 'audio/wav',
        durationSeconds: Math.max(1, durationSeconds),
        isSimulated: false,
        message: 'Speech synthesized successfully via Gemini Neural TTS.',
        provider: this.providerType,
        model: this.modelName,
      };
    } catch (error: any) {
      console.error('[GeminiVoiceAIProvider] Speech synthesis failed:', error);

      if (error instanceof ProviderError) {
        throw error;
      }

      const errStr = `${error.message || ''} ${error.status || ''} ${error.statusCode || ''} ${error.code || ''}`;
      const is429 =
        error.status === 429 ||
        error.statusCode === 429 ||
        error.code === 429 ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('quota') ||
        errStr.includes('Quota exceeded');

      if (is429) {
        // Parse retry delay from Google GenAI error message or default to 12 hours for the 10-request limit
        let cooldownMs = 12 * 60 * 60 * 1000;
        const matchSec = error.message?.match(/retry(?:\s+in|\s+after)?\s+(\d+(?:\.\d+)?)\s*s/i);
        if (matchSec && parseFloat(matchSec[1])) {
          cooldownMs = parseFloat(matchSec[1]) * 1000;
        }
        this.quotaExhaustedUntil = Date.now() + cooldownMs;
        this.lastErrorCode = 'QUOTA_EXHAUSTED';
        this.lastError = 'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.';
        throw new ProviderError(
          'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.',
          'gemini',
          'QUOTA_EXHAUSTED',
          429,
          this.modelName
        );
      }

      if (error.status === 401 || error.status === 403 || errStr.includes('401') || errStr.includes('API_KEY_INVALID')) {
        this.lastErrorCode = 'AUTHENTICATION_ERROR';
        this.lastError = 'Provider authentication or permission failed.';
        throw new ProviderError(
          'Gemini authentication failed. Verify GEMINI_API_KEY in Render environment.',
          'gemini',
          'AUTHENTICATION_ERROR',
          401,
          this.modelName
        );
      }

      if (error.status === 404 || errStr.includes('404') || errStr.includes('not found')) {
        this.lastErrorCode = 'MODEL_NOT_FOUND';
        this.lastError = 'The selected model or voice was not found.';
        throw new ProviderError(
          `The selected voice model '${this.modelName}' was not found.`,
          'gemini',
          'MODEL_NOT_FOUND',
          404,
          this.modelName
        );
      }

      if (error.status === 503 || errStr.includes('503') || errStr.includes('UNAVAILABLE')) {
        this.lastErrorCode = 'UNAVAILABLE';
        this.lastError = 'The provider is temporarily unavailable.';
        throw new ProviderError(
          'Gemini Voice is temporarily unavailable.',
          'gemini',
          'UNAVAILABLE',
          503,
          this.modelName
        );
      }

      this.lastErrorCode = 'UNAVAILABLE';
      this.lastError = 'Gemini Voice is temporarily unavailable.';
      throw new ProviderError(
        'Gemini Voice is temporarily unavailable.',
        'gemini',
        'UNAVAILABLE',
        500,
        this.modelName
      );
    }
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new ProviderError(
        'Gemini speech transcription is unconfigured.',
        'gemini',
        'NOT_CONFIGURED',
        400
      );
    }

    try {
      const base64Data = request.audioData
        ? request.audioData.replace(/^data:[^;]+;base64,/, '')
        : request.audioBuffer
          ? Buffer.isBuffer(request.audioBuffer)
            ? request.audioBuffer.toString('base64')
            : Buffer.from(request.audioBuffer as ArrayBuffer).toString('base64')
          : '';

      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: request.mimeType || 'audio/wav',
                  data: base64Data,
                },
              },
              { text: 'Transcribe the spoken audio verbatim.' },
            ],
          },
        ],
      });

      const transcript = response.text || '';
      return {
        transcript,
        confidence: 0.98,
        provider: this.providerType,
        isMock: false,
      };
    } catch (err: any) {
      console.error('[GeminiVoiceAIProvider] Transcription failed:', err);
      this.lastError = err.message;
      throw new ProviderError(`Speech transcription failed: ${err.message}`, 'gemini', 'TRANSCRIPTION_FAILED', 500);
    }
  }

  public async testConnection(): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    voiceId?: string;
    audioUrl?: string;
    code?: string;
    status: ProviderHealthStatus;
    error?: string;
    message?: string;
  }> {
    if (!this.ai || !this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        voiceId: 'Aoede (Aura)',
        code: 'NOT_CONFIGURED',
        status: 'NOT_CONFIGURED',
        error: 'GEMINI_API_KEY is not configured on the backend server.',
      };
    }

    if (this.isQuotaExhausted()) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        voiceId: 'Aoede (Aura)',
        code: 'QUOTA_EXHAUSTED',
        status: 'QUOTA_EXHAUSTED',
        error: 'Gemini Voice quota exhausted. Try again later or switch to ElevenLabs.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.synthesizeSpeech({
        text: 'JEXA voice system online. Gemini neural speech test successful.',
        voiceId: 'aura',
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: Boolean(res.audioUrl),
        latencyMs,
        model: this.modelName,
        voiceId: 'Aoede (Aura)',
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
        voiceId: 'Aoede (Aura)',
        code: err.code || 'UNAVAILABLE',
        status,
        error: err.message || 'Gemini Voice test failed.',
      };
    }
  }
}
