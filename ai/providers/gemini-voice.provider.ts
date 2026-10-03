import { GoogleGenAI } from '@google/genai';
import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse, ProviderError } from '../../shared/types/provider';

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
      }
    }
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new ProviderError(
        'Voice AI service is not configured. Please configure GEMINI_API_KEY in your Render environment variables.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
    }

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

      return {
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
      this.lastError = error.message;
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(
        error.message || 'Failed to synthesize speech via Gemini Voice API.',
        'gemini',
        'SYNTHESIS_FAILED',
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
        'MISSING_CREDENTIALS',
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

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    if (!this.ai || !this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        error: 'GEMINI_API_KEY is not configured on the backend server.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.synthesizeSpeech({
        text: 'Ready',
        voiceId: 'aura',
      });

      return {
        success: Boolean(res.audioUrl),
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
