import { Request, Response } from 'express';
import { UsageTracker } from '../services/usage-tracker.service';
import { ToolRegistry } from '../tools/tool-registry';

export class UsageController {
  public static async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await UsageTracker.getSummary();
      res.json(summary);
    } catch (err: any) {
      console.error('[UsageController] Error fetching usage summary:', err.message);
      res.status(500).json({ error: 'Failed to retrieve AI usage summary.' });
    }
  }

  public static async getToolsStatus(_req: Request, res: Response): Promise<void> {
    try {
      const tools = await ToolRegistry.getInstance().getToolStatusList(true);
      res.json({ tools });
    } catch (err: any) {
      console.error('[UsageController] Error fetching tools status:', err.message);
      res.status(500).json({ error: 'Failed to retrieve tool statuses.' });
    }
  }

  public static async toggleTool(req: Request, res: Response): Promise<void> {
    const { toolName, enabled } = req.body || {};
    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ error: 'toolName string is required.' });
      return;
    }

    const newEnabledState = ToolRegistry.getInstance().toggleTool(toolName, enabled);
    res.json({ success: true, toolName, enabled: newEnabledState });
  }
}
