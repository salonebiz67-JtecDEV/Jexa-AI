import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';

export interface SystemTimeToolArgs {
  timezone?: string;
}

export interface SystemTimeToolData {
  iso: string;
  date: string;
  time: string;
  dayOfWeek: string;
  timezone: string;
  year: number;
}

export const systemTimeTool: InternalToolDefinition<SystemTimeToolArgs, SystemTimeToolData> = {
  name: 'system_time',
  displayName: 'Current Time & Temporal Grounding',
  description: 'Get the current date, time, day of the week, year, and timezone.',
  category: 'system',
  permissionLevel: 'read_only',
  timeoutMs: 1500,
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional IANA timezone string (e.g. "Africa/Freetown", "UTC", "America/New_York").',
      },
    },
    additionalProperties: false,
  },
  isAvailable: (_context?: InternalToolContext): boolean => {
    return true;
  },
  execute: async (
    args: SystemTimeToolArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<SystemTimeToolData>> => {
    const startTime = Date.now();
    const now = new Date();

    const targetTimezone = args.timezone || context.userContext?.timezone || 'UTC';

    let dateStr = '';
    let timeStr = '';
    let dayOfWeek = '';

    try {
      dateStr = now.toLocaleDateString('en-US', {
        timeZone: targetTimezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      timeStr = now.toLocaleTimeString('en-US', {
        timeZone: targetTimezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      dayOfWeek = now.toLocaleDateString('en-US', {
        timeZone: targetTimezone,
        weekday: 'long',
      });
    } catch {
      // Fallback to UTC if timezone is invalid
      dateStr = now.toUTCString();
      timeStr = now.toISOString().slice(11, 19);
      dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()];
    }

    return {
      success: true,
      toolName: 'system_time',
      data: {
        iso: now.toISOString(),
        date: dateStr,
        time: timeStr,
        dayOfWeek,
        timezone: targetTimezone,
        year: now.getUTCFullYear(),
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
