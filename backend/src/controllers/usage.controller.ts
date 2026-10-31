import { Request, Response } from 'express';
import { isRequestOwner } from '../middleware/auth.middleware';
import { UsageTracker } from '../services/usage-tracker.service';
import { ToolRegistry } from '../tools/tool-registry';

export class UsageController {
  public static async getSummary(req: Request, res: Response): Promise<void> {
    if (!isRequestOwner(req)) {
      res.status(403).json({ error: 'Forbidden: Owner access required.' });
      return;
    }

    try {
      const summary = await UsageTracker.getSummary();
      res.json(summary);
    } catch (err: any) {
      console.error('[UsageController] Error fetching usage summary:', err.message);
      res.status(500).json({ error: 'Failed to retrieve AI usage summary.' });
    }
  }

  public static async getToolsStatus(req: Request, res: Response): Promise<void> {
    try {
      const isOwner = isRequestOwner(req);
      const tools = await ToolRegistry.getInstance().getToolStatusList(isOwner);
      res.json({ tools, isOwner });
    } catch (err: any) {
      console.error('[UsageController] Error fetching tools status:', err.message);
      res.status(500).json({ error: 'Failed to retrieve tool statuses.' });
    }
  }

  public static async toggleTool(req: Request, res: Response): Promise<void> {
    if (!isRequestOwner(req)) {
      res.status(403).json({ error: 'Forbidden: Owner access required.' });
      return;
    }

    const { toolName, enabled } = req.body || {};
    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ error: 'toolName string is required.' });
      return;
    }

    const newEnabledState = ToolRegistry.getInstance().toggleTool(toolName, enabled);
    res.json({ success: true, toolName, enabled: newEnabledState });
  }
}
