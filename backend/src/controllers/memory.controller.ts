import { Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import { MemoryCreateInput } from '../../../shared/types/memory';

export class MemoryController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const memories = await MemoryService.getAllMemories(userId);
      res.status(200).json({
        success: true,
        data: memories,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[MemoryController] list error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
      const input: MemoryCreateInput = req.body;
      if (!input.fact || !input.category) {
        res.status(400).json({ success: false, error: 'Fact and category are required' });
        return;
      }
      const memory = await MemoryService.createMemory(input, userId);
      res.status(201).json({
        success: true,
        data: memory,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[MemoryController] create error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
      const { id } = req.params;
      const success = await MemoryService.deleteMemory(id, userId);
      res.status(200).json({
        success,
        data: { id, deleted: success },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[MemoryController] delete error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
