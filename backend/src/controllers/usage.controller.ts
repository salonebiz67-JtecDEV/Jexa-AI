import { Request, Response } from 'express';
import { UsageTracker } from '../services/usage-tracker.service';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';

const SAFE_TOOL_EXAMPLES: Record<string, Record<string, any>> = {
  web_search: {
    query: 'Node.js current LTS release',
    maxResults: 2,
    searchDepth: 'basic',
    inspectPages: false,
  },
  open_link: {
    url: 'https://example.com',
  },
  system_time: {
    timezone: 'UTC',
  },
  system_check: {
    scope: 'quick',
  },
  recent_errors: {
    limit: 5,
  },
  list_source_files: {
    directory: 'shared',
    recursive: false,
    maxFiles: 10,
  },
  read_source_file: {
    path: 'package.json',
    startLine: 1,
    endLine: 25,
  },
  search_code: {
    query: 'ToolsPanel',
    directory: 'src',
    maxResults: 5,
  },
};

function summarizeToolTestResult(toolName: string, data: any): { message: string; preview?: string } {
  if (!data || typeof data !== 'object') {
    return { message: `Tool "${toolName}" completed successfully.` };
  }

  switch (toolName) {
    case 'web_search': {
      const topTitle = data.results?.[0]?.title;
      return {
        message: `Found ${data.resultsCount ?? 0} result(s) for "${data.query || ''}".`,
        preview: topTitle ? `Top result: ${topTitle}` : undefined,
      };
    }
    case 'open_link':
      return {
        message: `Opened "${data.title || data.finalUrl || data.url}" (${data.contentLength ?? 0} readable chars).`,
        preview: typeof data.text === 'string' ? data.text.slice(0, 160) : undefined,
      };
    case 'system_time':
      return {
        message: `${data.dayOfWeek}, ${data.date} ${data.time} (${data.timezone}).`,
      };
    case 'system_check':
      return {
        message: `Status: ${data.overallStatus || 'OK'} · Uptime ${data.server?.uptimeFormatted || 'n/a'} · Gemini ${data.aiProviders?.geminiText?.configured ? 'ready' : 'unconfigured'}.`,
      };
    case 'recent_errors':
      return {
        message: `Retrieved ${data.count ?? 0} recent error(s) (${data.totalBuffered ?? 0} buffered).`,
      };
    case 'list_source_files':
      return {
        message: `Listed ${data.totalFiles ?? 0} file(s) in "${data.directory || 'shared'}".`,
        preview: Array.isArray(data.files) ? data.files.slice(0, 3).map((f: any) => f.path).join(', ') : undefined,
      };
    case 'read_source_file':
      return {
        message: `Read lines ${data.startLine}-${data.endLine} of ${data.path} (${data.totalLines} total lines).`,
      };
    case 'search_code':
      return {
        message: `Found ${data.totalMatches ?? 0} match(es) across ${data.searchedFilesCount ?? 0} file(s).`,
        preview: data.matches?.[0] ? `${data.matches[0].file}:${data.matches[0].line}` : undefined,
      };
    default:
      return { message: `Tool "${toolName}" passed.` };
  }
}

export class UsageController {
  public static async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = UsageTracker.getSummary();
      res.json(summary);
    } catch (err: any) {
      console.error('[UsageController] Error fetching usage summary:', err.message);
      res.status(500).json({ error: 'Failed to retrieve AI usage summary.' });
    }
  }

  public static async getToolsStatus(_req: Request, res: Response): Promise<void> {
    try {
      const tools = await ToolRegistry.getInstance().getToolStatusList();
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

  public static async testTool(req: Request, res: Response): Promise<void> {
    const { toolName } = req.body || {};
    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({ error: 'toolName string is required.' });
      return;
    }

    const tool = ToolRegistry.getInstance().getTool(toolName);
    if (!tool) {
      res.status(404).json({ error: `Unknown tool "${toolName}".` });
      return;
    }

    const safeArgs = SAFE_TOOL_EXAMPLES[toolName] ?? {};
    try {
      const result = await ToolExecutor.executeTool(tool, safeArgs, {
        conversationId: 'tool-test',
        messageId: `tool-test-${Date.now()}`,
      });

      if (result.success) {
        const summary = summarizeToolTestResult(toolName, result.data);
        res.json({
          success: true,
          toolName,
          durationMs: result.executionTimeMs,
          message: summary.message,
          preview: summary.preview,
        });
      } else {
        res.json({
          success: false,
          toolName,
          durationMs: result.executionTimeMs,
          message: result.error || `Tool "${toolName}" failed.`,
          error: result.error || `Tool "${toolName}" failed.`,
        });
      }
    } catch (err: any) {
      res.json({
        success: false,
        toolName,
        durationMs: 0,
        message: err?.message || `Tool "${toolName}" threw an error.`,
        error: err?.message || `Tool "${toolName}" threw an error.`,
      });
    }
  }
}
