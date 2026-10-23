import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { DatabaseService } from '../../database/db-service';
import { ResearchHistoryItem } from '../../../../shared/types/memory';

export interface ResearchHistoryToolArgs {
  query?: string;
  limit?: number;
}

export interface ResearchHistoryToolData {
  count: number;
  items: Array<{
    query: string;
    summary: string;
    searchedAt: string;
    sourcesCount: number;
  }>;
}

export const researchHistoryTool: InternalToolDefinition<ResearchHistoryToolArgs, ResearchHistoryToolData> = {
  name: 'research_history_search',
  displayName: 'Research History Recall',
  description:
    'Retrieve previous web research queries and verified source digests that were previously investigated for this user. Use to check if a topic was already researched recently or to review prior sources.',
  category: 'search',
  permissionLevel: 'read_only',
  timeoutMs: 4000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional query topic to match against past research history.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to return (1-8). Defaults to 4.',
      },
    },
    additionalProperties: false,
  },
  isAvailable: (_context?: InternalToolContext): boolean => {
    return true;
  },
  execute: async (
    args: ResearchHistoryToolArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<ResearchHistoryToolData>> => {
    const startTime = Date.now();
    const limit = Math.min(Math.max(args.limit || 4, 1), 8);

    const historyItems: ResearchHistoryItem[] = await DatabaseService.getResearchHistory(
      context.userId,
      args.query?.trim() || undefined,
      limit
    );

    const items = historyItems.map((h) => ({
      query: h.query,
      summary: h.summary,
      searchedAt: h.searchedAt,
      sourcesCount: h.sources?.length || 0,
    }));

    return {
      success: true,
      toolName: 'research_history_search',
      data: {
        count: items.length,
        items,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
