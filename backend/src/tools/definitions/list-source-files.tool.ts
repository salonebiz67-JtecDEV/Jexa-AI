import fs from 'fs';
import path from 'path';
import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { validateSourcePath } from '../code-security';

export interface ListSourceFilesArgs {
  directory?: string;
  recursive?: boolean;
  maxFiles?: number;
}

export interface SourceFileInfo {
  path: string;
  sizeBytes: number;
  linesEstimate?: number;
}

export interface ListSourceFilesData {
  directory: string;
  totalFiles: number;
  files: SourceFileInfo[];
  truncated?: boolean;
}

export const listSourceFilesTool: InternalToolDefinition<ListSourceFilesArgs, ListSourceFilesData> = {
  name: 'list_source_files',
  displayName: 'List Source Files (Owner Only)',
  description: 'List source files on the server disk within allowed repository folders.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: 'Directory path to list (e.g. "src", "backend/src/services", "ai", or empty for allowed root files).',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list subdirectories recursively (defaults to true).',
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of files to return (defaults to 100, max 200).',
      },
    },
    additionalProperties: false,
  },
  isAvailable: (context?: InternalToolContext): boolean => {
    return Boolean(context?.isOwner);
  },
  execute: async (
    args: ListSourceFilesArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<ListSourceFilesData>> => {
    const startTime = Date.now();

    // Guard: strictly restricted to owner
    if (!context?.isOwner) {
      return {
        success: false,
        toolName: 'list_source_files',
        error: 'Access denied: list_source_files is strictly restricted to the verified system owner (matching OWNER_ACCESS_KEY).',
        executionTimeMs: Date.now() - startTime,
      };
    }

    context.onStatusUpdate?.('Reading source code…');

    const targetDir = (args.directory || '').trim();
    const isRecursive = args.recursive !== false;
    const maxFiles = Math.min(Math.max(Number(args.maxFiles) || 100, 1), 200);

    // Validate path
    const validation = validateSourcePath(targetDir, true);
    if (!validation.allowed || !validation.resolvedPath) {
      return {
        success: false,
        toolName: 'list_source_files',
        error: validation.reason || 'Requested directory is not allowed.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const rootDir = process.cwd();
    const resolvedDir = validation.resolvedPath;

    if (!fs.existsSync(resolvedDir)) {
      return {
        success: false,
        toolName: 'list_source_files',
        error: `Directory does not exist: "${validation.relativePath || targetDir}"`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const files: SourceFileInfo[] = [];
    let truncated = false;

    const traverse = (currentPath: string) => {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (err: any) {
        console.warn(`[list_source_files] Error reading ${currentPath}:`, err.message);
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }

        const fullPath = path.join(currentPath, entry.name);
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        // Check if item is allowed
        const entryCheck = validateSourcePath(rel, false);
        if (!entryCheck.allowed) {
          continue;
        }

        if (entry.isDirectory()) {
          if (isRecursive) {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            files.push({
              path: rel,
              sizeBytes: stat.size,
            });
          } catch {
            files.push({
              path: rel,
              sizeBytes: 0,
            });
          }
        }
      }
    };

    try {
      const dirStat = fs.statSync(resolvedDir);
      if (dirStat.isFile()) {
        files.push({
          path: validation.relativePath || targetDir,
          sizeBytes: dirStat.size,
        });
      } else {
        traverse(resolvedDir);
      }
    } catch (err: any) {
      return {
        success: false,
        toolName: 'list_source_files',
        error: `Failed to inspect files: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      toolName: 'list_source_files',
      data: {
        directory: validation.relativePath || '(root)',
        totalFiles: files.length,
        files,
        truncated,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
