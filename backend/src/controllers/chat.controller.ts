import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { SendMessagePayload } from '../../../shared/types/chat';
import { formatCleanProviderError } from '../../../shared/types/provider';

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
      const formatted = formatCleanProviderError(error);

      res.status(formatted.statusCode).json({
        success: false,
        provider: error.provider || 'text_ai',
        code: formatted.code,
        message: formatted.cleanMessage,
        error: formatted.cleanMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
