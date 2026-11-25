import { InternalToolDefinition, InternalToolContext, ToolInputSchema } from '../../../shared/types/tools';
import { webSearchTool } from './definitions/web-search.tool';
import { openLinkTool } from './definitions/open-link.tool';
import { systemTimeTool } from './definitions/system-time.tool';
import { systemCheckTool } from './definitions/system-check.tool';
import { recentErrorsTool } from './definitions/recent-errors.tool';
import { listSourceFilesTool } from './definitions/list-source-files.tool';
import { readSourceFileTool } from './definitions/read-source-file.tool';
import { searchCodeTool } from './definitions/search-code.tool';

export interface ToolStatusItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  enabled: boolean;
  isAvailable: boolean;
  available: boolean;
  callsToday: number;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  avgDurationMs: number;
  averageDurationMs: number;
  lastUsedAt: string | null;
  lastError: string | null;
}

interface InternalToolRuntimeStats {
  callsToday: number;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  lastUsedAt: string | null;
  lastError: string | null;
  lastDate: string;
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, InternalToolDefinition> = new Map();
  private disabledTools: Set<string> = new Set();
  private toolStats: Map<string, InternalToolRuntimeStats> = new Map();

  private constructor() {
    this.registerBuiltInTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private getTodayDateStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public recordToolRun(name: string, durationMs: number, success: boolean, error?: string): void {
    const today = this.getTodayDateStr();
    const nowIso = new Date().toISOString();
    let stat = this.toolStats.get(name);
    if (!stat) {
      stat = {
        callsToday: 0,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        lastUsedAt: null,
        lastError: null,
        lastDate: today,
      };
      this.toolStats.set(name, stat);
    }

    if (stat.lastDate !== today) {
      stat.callsToday = 0;
      stat.lastDate = today;
    }

    stat.callsToday += 1;
    stat.totalCalls += 1;
    if (success) {
      stat.successCount += 1;
    } else {
      stat.failureCount += 1;
    }
    stat.totalDurationMs += Math.max(0, Math.round(durationMs || 0));
    stat.lastUsedAt = nowIso;

    if (!success && error) {
      stat.lastError = String(error).slice(0, 500);
    }
  }

  public toggleTool(name: string, enabled?: boolean): boolean {
    const isCurrentlyEnabled = !this.disabledTools.has(name);
    const targetState = enabled !== undefined ? enabled : !isCurrentlyEnabled;

    if (targetState) {
      this.disabledTools.delete(name);
    } else {
      this.disabledTools.add(name);
    }
    return !this.disabledTools.has(name);
  }

  public isToolEnabled(name: string): boolean {
    return !this.disabledTools.has(name);
  }

  public async getToolStatusList(): Promise<ToolStatusItem[]> {
    const today = this.getTodayDateStr();
    const result: ToolStatusItem[] = [];

    const canonicalOrder = [
      'web_search',
      'open_link',
      'system_time',
      'system_check',
      'recent_errors',
      'list_source_files',
      'read_source_file',
      'search_code',
    ];

    const allToolsMap = new Map<string, InternalToolDefinition>();
    for (const t of this.tools.values()) {
      allToolsMap.set(t.name, t);
    }

    // Add any extra registered tools at the end if not in canonicalOrder
    const orderedNames = [
      ...canonicalOrder,
      ...Array.from(allToolsMap.keys()).filter((n) => !canonicalOrder.includes(n)),
    ];

    for (const toolName of orderedNames) {
      const tool = allToolsMap.get(toolName);
      if (!tool) continue;

      let isAvailable = false;
      try {
        isAvailable = await tool.isAvailable({});
      } catch {
        isAvailable = false;
      }

      const stat = this.toolStats.get(tool.name);
      const callsToday = stat && stat.lastDate === today ? stat.callsToday : 0;
      const totalCalls = stat ? stat.totalCalls : 0;
      const successCount = stat ? stat.successCount : 0;
      const failureCount = stat ? stat.failureCount : 0;
      const totalDuration = stat ? stat.totalDurationMs : 0;
      const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
      const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : null;

      result.push({
        name: tool.name,
        displayName: tool.displayName || tool.name,
        description: tool.description,
        category: tool.category,
        enabled: !this.disabledTools.has(tool.name),
        isAvailable,
        available: isAvailable,
        callsToday,
        totalCalls,
        successCount,
        failureCount,
        successRate,
        avgDurationMs: avgDuration,
        averageDurationMs: avgDuration,
        lastUsedAt: stat?.lastUsedAt || null,
        lastError: stat?.lastError || null,
      });
    }

    return result;
  }

  private registerBuiltInTools(): void {
    this.registerTool(webSearchTool);
    this.registerTool(openLinkTool);
    this.registerTool(systemTimeTool);
    this.registerTool(systemCheckTool);
    this.registerTool(recentErrorsTool);
    this.registerTool(listSourceFilesTool);
    this.registerTool(readSourceFileTool);
    this.registerTool(searchCodeTool);
  }

  /**
   * Register a new internal tool into the registry
   */
  public registerTool(tool: InternalToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid non-empty name.');
    }
    if (!tool.execute || typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" must provide an execute function.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   */
  public unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Check if a tool is registered
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool definition by name
   */
  public getTool(name: string): InternalToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools regardless of availability
   */
  public getAllTools(): InternalToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools that are genuinely available given the current runtime context
   */
  public async getAvailableTools(context?: InternalToolContext): Promise<InternalToolDefinition[]> {
    const available: InternalToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      // Disabled tools must NOT be sent to the model
      if (this.disabledTools.has(tool.name)) {
        continue;
      }
      // Sensitive diagnostic/code tools require owner privileges when auth enforcement is active
      if (context?.restrictSensitiveTools && !context?.isOwner && tool.permissionLevel === 'sensitive') {
        continue;
      }
      try {
        const isAvail = await tool.isAvailable(context);
        if (isAvail) {
          available.push(tool);
        }
      } catch (err: any) {
        console.warn(`[ToolRegistry] Error checking availability for tool "${tool.name}":`, err.message);
      }
    }
    return available;
  }

  /**
   * Format available tools into model tool declarations
   */
  public async getToolDeclarations(context?: InternalToolContext): Promise<Array<{
    name: string;
    description: string;
    parameters: ToolInputSchema;
  }>> {
    const available = await this.getAvailableTools(context);
    return available.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
  }

  /**
   * Reset registry back to built-ins
   */
  public resetToDefaults(): void {
    this.tools.clear();
    this.registerBuiltInTools();
  }
}
