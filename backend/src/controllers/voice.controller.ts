import { Request, Response } from 'express';
import { VoiceService } from '../services/voice.service';
import { VoiceSynthesisRequest, VoiceProviderType } from '../../../shared/types/provider';

export class VoiceController {
  /**
   * Generates speech audio and returns either binary audio or JSON metadata
   */
  public static async handleVoice(req: Request, res: Response): Promise<void> {
    try {
      const payload: VoiceSynthesisRequest = req.body;

      if (!payload.text || typeof payload.text !== 'string' || !payload.text.trim()) {
        res.status(400).json({ success: false, error: 'Text is required for voice processing.' });
        return;
      }

      const result = await VoiceService.speak(payload);

      // Support direct binary audio streaming if requested via Accept header or format query
      const acceptsBinary =
        req.headers['accept']?.includes('audio/') ||
        req.query.format === 'binary';

      if (acceptsBinary) {
        const mimeType = result.format || (result.provider === 'elevenlabs' ? 'audio/mpeg' : 'audio/wav');
        let audioBuf: Buffer | null = null;

        if (result.audioBuffer && Buffer.isBuffer(result.audioBuffer)) {
          audioBuf = result.audioBuffer;
        } else if (result.audioUrl && result.audioUrl.startsWith('data:')) {
          const base64Data = result.audioUrl.replace(/^data:[^;]+;base64,/, '');
          audioBuf = Buffer.from(base64Data, 'base64');
        }

        if (audioBuf) {
          res.set('Content-Type', mimeType);
          res.set('Content-Length', String(audioBuf.length));
          res.status(200).send(audioBuf);
          return;
        }
      }

      // Default JSON response containing data URL
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[VoiceController] Error in voice processing:', error);
      const statusCode =
        error.statusCode && error.statusCode >= 400 && error.statusCode < 600
          ? error.statusCode
          : 500;

      const provider = error.provider || 'voice_ai';
      let message = error.message || 'Voice synthesis failed.';

      // User-friendly error messages
      if (error.code === 'MISSING_CREDENTIALS') {
        message =
          provider === 'elevenlabs'
            ? 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY.'
            : 'Gemini voice is temporarily unavailable. Try ElevenLabs.';
      } else if (error.code === 'VOICE_NOT_FOUND') {
        message = 'ElevenLabs voice ID is invalid or unavailable.';
      } else if (error.code === 'MODEL_NOT_FOUND') {
        message = 'The selected voice model is unavailable.';
      } else if (provider === 'gemini' && statusCode >= 500) {
        message = 'Gemini voice is temporarily unavailable. Try ElevenLabs.';
      }

      res.status(statusCode).json({
        success: false,
        provider,
        code: error.code || 'VOICE_SYNTHESIS_FAILED',
        message,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Health check endpoint: GET /api/voice/health
   * Never exposes API keys or secrets
   */
  public static async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const health = VoiceService.getHealth();
      res.status(200).json({
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Performs a real end-to-end voice generation test: POST /api/voice/test
   */
  public static async testVoice(req: Request, res: Response): Promise<void> {
    try {
      const provider: VoiceProviderType = req.body?.provider || 'gemini';
      const text: string | undefined = req.body?.text;

      const result = await VoiceService.testProvider(provider, text);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.warn('[VoiceController] Voice test failed:', error.message);
      const statusCode =
        error.statusCode && error.statusCode >= 400 && error.statusCode < 600
          ? error.statusCode
          : 500;

      const provider = error.provider || req.body?.provider || 'voice_ai';
      let message = error.message || 'Voice test failed.';

      if (error.code === 'MISSING_CREDENTIALS') {
        message =
          provider === 'elevenlabs'
            ? 'ElevenLabs authentication failed. Check ELEVENLABS_API_KEY.'
            : 'Gemini voice is temporarily unavailable. Check GEMINI_API_KEY.';
      }

      res.status(statusCode).json({
        success: false,
        provider,
        code: error.code || 'TEST_FAILED',
        message,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
