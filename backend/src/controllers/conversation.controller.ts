import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';

export class ConversationController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const conversations = await DatabaseService.listConversations(userId);
      res.status(200).json({
        success: true,
        data: conversations,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] list error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Unable to sync with the server.',
      });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { title, personaId } = req.body || {};
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const conversation = await DatabaseService.createConversation(title, personaId, userId);
      res.status(201).json({
        success: true,
        data: conversation,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] create error:', error);
      res.status(500).json({
        success: false,
        error: error.message || "Couldn't save. Please try again.",
      });
    }
  }

  public static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const conversation = await DatabaseService.getConversation(id, userId);
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }
      res.status(200).json({
        success: true,
        data: conversation,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] getById error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Unable to sync with the server.',
      });
    }
  }

  public static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, pinned, personaId } = req.body || {};
      const updated = await DatabaseService.updateConversation(id, {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(pinned !== undefined ? { pinned: Boolean(pinned) } : {}),
        ...(personaId !== undefined ? { personaId: String(personaId) } : {}),
      });

      if (!updated) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] update error:', error);
      res.status(500).json({
        success: false,
        error: error.message || "Couldn't save. Please try again.",
      });
    }
  }

  public static async togglePin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { pinned } = req.body || {};
      const updated = await DatabaseService.togglePinConversation(id, Boolean(pinned));

      if (!updated) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] togglePin error:', error);
      res.status(500).json({
        success: false,
        error: error.message || "Couldn't save. Please try again.",
      });
    }
  }

  public static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const messages = await DatabaseService.getMessages(id, userId);
      res.status(200).json({
        success: true,
        data: messages,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] getMessages error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Unable to sync with the server.',
      });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const deleted = await DatabaseService.deleteConversation(id, userId);
      res.status(200).json({
        success: deleted,
        data: { id, deleted },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ConversationController] delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message || "Couldn't save. Please try again.",
      });
    }
  }
}
