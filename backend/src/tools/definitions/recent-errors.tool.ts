import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { ErrorLogService, SystemErrorLogEntry } from '../../services/error-log.service';

export interface RecentErrorsArgs {
  limit?: number;
}

export interface RecentErrorsData {
  count: number;
  totalBuffered: number;
  errors: SystemErrorLogEntry[];
}

export const recentErrorsTool: InternalToolDefinition<RecentErrorsArgs, RecentErrorsData> = {
  name: 'recent_errors',
  displayName: 'Recent Operational Error Logs',
  description:
    'Returns the latest operational server errors and warnings captured from chat, AI providers, memory storage, web search, and Supabase. Use this tool when the owner asks "any bugs?", "show errors", "check error logs", "what went wrong recently?", or inquires about backend failures.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 4000,
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of recent error records to retrieve (default: 15, max: 50).',
        default: 15,
      },
    },
    additionalProperties: false,
  },
  isAvailable: (context?: InternalToolContext): boolean => {
    return Boolean(context?.isOwner);
  },
  execute: async (
    args: RecentErrorsArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<RecentErrorsData>> => {
    const startTime = Date.now();

    // Guard: Only authorized owner can execute this tool
    if (!context?.isOwner) {
      return {
        success: false,
        toolName: 'recent_errors',
        error: 'Access denied: The recent_errors tool is strictly restricted to the verified system owner (matching OWNER_ACCESS_KEY).',
        executionTimeMs: Date.now() - startTime,
      };
    }

    context.onStatusUpdate?.('Reading error logs…');

    const requestedLimit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : 15;
    const errors = await ErrorLogService.getRecentErrors(requestedLimit);

    return {
      success: true,
      toolName: 'recent_errors',
      data: {
        count: errors.length,
        totalBuffered: ErrorLogService.getBufferCount(),
        errors,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
