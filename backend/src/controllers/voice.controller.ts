import { Request, Response } from 'express';
import { VoiceService } from '../services/voice.service';
import { VoiceSynthesisRequest } from '../../../shared/types/provider';

export class VoiceController {
  public static async handleVoice(req: Request, res: Response): Promise<void> {
    try {
      const payload: VoiceSynthesisRequest = req.body;

      if (!payload.text || typeof payload.text !== 'string') {
        res.status(400).json({ success: false, error: 'Text is required for voice processing.' });
        return;
      }

      const result = await VoiceService.synthesizeSpeech(payload);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[VoiceController] Error in voice processing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error in voice provider.',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
