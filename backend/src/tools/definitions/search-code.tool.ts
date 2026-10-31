import fs from 'fs';
import path from 'path';
import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { validateSourcePath, redactSecrets } from '../code-security';

export interface SearchCodeArgs {
  query: string;
  directory?: string;
  fileExtension?: string;
  maxResults?: number;
}

export interface CodeMatchItem {
  file: string;
  line: number;
  content: string;
}

export interface SearchCodeData {
  query: string;
  totalMatches: number;
  matches: CodeMatchItem[];
  searchedFilesCount: number;
  truncated: boolean;
}

const MAX_SEARCH_RESULTS = 30;

// Binary and non-code file extensions to skip during text search
const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.mp3', '.wav', '.ogg', '.m4a',
  '.mp4', '.webm',
  '.zip', '.tar', '.gz',
  '.woff', '.woff2', '.ttf', '.eot',
  '.map', '.lock',
]);

export const searchCodeTool: InternalToolDefinition<SearchCodeArgs, SearchCodeData> = {
  name: 'search_code',
  displayName: 'Search Code (Owner Only)',
  description: 'Search for text or patterns in permitted repository source files with automatic secret redaction.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 20000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text query to search for across the codebase.',
      },
      directory: {
        type: 'string',
        description: 'Optional subfolder to constrain the search (e.g. "backend/src/services", "ai/brain", "src").',
      },
      fileExtension: {
        type: 'string',
        description: 'Optional file extension filter (e.g. ".ts", ".tsx", ".sql").',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matching lines to return (defaults to 20, max 30).',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  isAvailable: (context?: InternalToolContext): boolean => {
    return Boolean(context?.isOwner);
  },
  execute: async (
    args: SearchCodeArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<SearchCodeData>> => {
    const startTime = Date.now();

    // Guard: owner only
    if (!context?.isOwner) {
      return {
        success: false,
        toolName: 'search_code',
        error: 'Access denied: search_code is strictly restricted to the verified system owner (matching OWNER_ACCESS_KEY).',
        executionTimeMs: Date.now() - startTime,
      };
    }

    context.onStatusUpdate?.('Searching code…');

    const rawQuery = (args.query || '').trim();
    if (!rawQuery) {
      return {
        success: false,
        toolName: 'search_code',
        error: 'A non-empty search query is required.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const maxResults = Math.min(Math.max(Number(args.maxResults) || 20, 1), MAX_SEARCH_RESULTS);
    const targetDir = (args.directory || '').trim();
    const filterExt = (args.fileExtension || '').trim().toLowerCase();

    // Validate search root directory
    const validation = validateSourcePath(targetDir, true);
    if (!validation.allowed || !validation.resolvedPath) {
      return {
        success: false,
        toolName: 'search_code',
        error: validation.reason || 'Requested directory is not allowed.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const rootDir = process.cwd();
    const searchRoot = validation.resolvedPath;

    if (!fs.existsSync(searchRoot)) {
      return {
        success: false,
        toolName: 'search_code',
        error: `Directory not found: "${validation.relativePath || targetDir}"`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const matches: CodeMatchItem[] = [];
    let searchedFilesCount = 0;
    let truncated = false;

    const lowerQuery = rawQuery.toLowerCase();

    const searchDirectory = (dir: string) => {
      if (matches.length >= maxResults) {
        truncated = true;
        return;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }

        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        // Check if allowed
        const check = validateSourcePath(rel, false);
        if (!check.allowed) {
          continue;
        }

        if (entry.isDirectory()) {
          searchDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IGNORED_EXTENSIONS.has(ext)) {
            continue;
          }
          if (filterExt && !ext.endsWith(filterExt) && ext !== filterExt) {
            continue;
          }

          searchedFilesCount++;

          try {
            // Read file in chunks or lines
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes(lowerQuery)) {
              const lines = content.split(/\r?\n/);
              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                if (matches.length >= maxResults) {
                  truncated = true;
                  break;
                }

                const lineText = lines[lineIdx];
                if (lineText.toLowerCase().includes(lowerQuery)) {
                  // Redact secrets in the matching line
                  const redactedLine = redactSecrets(lineText.trim());
                  matches.push({
                    file: rel,
                    line: lineIdx + 1,
                    content: redactedLine.slice(0, 300), // clamp line length
                  });
                }
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    try {
      const stat = fs.statSync(searchRoot);
      if (stat.isFile()) {
        searchedFilesCount = 1;
        const content = fs.readFileSync(searchRoot, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          if (matches.length >= maxResults) {
            truncated = true;
            break;
          }
          const lineText = lines[lineIdx];
          if (lineText.toLowerCase().includes(lowerQuery)) {
            matches.push({
              file: validation.relativePath || targetDir,
              line: lineIdx + 1,
              content: redactSecrets(lineText.trim()).slice(0, 300),
            });
          }
        }
      } else {
        searchDirectory(searchRoot);
      }
    } catch (err: any) {
      return {
        success: false,
        toolName: 'search_code',
        error: `Failed to search codebase: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      toolName: 'search_code',
      data: {
        query: rawQuery,
        totalMatches: matches.length,
        matches,
        searchedFilesCount,
        truncated,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
