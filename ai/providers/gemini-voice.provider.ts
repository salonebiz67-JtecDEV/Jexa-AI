import { GoogleGenAI } from '@google/genai';
import { IVoiceAIProvider, AudioTranscriptionRequest, AudioTranscriptionResponse } from './voice-provider.interface';
import { VoiceProviderType, VoiceSynthesisRequest, VoiceSynthesisResponse } from '../../shared/types/provider';

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
  public readonly modelName = 'gemini-3.8-flash-lite-tts';
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;

  constructor() {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.VOICE_AI_API_KEY;

    if (apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey });
        this.isConfigured = true;
      } catch (err) {
        console.error('[GeminiVoiceAIProvider] Initialization error:', err);
        this.isConfigured = false;
      }
    }
  }

  public async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new Error(
        'Voice AI service is not configured. Please configure GEMINI_API_KEY in your Render environment variables.'
      );
    }

    try {
      // Map voice identifier to Gemini prebuilt voice
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
        throw new Error('No valid text provided for speech synthesis.');
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
        throw new Error('Gemini TTS generated empty audio data.');
      }

      const rawPcm = Buffer.concat(pcmChunks);
      const wavBuffer = addWavHeader(rawPcm, 24000, 1, 16);
      const audioUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

      // Calculate accurate duration (24000 samples/sec * 2 bytes/sample = 48000 bytes/sec)
      const durationSeconds = +(rawPcm.length / 48000).toFixed(2);

      return {
        audioUrl,
        format: 'audio/wav',
        durationSeconds,
        isSimulated: false,
        message: 'Voice synthesized successfully',
      };
    } catch (err: any) {
      console.error('[GeminiVoiceAIProvider] Speech synthesis failed:', err);
      throw new Error(`Voice synthesis failed: ${err.message || 'API error'}`);
    }
  }

  public async transcribeAudio(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new Error(
        'Speech transcription service is not configured. Please configure GEMINI_API_KEY in Render.'
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
      throw new Error(`Speech transcription failed: ${err.message || 'API error'}`);
    }
  }
}
