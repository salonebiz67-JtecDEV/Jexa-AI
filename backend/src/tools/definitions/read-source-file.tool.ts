import fs from 'fs';
import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { validateSourcePath, redactSecrets } from '../code-security';

export interface ReadSourceFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadSourceFileData {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  truncated: boolean;
  truncatedReason?: string;
}

const MAX_LINES_PER_CALL = 300;
const MAX_BYTES_PER_CALL = 20 * 1024; // 20 KB

export const readSourceFileTool: InternalToolDefinition<ReadSourceFileArgs, ReadSourceFileData> = {
  name: 'read_source_file',
  displayName: 'Read Source File (Owner Only)',
  description:
    'Reads the contents of a source file on the server disk within allowed repository folders (src, backend, ai, shared, scripts, database SQL, package.json, render.yaml, vite config, .github/workflows). Max 300 lines and 20 KB per call. Automatically redacts all secrets, API keys, and sensitive tokens. Restricted strictly to the verified owner.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the source file to read (e.g. "backend/src/services/chat.service.ts").',
      },
      startLine: {
        type: 'number',
        description: 'Optional 1-indexed start line number (defaults to 1).',
      },
      endLine: {
        type: 'number',
        description: 'Optional 1-indexed end line number (max 300 lines per call).',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  isAvailable: (context?: InternalToolContext): boolean => {
    return Boolean(context?.isOwner);
  },
  execute: async (
    args: ReadSourceFileArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<ReadSourceFileData>> => {
    const startTime = Date.now();

    // Guard: owner only
    if (!context?.isOwner) {
      return {
        success: false,
        toolName: 'read_source_file',
        error: 'Access denied: read_source_file is strictly restricted to the verified system owner (matching OWNER_ACCESS_KEY).',
        executionTimeMs: Date.now() - startTime,
      };
    }

    context.onStatusUpdate?.('Reading source code…');

    const filePath = (args.path || '').trim();
    if (!filePath) {
      return {
        success: false,
        toolName: 'read_source_file',
        error: 'A non-empty file path is required.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Security path validation
    const validation = validateSourcePath(filePath, false);
    if (!validation.allowed || !validation.resolvedPath) {
      return {
        success: false,
        toolName: 'read_source_file',
        error: validation.reason || 'File path is not allowed.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const resolved = validation.resolvedPath;
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        toolName: 'read_source_file',
        error: `File not found: "${validation.relativePath}"`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    let rawContent: string;
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return {
          success: false,
          toolName: 'read_source_file',
          error: `Target path "${validation.relativePath}" is a directory. Use list_source_files instead.`,
          executionTimeMs: Date.now() - startTime,
        };
      }
      rawContent = fs.readFileSync(resolved, 'utf8');
    } catch (err: any) {
      return {
        success: false,
        toolName: 'read_source_file',
        error: `Failed to read file: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const allLines = rawContent.split(/\r?\n/);
    const totalLines = allLines.length;

    let start = Math.max(1, Math.floor(Number(args.startLine) || 1));
    if (start > totalLines) {
      start = totalLines;
    }

    let end = args.endLine ? Math.floor(Number(args.endLine)) : start + MAX_LINES_PER_CALL - 1;
    if (end < start) {
      end = start;
    }

    let truncated = false;
    let truncatedReason: string | undefined;

    // Line count restriction: max 300 lines
    if (end - start + 1 > MAX_LINES_PER_CALL) {
      end = start + MAX_LINES_PER_CALL - 1;
      truncated = true;
      truncatedReason = `Truncated to ${MAX_LINES_PER_CALL} lines per call limit.`;
    }
    if (end > totalLines) {
      end = totalLines;
    }

    // Extract requested lines (0-indexed slice)
    const selectedLines = allLines.slice(start - 1, end);
    let outputText = selectedLines.join('\n');

    // Redact all secrets and credentials
    outputText = redactSecrets(outputText);

    // Byte size restriction: max 20 KB
    const byteLength = Buffer.byteLength(outputText, 'utf8');
    if (byteLength > MAX_BYTES_PER_CALL) {
      // Truncate to 20 KB
      const buf = Buffer.from(outputText, 'utf8').subarray(0, MAX_BYTES_PER_CALL);
      outputText = buf.toString('utf8') + '\n... [truncated: file chunk exceeded 20 KB limit]';
      truncated = true;
      truncatedReason = (truncatedReason ? `${truncatedReason} ` : '') + 'Truncated to 20 KB per call limit.';
    }

    return {
      success: true,
      toolName: 'read_source_file',
      data: {
        path: validation.relativePath || filePath,
        startLine: start,
        endLine: end,
        totalLines,
        content: outputText,
        truncated,
        truncatedReason,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
