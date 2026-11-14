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
  description: 'Retrieve the latest operational server errors and warnings logged by backend services.',
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
  isAvailable: (): boolean => true,
  execute: async (
    args: RecentErrorsArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<RecentErrorsData>> => {
    const startTime = Date.now();

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
