import {
  InternalToolDefinition,
  InternalToolContext,
  ToolExecutionResult,
  ToolInputSchema,
} from '../../../shared/types/tools';
import { AIActivityStatus } from '../../../shared/types/chat';

export interface ExecuteToolOptions {
  onStatusUpdate?: (status: AIActivityStatus, details?: any) => void;
  maxRetries?: number;
}

export class ToolExecutor {
  /**
   * Validate arguments against a tool's JSON schema properties
   */
  public static validateArguments(schema: ToolInputSchema, args: Record<string, any>): { valid: boolean; error?: string } {
    if (!args || typeof args !== 'object') {
      return { valid: false, error: 'Arguments must be an object.' };
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const reqField of schema.required) {
        if (args[reqField] === undefined || args[reqField] === null || args[reqField] === '') {
          return { valid: false, error: `Missing required argument: "${reqField}".` };
        }
      }
    }

    // Check property types
    for (const [key, val] of Object.entries(args)) {
      const propDef = schema.properties?.[key];
      if (!propDef) {
        if (schema.additionalProperties === false) {
          return { valid: false, error: `Unexpected argument: "${key}".` };
        }
        continue;
      }

      if (val !== undefined && val !== null) {
        const valType = Array.isArray(val) ? 'array' : typeof val;
        if (propDef.type === 'number' && typeof val === 'number' && !isNaN(val)) {
          // valid
        } else if (propDef.type === 'string' && typeof val === 'string') {
          // valid
        } else if (propDef.type === 'boolean' && typeof val === 'boolean') {
          // valid
        } else if (propDef.type === 'object' && valType === 'object') {
          // valid
        } else if (propDef.type === 'array' && valType === 'array') {
          // valid
        } else {
          return {
            valid: false,
            error: `Argument "${key}" must be of type ${propDef.type}, got ${valType}.`,
          };
        }

        // Enum check
        if (propDef.enum && !propDef.enum.includes(val)) {
          return {
            valid: false,
            error: `Argument "${key}" must be one of: ${propDef.enum.join(', ')}.`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Safely sanitize output to guarantee secrets, bearer tokens, or keys never leak
   */
  public static sanitizeResult<T>(data: T): T {
    if (!data) return data;
    try {
      let str = typeof data === 'string' ? data : JSON.stringify(data);
      // Strip potential API keys or tokens (sk-..., ghp_..., eyJ...)
      str = str
        .replace(/sk[-_][a-zA-Z0-9_-]{20,}/gi, '[REDACTED_API_KEY]')
        .replace(/ghp_[a-zA-Z0-9]{20,}/gi, '[REDACTED_TOKEN]')
        .replace(/Bearer\s+[a-zA-Z0-9_.\-~+/=]+/gi, 'Bearer [REDACTED]')
        .replace(/eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}/gi, '[REDACTED_JWT]');
      return typeof data === 'string' ? (str as any) : JSON.parse(str);
    } catch {
      return data;
    }
  }

  /**
   * Safely execute an internal tool with argument validation, timeout enforcement, retries, and status updates
   */
  public static async executeTool<TArgs = any, TResult = any>(
    tool: InternalToolDefinition<TArgs, TResult>,
    args: TArgs,
    context: InternalToolContext,
    options: ExecuteToolOptions = {}
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = Date.now();

    // 1. Argument validation against input schema
    const validation = this.validateArguments(tool.inputSchema, args as any);
    if (!validation.valid) {
      options.onStatusUpdate?.('Tool failed', { error: validation.error });
      return {
        success: false,
        toolName: tool.name,
        error: `Invalid tool arguments for "${tool.name}": ${validation.error}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 2. Availability check
    try {
      const isAvailable = await tool.isAvailable(context);
      if (!isAvailable) {
        options.onStatusUpdate?.('Tool failed', {
          error: `Tool "${tool.displayName || tool.name}" is not currently available in this environment.`,
        });
        return {
          success: false,
          toolName: tool.name,
          error: `Tool "${tool.name}" is not available in the current environment (e.g. TAVILY_API_KEY or service unconfigured).`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    } catch (availErr: any) {
      return {
        success: false,
        toolName: tool.name,
        error: `Failed checking tool availability: ${availErr.message}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 3. Permission & Safety enforcement
    if (tool.permissionLevel === 'destructive' || tool.permissionLevel === 'sensitive') {
      // Require authenticated user context for sensitive or destructive operations
      if (!context.userId) {
        options.onStatusUpdate?.('Tool failed', { error: 'Authentication required' });
        return {
          success: false,
          toolName: tool.name,
          error: `Unauthorized: tool "${tool.name}" requires an authenticated user session.`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    // 4. Status update: Inform UI of tool execution
    if (tool.name === 'web_search') {
      options.onStatusUpdate?.('Using web research...', { query: (args as any)?.query });
    } else if (tool.name === 'memory_search') {
      options.onStatusUpdate?.('Checking memories...', { query: (args as any)?.query });
    } else {
      options.onStatusUpdate?.('Selecting tool...', { tool: tool.displayName || tool.name });
    }

    // 5. Execution with timeout and retry limit
    const maxRetries = tool.permissionLevel === 'read_only' ? (options.maxRetries ?? 1) : 0;
    let lastError: Error | null = null;
    const timeoutDuration = tool.timeoutMs || 8000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutDuration);

      try {
        const executionPromise = tool.execute(args, {
          ...context,
          signal: abortController.signal,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error(`Tool "${tool.name}" timed out after ${timeoutDuration}ms.`));
          });
        });

        const result = await Promise.race([executionPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        if (result.success) {
          options.onStatusUpdate?.('Verifying results...', { tool: tool.name });
          return {
            ...result,
            data: this.sanitizeResult(result.data),
            executionTimeMs: Date.now() - startTime,
          };
        } else {
          lastError = new Error(result.error || `Tool "${tool.name}" failed to execute.`);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        // Do not retry on explicit timeout or client abort
        if (err.name === 'AbortError' || err.message?.includes('timed out')) {
          break;
        }
      }
    }

    // If loop finishes without returning, report failure
    const errorMsg = lastError?.message || `Execution of tool "${tool.name}" failed.`;
    options.onStatusUpdate?.('Tool failed', { error: errorMsg, tool: tool.name });

    return {
      success: false,
      toolName: tool.name,
      error: errorMsg,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
