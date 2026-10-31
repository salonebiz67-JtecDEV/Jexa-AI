import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { MemoryService } from '../../services/memory.service';
import { MemoryItem, getCategoryLabel } from '../../../../shared/types/memory';

export interface MemorySearchToolArgs {
  query: string;
  limit?: number;
}

export interface MemorySearchToolData {
  query: string;
  count: number;
  memories: Array<{
    id: string;
    category: string;
    categoryLabel: string;
    fact: string;
    confidence: number;
    memoryType: string;
  }>;
}

export const memorySearchTool: InternalToolDefinition<MemorySearchToolArgs, MemorySearchToolData> = {
  name: 'memory_search',
  displayName: 'Personal Memory Recall',
  description: 'Search and recall durable personal facts, preferences, and goals saved in long-term memory.',
  category: 'memory',
  permissionLevel: 'read_only',
  timeoutMs: 4000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Topic, name, or detail to recall from durable memory.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to return (1-10). Defaults to 6.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  isAvailable: (_context?: InternalToolContext): boolean => {
    return true;
  },
  execute: async (
    args: MemorySearchToolArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<MemorySearchToolData>> => {
    const startTime = Date.now();
    const query = (args.query || '').trim();

    if (!query) {
      return {
        success: false,
        toolName: 'memory_search',
        error: 'Query parameter cannot be empty.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(args.limit || 6, 1), 10);
    const rawMemories: MemoryItem[] = await MemoryService.getRelevantMemories(
      query,
      limit,
      context.userId
    );

    const formatted = rawMemories.map((m) => ({
      id: m.id,
      category: m.category,
      categoryLabel: getCategoryLabel(m.category),
      fact: m.fact,
      confidence: m.confidence,
      memoryType: m.memoryType || 'confirmed_fact',
    }));

    return {
      success: true,
      toolName: 'memory_search',
      data: {
        query,
        count: formatted.length,
        memories: formatted,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
