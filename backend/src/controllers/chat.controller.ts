import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { SendMessagePayload } from '../../../shared/types/chat';

export class ChatController {
  public static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const payload: SendMessagePayload = req.body;

      if (!payload.message || typeof payload.message !== 'string' || !payload.message.trim()) {
        res.status(400).json({ success: false, error: 'A non-empty message string is required.' });
        return;
      }

      const result = await ChatService.processMessage(payload);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ChatController] Error processing message:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error while processing message.',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
