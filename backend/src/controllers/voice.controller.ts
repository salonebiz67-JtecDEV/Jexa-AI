import { Request, Response } from 'express';
import { VoiceService } from '../services/voice.service';
import { VoiceSynthesisRequest, isTtsModel } from '../../../shared/types/provider';
import { SecurityAuditService } from '../services/security-audit.service';

export class VoiceController {
  /**
   * Generates speech audio via Gemini TTS and returns either binary audio or JSON metadata
   */
  public static async handleVoice(req: Request, res: Response): Promise<void> {
    try {
      const payload: VoiceSynthesisRequest = { ...(req.body || {}) };

      if (!payload.text || typeof payload.text !== 'string' || !payload.text.trim()) {
        res.status(400).json({ success: false, error: 'Text is required for voice processing.' });
        return;
      }

      if (payload.model && !isTtsModel(payload.model)) {
        res.status(400).json({
          success: false,
          provider: 'gemini',
          code: 'INVALID_MODEL_TYPE',
          message: `Chat model '${payload.model}' cannot be used for voice. Select a TTS voice model.`,
          error: `Chat model '${payload.model}' cannot be used for voice. Select a TTS voice model.`,
        });
        return;
      }

      const result = await VoiceService.speak(payload);

      // Support direct binary audio streaming if requested via Accept header or format query
      const acceptsBinary =
        req.headers['accept']?.includes('audio/') ||
        req.query.format === 'binary';

      if (acceptsBinary) {
        const mimeType = result.format || 'audio/wav';
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

      let message = error.message || 'Voice synthesis failed.';

      if (statusCode === 429 || error.code === 'QUOTA_EXHAUSTED') {
        message = 'Gemini Voice quota exhausted. Try again later or switch the voice model in Settings.';
      } else if (statusCode === 404 || error.code === 'MODEL_NOT_FOUND' || error.code === 'VOICE_NOT_FOUND') {
        message = 'The selected Gemini voice model or voice persona was not found.';
      } else if (statusCode === 401 || statusCode === 403 || error.code === 'AUTHENTICATION_ERROR') {
        message = 'Gemini authentication or permission failed. Check GEMINI_API_KEY.';
      } else if (statusCode === 503 || error.code === 'UNAVAILABLE') {
        message = 'Gemini Voice is temporarily unavailable.';
      } else if (error.code === 'VOICE_TIMEOUT' || statusCode === 504) {
        message = 'Voice synthesis timed out after 20 seconds.';
      } else if (error.code === 'NOT_CONFIGURED' || error.code === 'MISSING_CREDENTIALS') {
        message = 'Gemini Voice is not configured. Check GEMINI_API_KEY on the server.';
      }

      const httpStatus =
        statusCode === 401 || statusCode === 403 || error.code === 'AUTHENTICATION_ERROR'
          ? 502
          : statusCode;

      res.status(httpStatus).json({
        success: false,
        provider: 'gemini',
        code: error.code || (statusCode === 429 ? 'QUOTA_EXHAUSTED' : 'VOICE_SYNTHESIS_FAILED'),
        status: error.code || (statusCode === 429 ? 'QUOTA_EXHAUSTED' : 'UNAVAILABLE'),
        message,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Health check endpoint: GET /api/voice/health
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
      const text: string | undefined = req.body?.text;
      const model: string | undefined =
        typeof req.body?.model === 'string' && req.body.model.trim()
          ? req.body.model.trim()
          : undefined;

      if (model && !isTtsModel(model)) {
        res.status(400).json({
          success: false,
          provider: 'gemini',
          code: 'INVALID_MODEL_TYPE',
          message: `Chat model '${model}' cannot be used for voice. Select a TTS voice model.`,
          error: `Chat model '${model}' cannot be used for voice. Select a TTS voice model.`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await VoiceService.testProvider('gemini', text, model);

      SecurityAuditService.record({
        eventType: 'provider_tested',
        severity: 'info',
        actorUserId: req.auth?.userId,
        actorEmail: req.auth?.email,
        actorRole: req.auth?.role,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: 200,
        summary: `Owner tested voice synthesis (gemini:${result.model || 'default'}).`,
      });

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

      let message = error.message || 'Voice test failed.';

      if (statusCode === 429 || error.code === 'QUOTA_EXHAUSTED') {
        message = 'Gemini Voice quota exhausted. Try again later or switch the voice model in Settings.';
      } else if (statusCode === 404 || error.code === 'MODEL_NOT_FOUND' || error.code === 'VOICE_NOT_FOUND') {
        message = 'The selected Gemini voice model or voice persona was not found.';
      } else if (statusCode === 401 || statusCode === 403 || error.code === 'AUTHENTICATION_ERROR') {
        message = 'Gemini authentication or permission failed. Check GEMINI_API_KEY.';
      } else if (statusCode === 503 || error.code === 'UNAVAILABLE') {
        message = 'Gemini Voice is temporarily unavailable.';
      } else if (error.code === 'NOT_CONFIGURED' || error.code === 'MISSING_CREDENTIALS') {
        message = 'Gemini Voice is not configured. Check GEMINI_API_KEY on the server.';
      }

      const httpStatus =
        statusCode === 401 || statusCode === 403 || error.code === 'AUTHENTICATION_ERROR'
          ? 502
          : statusCode;

      res.status(httpStatus).json({
        success: false,
        provider: 'gemini',
        code: error.code || (statusCode === 429 ? 'QUOTA_EXHAUSTED' : 'TEST_FAILED'),
        status: error.code || (statusCode === 429 ? 'QUOTA_EXHAUSTED' : 'UNAVAILABLE'),
        message,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
