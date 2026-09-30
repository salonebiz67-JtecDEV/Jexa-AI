import { Request, Response } from 'express';
import { DatabaseService } from '../database/db-service';

export class ConversationController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const conversations = await DatabaseService.listConversations();
      res.status(200).json({
        success: true,
        data: conversations,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { title, personaId } = req.body || {};
      const conversation = await DatabaseService.createConversation(title, personaId);
      res.status(201).json({
        success: true,
        data: conversation,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const conversation = await DatabaseService.getConversation(id);
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
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const messages = await DatabaseService.getMessages(id);
      res.status(200).json({
        success: true,
        data: messages,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await DatabaseService.deleteConversation(id);
      res.status(200).json({
        success: true,
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
