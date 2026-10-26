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

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, InternalToolDefinition> = new Map();

  private constructor() {
    this.registerBuiltInTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
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
