import { InternalToolDefinition, InternalToolContext, ToolInputSchema } from '../../../shared/types/tools';
import { webSearchTool } from './definitions/web-search.tool';
import { memorySearchTool } from './definitions/memory-search.tool';
import { pastConversationsTool } from './definitions/past-conversations.tool';
import { researchHistoryTool } from './definitions/research-history.tool';
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
  enabled: boolean;
  isAvailable: boolean;
  isOwnerOnly: boolean;
  callsToday: number;
  averageDurationMs: number;
  lastError?: string;
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, InternalToolDefinition> = new Map();
  private disabledTools: Set<string> = new Set();
  private toolStats: Map<string, { callsToday: number; totalDurationMs: number; lastError?: string; lastDate: string }> = new Map();

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
    let stat = this.toolStats.get(name);
    if (!stat || stat.lastDate !== today) {
      stat = { callsToday: 0, totalDurationMs: 0, lastError: undefined, lastDate: today };
      this.toolStats.set(name, stat);
    }
    stat.callsToday += 1;
    stat.totalDurationMs += Math.max(0, durationMs);
    if (!success && error) {
      stat.lastError = String(error).slice(0, 200);
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

  public async getToolStatusList(isOwner = true): Promise<ToolStatusItem[]> {
    const today = this.getTodayDateStr();
    const result: ToolStatusItem[] = [];

    // Ensure our 10 standard tools appear in the specified canonical order
    const canonicalOrder = [
      'web_search',
      'memory_search',
      'past_conversations_search',
      'research_history_search',
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

    const ownerOnlyTools = new Set([
      'system_check',
      'recent_errors',
      'list_source_files',
      'read_source_file',
      'search_code',
    ]);

    for (const toolName of canonicalOrder) {
      const tool = allToolsMap.get(toolName);
      if (!tool) continue;

      let isAvailable = false;
      try {
        isAvailable = await tool.isAvailable({ isOwner });
      } catch {
        isAvailable = false;
      }

      const stat = this.toolStats.get(tool.name);
      const callsToday = stat && stat.lastDate === today ? stat.callsToday : 0;
      const totalDuration = stat && stat.lastDate === today ? stat.totalDurationMs : 0;
      const avgDuration = callsToday > 0 ? Math.round(totalDuration / callsToday) : 0;

      result.push({
        name: tool.name,
        displayName: tool.displayName || tool.name,
        description: tool.description,
        enabled: !this.disabledTools.has(tool.name),
        isAvailable,
        isOwnerOnly: ownerOnlyTools.has(tool.name),
        callsToday,
        averageDurationMs: avgDuration,
        lastError: stat?.lastError,
      });
    }

    return result;
  }

  private registerBuiltInTools(): void {
    this.registerTool(webSearchTool);
    this.registerTool(memorySearchTool);
    this.registerTool(pastConversationsTool);
    this.registerTool(researchHistoryTool);
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
   * Unregister a tool by name (e.g. for testing or feature deprecation)
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
   * Reset registry back to built-ins (useful for test isolation)
   */
  public resetToDefaults(): void {
    this.tools.clear();
    this.registerBuiltInTools();
  }
}
