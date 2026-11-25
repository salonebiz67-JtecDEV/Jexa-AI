import { GoogleGenAI } from '@google/genai';
import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import {
  VoiceProviderType,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  ProviderError,
  ProviderHealthStatus,
  DEFAULT_VOICE_MODEL,
  isTtsModel,
} from '../../shared/types/provider';
import { UsageTracker } from '../../backend/src/services/usage-tracker.service';
import { LocalConfigManager } from '../../shared/config/local-config';

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
  header.writeUInt16LE(1, 20);
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
  private activeApiKey: string = '';
  public isConfigured: boolean = false;
  public lastError?: string;
  public lastErrorCode?: string;
  private quotaExhaustedByModel: Map<string, number> = new Map();
  public hasSuccessfulTest: boolean = false;
  public lastSuccessfulTest?: { timestamp: string; latencyMs: number };

  constructor(customModel?: string) {
    let rawModel = (
      customModel ||
      LocalConfigManager.get('VOICE_AI_MODEL') ||
      LocalConfigManager.get('GEMINI_VOICE_MODEL') ||
      DEFAULT_VOICE_MODEL
    ).trim();

    if (!isTtsModel(rawModel)) {
      console.warn(`[GeminiVoiceAIProvider] Non-TTS model '${rawModel}' cannot be used for voice. Reverting to '${DEFAULT_VOICE_MODEL}'.`);
      rawModel = DEFAULT_VOICE_MODEL;
    }

    this.modelName = rawModel;
    this.syncClientFromConfig(true);
  }

  private syncClientFromConfig(logOnInit = false): GoogleGenAI | null {
    const apiKey = (
      LocalConfigManager.getGeminiConfig().voiceApiKey ||
      LocalConfigManager.get('VOICE_AI_API_KEY') ||
      ''
    ).trim();

    if (!apiKey) {
      this.ai = null;
      this.activeApiKey = '';
      this.isConfigured = false;
      return null;
    }

    if (this.ai && this.activeApiKey === apiKey) {
      this.isConfigured = true;
      return this.ai;
    }

    try {
      this.ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      this.activeApiKey = apiKey;
      this.isConfigured = true;
      this.lastError = undefined;
      this.lastErrorCode = undefined;
      if (logOnInit) {
        console.log(`[GeminiVoiceAIProvider] Initialized with model: ${this.modelName}`);
      }
      return this.ai;
    } catch (err: any) {
      console.error('[GeminiVoiceAIProvider] Initialization error:', err);
      this.ai = null;
      this.activeApiKey = '';
      this.isConfigured = false;
      this.lastError = err.message;
      this.lastErrorCode = 'NOT_CONFIGURED';
      return null;
    }
  }

  private resolveVoiceModel(requestedModel?: string): string {
    const trimmed = (requestedModel || '').trim();
    if (!trimmed) return this.modelName;
    if (!isTtsModel(trimmed)) {
      throw new ProviderError(
        `Chat model '${trimmed}' cannot be used for voice synthesis. Please select a Gemini TTS voice model in Settings.`,
        'gemini',
        'INVALID_MODEL_TYPE',
        400,
        trimmed
      );
    }
    return trimmed;
  }

  public isQuotaExhausted(model?: string): boolean {
    const target = model || this.modelName;
    const until = this.quotaExhaustedByModel.get(target) || 0;
    return Date.now() < until;
  }

  public getStatus(): ProviderHealthStatus {
    const aiClient = this.syncClientFromConfig();
    if (!this.isConfigured || !aiClient) return 'NOT_CONFIGURED';
    if (this.isQuotaExhausted() || this.lastErrorCode === 'QUOTA_EXHAUSTED') return 'QUOTA_EXHAUSTED';
    if (this.lastErrorCode === 'AUTHENTICATION_ERROR') return 'AUTHENTICATION_ERROR';
    if (this.lastErrorCode === 'MODEL_NOT_FOUND') return 'MODEL_NOT_FOUND';
    if (this.lastErrorCode === 'PAYMENT_REQUIRED') return 'PAYMENT_REQUIRED';
    if (this.hasSuccessfulTest) return 'CONNECTED';
    if (this.lastError) return 'UNAVAILABLE';
    return 'READY';
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    const targetModel = this.resolveVoiceModel(request.model);
    const aiClient = this.syncClientFromConfig();

    if (!aiClient || !this.isConfigured) {
      this.lastErrorCode = 'NOT_CONFIGURED';
      throw new ProviderError(
        'Voice AI service is not configured. Please set GEMINI_API_KEY in Variables or environment settings.',
        'gemini',
        'NOT_CONFIGURED',
        400,
        targetModel
      );
    }

    if (this.isQuotaExhausted(targetModel)) {
      const until = this.quotaExhaustedByModel.get(targetModel) || Date.now();
      const remainingMs = Math.max(0, until - Date.now());
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      const retryHint = remainingHours > 1 ? `in ~${remainingHours}h` : 'shortly';
      throw new ProviderError(
        `Gemini Voice (${targetModel}) quota exhausted. Try again ${retryHint} or pick another voice model in Settings.`,
        'gemini',
        'QUOTA_EXHAUSTED',
        429,
        targetModel
      );
    }

    const startTime = Date.now();
    try {
      const voiceMap: Record<string, string> = {
        aura: 'Aoede',
        'aura-jexa-serene': 'Aoede',
        atlas: 'Fenrir',
        lyra: 'Kore',
        puck: 'Puck',
        charon: 'Charon',
      };
      const requestedVoice = (request.voiceId || 'aura').toLowerCase();
      const voiceName = voiceMap[requestedVoice] || 'Aoede';

      const cleanText = request.text.replace(/[*#`_\[\]]/g, '').trim();
      if (!cleanText) {
        throw new ProviderError('No valid text provided for speech synthesis.', 'gemini', 'INVALID_INPUT', 400);
      }

      const responseStream = await aiClient.models.generateContentStream({
        model: targetModel,
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
          targetModel
        );
      }

      const pcmCombined = Buffer.concat(pcmChunks);
      const wavBuffer = addWavHeader(pcmCombined, 24000, 1, 16);
      const base64Wav = wavBuffer.toString('base64');
      const audioUrl = `data:audio/wav;base64,${base64Wav}`;

      const durationSeconds = Math.round(pcmCombined.length / (24000 * 2));
      const latencyMs = Date.now() - startTime;

      this.hasSuccessfulTest = true;
      this.lastSuccessfulTest = {
        timestamp: new Date().toISOString(),
        latencyMs,
      };
      this.lastErrorCode = undefined;
      this.lastError = undefined;

      UsageTracker.recordAICall({
        provider: 'gemini',
        model: targetModel,
        purpose: 'voice_tts',
        promptChars: cleanText.length,
        completionChars: Math.round(durationSeconds * 20),
        isEstimated: true,
        durationMs: latencyMs,
        status: 'ok',
      });

      return {
        audioBuffer: wavBuffer,
        contentType: 'audio/wav',
        audioUrl,
        format: 'audio/wav',
        durationSeconds: Math.max(1, durationSeconds),
        isSimulated: false,
        message: 'Speech synthesized successfully via Gemini Neural TTS.',
        provider: this.providerType,
        model: targetModel,
      };
    } catch (error: any) {
      const errStatus = Number(error?.status || error?.statusCode) || 500;
      console.warn(`[GeminiVoiceAIProvider] Speech synthesis failed (${errStatus}): ${error?.message || error}`);
      const latencyMs = Date.now() - startTime;
      const promptChars = (request.text || '').length;

      if (error instanceof ProviderError) {
        UsageTracker.recordAICall({
          provider: 'gemini',
          model: targetModel,
          purpose: 'voice_tts',
          promptChars,
          completionTokens: 0,
          isEstimated: true,
          durationMs: latencyMs,
          status: error.statusCode === 429 ? 'rate_limited' : 'error',
          errorStatusCode: error.statusCode,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.message,
        });
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
        let cooldownMs = 12 * 60 * 60 * 1000;
        const matchSec = error.message?.match(/retry(?:\s+in|\s+after)?\s+(\d+(?:\.\d+)?)\s*s/i);
        if (matchSec && parseFloat(matchSec[1])) {
          cooldownMs = parseFloat(matchSec[1]) * 1000;
        }
        this.quotaExhaustedByModel.set(targetModel, Date.now() + cooldownMs);
        this.lastErrorCode = 'QUOTA_EXHAUSTED';
        this.lastError = `Gemini Voice (${targetModel}) quota exhausted. Try again later or pick another voice model in Settings.`;
        UsageTracker.recordAICall({
          provider: 'gemini',
          model: targetModel,
          purpose: 'voice_tts',
          promptChars,
          completionTokens: 0,
          isEstimated: true,
          durationMs: latencyMs,
          status: 'rate_limited',
          errorStatusCode: 429,
          errorCode: 'QUOTA_EXHAUSTED',
          errorMessage: this.lastError,
          errorDetails: error.message || this.lastError,
        });
        throw new ProviderError(
          this.lastError,
          'gemini',
          'QUOTA_EXHAUSTED',
          429,
          targetModel
        );
      }

      if (error.status === 401 || error.status === 403 || errStr.includes('401') || errStr.includes('API_KEY_INVALID')) {
        this.lastErrorCode = 'AUTHENTICATION_ERROR';
        this.lastError = 'Gemini authentication failed. Verify GEMINI_API_KEY.';
        UsageTracker.recordAICall({
          provider: 'gemini',
          model: targetModel,
          purpose: 'voice_tts',
          promptChars,
          completionTokens: 0,
          isEstimated: true,
          durationMs: latencyMs,
          status: 'error',
          errorStatusCode: 401,
          errorCode: 'AUTHENTICATION_ERROR',
          errorMessage: this.lastError,
          errorDetails: error.message || this.lastError,
        });
        throw new ProviderError(
          this.lastError,
          'gemini',
          'AUTHENTICATION_ERROR',
          401,
          targetModel
        );
      }

      if (error.status === 404 || errStr.includes('404') || errStr.includes('not found')) {
        this.lastErrorCode = 'MODEL_NOT_FOUND';
        this.lastError = `The selected voice model '${targetModel}' was not found.`;
        UsageTracker.recordAICall({
          provider: 'gemini',
          model: targetModel,
          purpose: 'voice_tts',
          promptChars,
          completionTokens: 0,
          isEstimated: true,
          durationMs: latencyMs,
          status: 'error',
          errorStatusCode: 404,
          errorCode: 'MODEL_NOT_FOUND',
          errorMessage: this.lastError,
          errorDetails: error.message || this.lastError,
        });
        throw new ProviderError(
          this.lastError,
          'gemini',
          'MODEL_NOT_FOUND',
          404,
          targetModel
        );
      }

      if (error.status === 503 || errStr.includes('503') || errStr.includes('UNAVAILABLE')) {
        this.lastErrorCode = 'UNAVAILABLE';
        this.lastError = 'Gemini Voice is temporarily unavailable.';
        UsageTracker.recordAICall({
          provider: 'gemini',
          model: targetModel,
          purpose: 'voice_tts',
          promptChars,
          completionTokens: 0,
          isEstimated: true,
          durationMs: latencyMs,
          status: 'error',
          errorStatusCode: 503,
          errorCode: 'UNAVAILABLE',
          errorMessage: this.lastError,
          errorDetails: error.message || this.lastError,
        });
        throw new ProviderError(
          this.lastError,
          'gemini',
          'UNAVAILABLE',
          503,
          targetModel
        );
      }

      const statusNum = Number(error.status || error.statusCode) || 500;
      const isBadRequest = statusNum === 400 || errStr.includes('INVALID_ARGUMENT');
      const resolvedCode = isBadRequest ? 'INVALID_ARGUMENT' : (error.code || 'UNAVAILABLE');
      const resolvedMessage = error.message || (isBadRequest ? 'Invalid voice synthesis request.' : 'Gemini Voice is temporarily unavailable.');

      if (!isBadRequest) {
        this.lastErrorCode = 'UNAVAILABLE';
        this.lastError = resolvedMessage;
      }

      UsageTracker.recordAICall({
        provider: 'gemini',
        model: targetModel,
        purpose: 'voice_tts',
        promptChars,
        completionTokens: 0,
        isEstimated: true,
        durationMs: latencyMs,
        status: 'error',
        errorStatusCode: statusNum,
        errorCode: resolvedCode,
        errorMessage: resolvedMessage,
        errorDetails: error.message || resolvedMessage,
      });
      throw new ProviderError(
        resolvedMessage,
        'gemini',
        resolvedCode,
        statusNum,
        targetModel
      );
    }
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    const aiClient = this.syncClientFromConfig();
    if (!aiClient || !this.isConfigured) {
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

      const response = await aiClient.models.generateContent({
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

  public async testConnection(customModel?: string): Promise<{
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
    let targetModel: string;
    try {
      targetModel = this.resolveVoiceModel(customModel);
    } catch (modelErr: any) {
      return {
        success: false,
        latencyMs: 0,
        model: customModel || this.modelName,
        voiceId: 'Aoede (Aura)',
        code: modelErr.code || 'INVALID_MODEL_TYPE',
        status: 'ERROR',
        error: modelErr.message,
      };
    }

    const aiClient = this.syncClientFromConfig();
    if (!aiClient || !this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: targetModel,
        voiceId: 'Aoede (Aura)',
        code: 'NOT_CONFIGURED',
        status: 'NOT_CONFIGURED',
        error: 'GEMINI_API_KEY is not configured.',
      };
    }

    if (this.isQuotaExhausted(targetModel)) {
      return {
        success: false,
        latencyMs: 0,
        model: targetModel,
        voiceId: 'Aoede (Aura)',
        code: 'QUOTA_EXHAUSTED',
        status: 'QUOTA_EXHAUSTED',
        error: `Gemini Voice (${targetModel}) quota exhausted. Try again later or pick another voice model in Settings.`,
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.synthesizeSpeech({
        text: 'JEXA voice system online. Gemini neural speech test successful.',
        voiceId: 'aura',
        model: targetModel,
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: Boolean(res.audioUrl),
        latencyMs,
        model: targetModel,
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
        model: targetModel,
        voiceId: 'Aoede (Aura)',
        code: err.code || 'UNAVAILABLE',
        status,
        error: err.message || 'Gemini Voice test failed.',
      };
    }
  }
}
