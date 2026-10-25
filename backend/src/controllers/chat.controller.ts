import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { SendMessagePayload, StreamChatEvent } from '../../../shared/types/chat';
import { formatCleanProviderError } from '../../../shared/types/provider';
import { getResolvedUserId, isRequestOwner } from '../middleware/auth.middleware';
import { ErrorLogService } from '../services/error-log.service';

export class ChatController {
  public static async sendMessage(req: Request, res: Response): Promise<void> {
    const payload: SendMessagePayload = req.body || {};
    const userId = getResolvedUserId(req);
    payload.userId = userId;
    payload.isOwner = isRequestOwner(req);

    if (!payload.message || typeof payload.message !== 'string' || !payload.message.trim()) {
      res.status(400).json({ success: false, error: 'A non-empty message string is required.' });
      return;
    }

    const isStreamRequested =
      Boolean(payload.stream) ||
      Boolean(req.headers.accept && req.headers.accept.includes('text/event-stream'));

    if (isStreamRequested) {
      // 1. Establish Server-Sent Events (SSE) streaming connection
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable proxy buffering on Render / Nginx
      });

      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      const sendEvent = (event: StreamChatEvent) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
          console.warn('[ChatController] Error writing SSE chunk:', err);
        }
      };

      try {
        const result = await ChatService.processMessage(
          payload,
          (status, details) => {
            sendEvent({
              type: 'status',
              status,
              details,
            });
          },
          (chunk) => {
            sendEvent({
              type: 'chunk',
              chunk,
            });
          }
        );

        sendEvent({
          type: 'complete',
          data: result,
        });
        res.end();
      } catch (error: any) {
        console.error('[ChatController] Stream error processing message:', error);
        ErrorLogService.log('chat', error, {
          userId,
          conversationId: payload.conversationId,
          stream: true,
        });
        const formatted = formatCleanProviderError(error);

        sendEvent({
          type: 'error',
          error: formatted.cleanMessage,
          status: 'Search failed — retry available',
          provider: error.provider || formatted.provider,
          model: error.model,
          fallbackUsed: Boolean(error.fallbackUsed),
        });
        res.end();
      }
      return;
    }

    // 2. Standard REST JSON flow (backward-compatible)
    try {
      const result = await ChatService.processMessage(payload);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ChatController] Error processing message:', error);
      ErrorLogService.log('chat', error, {
        userId,
        conversationId: payload.conversationId,
        stream: false,
      });
      const formatted = formatCleanProviderError(error);

      res.status(formatted.statusCode).json({
        success: false,
        provider: error.provider || formatted.provider || 'text_ai',
        model: error.model,
        fallbackUsed: Boolean(error.fallbackUsed),
        code: formatted.code,
        message: formatted.cleanMessage,
        error: formatted.cleanMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
