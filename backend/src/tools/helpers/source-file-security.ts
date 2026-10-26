import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(process.cwd());

// Disallowed segments anywhere in the path
const BLOCKED_SEGMENTS = [
  'node_modules',
  'dist',
  '.git',
  '.aistudio',
  '.cache',
  '.npm',
];

// Disallowed filename patterns (even if located in allowed folders)
const BLOCKED_FILE_PATTERNS = [
  /^\.env/i,
  /\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.cert$/i,
  /\.pfx$/i,
  /\.id_rsa/i,
];

// Allowed directory prefixes
const ALLOWED_DIR_PREFIXES = [
  'src/',
  'backend/',
  'ai/',
  'shared/',
  'scripts/',
  '.github/workflows/',
];

// Allowed individual files at root or specific paths
const ALLOWED_EXACT_FILES = new Set([
  'package.json',
  'render.yaml',
  'vite.config.ts',
  'vite.config.js',
  'schema.sql',
]);

/**
 * Validates whether a file or directory path is permitted for owner inspection.
 */
export function isPathAllowed(requestedPath: string): { allowed: boolean; reason?: string; relativePath: string } {
  if (!requestedPath || typeof requestedPath !== 'string') {
    return { allowed: false, reason: 'Path is required', relativePath: '' };
  }

  // Normalize separators and strip leading slashes
  const cleanInput = requestedPath.replace(/\\/g, '/').trim();
  const withoutLeadingSlash = cleanInput.replace(/^\/+/, '');

  // Guard against path traversal tricks
  const resolved = path.resolve(REPO_ROOT, withoutLeadingSlash);
  if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
    return {
      allowed: false,
      reason: 'Path traversal forbidden: target resolves outside the repository.',
      relativePath: withoutLeadingSlash,
    };
  }

  const relative = path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');

  // Check blocked segments
  const segments = relative.split('/');
  for (const seg of segments) {
    if (BLOCKED_SEGMENTS.includes(seg)) {
      return {
        allowed: false,
        reason: `Access denied: directory segment "${seg}" is strictly forbidden.`,
        relativePath: relative,
      };
    }
  }

  // Check blocked filename patterns (e.g. .env files)
  const baseName = path.basename(resolved);
  for (const pat of BLOCKED_FILE_PATTERNS) {
    if (pat.test(baseName)) {
      return {
        allowed: false,
        reason: `Access denied: file "${baseName}" is blocked for security.`,
        relativePath: relative,
      };
    }
  }

  // If pointing to the repo root itself (allowed for list_source_files)
  if (relative === '' || relative === '.') {
    return { allowed: true, relativePath: '' };
  }

  // Check allowed exact files
  if (ALLOWED_EXACT_FILES.has(relative)) {
    return { allowed: true, relativePath: relative };
  }

  // Check allowed SQL schema files
  if (relative.endsWith('.sql') && (relative.startsWith('backend/') || relative === 'schema.sql')) {
    return { allowed: true, relativePath: relative };
  }

  // Check allowed directory prefixes
  const normalizedWithSlash = relative.endsWith('/') ? relative : `${relative}/`;
  const isPrefixMatch = ALLOWED_DIR_PREFIXES.some(
    (prefix) => normalizedWithSlash.startsWith(prefix) || prefix.startsWith(normalizedWithSlash)
  );

  if (isPrefixMatch) {
    return { allowed: true, relativePath: relative };
  }

  return {
    allowed: false,
    reason: `Access denied: path "${relative}" is not within allowed scopes (src, backend, ai, shared, scripts, database SQL, package.json, render.yaml, vite config, .github/workflows).`,
    relativePath: relative,
  };
}

/**
 * Resolves a requested path against the repository root if permitted.
 */
export function resolveRepoPath(requestedPath: string): { absolutePath: string; relativePath: string } | null {
  const check = isPathAllowed(requestedPath);
  if (!check.allowed) {
    return null;
  }
  const absolutePath = path.resolve(REPO_ROOT, check.relativePath);
  return { absolutePath, relativePath: check.relativePath };
}

/**
 * Redacts secrets, tokens, API keys, and long random credential strings from code.
 */
export function redactSourceSecrets(content: string): string {
  if (!content || typeof content !== 'string') return '';

  let text = content;

  // 1. Explicit key-value assignments (e.g. KEY=xyz, SECRET=xyz, TOKEN=xyz, PASSWORD=xyz)
  text = text.replace(
    /(KEY|SECRET|TOKEN|PASSWORD|AUTH|CREDENTIAL|PRIVATE_KEY)\s*([:=])\s*(['"]?)([^\s"',;\n\r]{6,})\3/gi,
    '$1$2$3[REDACTED_SECRET]$3'
  );

  // 2. Object property secret assignments: (e.g. apiKey: '...', secret: '...', token: '...')
  text = text.replace(
    /((?:api_?key|apiKey|clientSecret|secretKey|serviceRole|supabaseKey|authHeader|accessToken|refreshToken)\s*[:=]\s*['"])([^'"]{6,})(['"])/gi,
    '$1[REDACTED_SECRET]$3'
  );

  // 3. Known vendor token formats
  text = text.replace(/\bsk-[a-zA-Z0-9_\-]{20,}\b/g, '[REDACTED_API_KEY]');
  text = text.replace(/\bAIza[0-9A-Za-z-_]{35}\b/g, '[REDACTED_GOOGLE_KEY]');
  text = text.replace(/\bgsk_[a-zA-Z0-9]{20,}\b/g, '[REDACTED_GROQ_KEY]');
  text = text.replace(/\bghp_[a-zA-Z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]');
  text = text.replace(/\bBearer\s+[a-zA-Z0-9_\-\.]{16,}\b/gi, 'Bearer [REDACTED_TOKEN]');

  // 4. JWT tokens
  text = text.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[REDACTED_JWT]');

  // 5. Private key blocks
  text = text.replace(
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----'
  );

  // 6. Long high-entropy random strings (40+ hex/base64 characters in quotes)
  text = text.replace(
    /(['"])([0-9a-fA-F]{40,}|[0-9a-zA-Z+/=]{48,})\1/g,
    '$1[REDACTED_CREDENTIAL_HASH]$1'
  );

  return text;
}

/**
 * Recursively scans allowed directories and returns a sorted list of relative file paths.
 */
export async function listAllowedRepoFiles(subDir?: string): Promise<string[]> {
  const targetDir = subDir ? subDir.trim().replace(/^\/+/, '') : '';
  const validation = isPathAllowed(targetDir || '.');
  if (!validation.allowed && targetDir !== '') {
    throw new Error(validation.reason || `Path "${targetDir}" is not allowed.`);
  }

  const results: string[] = [];

  async function walk(currentAbs: string, currentRel: string): Promise<void> {
    if (!fs.existsSync(currentAbs)) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      const entryAbs = path.resolve(currentAbs, entry.name);

      if (entry.isDirectory()) {
        const check = isPathAllowed(entryRel);
        if (check.allowed) {
          await walk(entryAbs, entryRel);
        }
      } else if (entry.isFile()) {
        const check = isPathAllowed(entryRel);
        if (check.allowed) {
          results.push(check.relativePath);
        }
      }
    }
  }

  if (targetDir) {
    const targetAbs = path.resolve(REPO_ROOT, targetDir);
    const stat = await fs.promises.stat(targetAbs).catch(() => null);
    if (stat && stat.isDirectory()) {
      await walk(targetAbs, targetDir);
    } else if (stat && stat.isFile()) {
      results.push(targetDir);
    }
  } else {
    // Scan root exact files first
    for (const f of ALLOWED_EXACT_FILES) {
      if (fs.existsSync(path.resolve(REPO_ROOT, f))) {
        results.push(f);
      }
    }
    // Scan allowed root folders
    for (const prefix of ALLOWED_DIR_PREFIXES) {
      const folder = prefix.replace(/\/+$/, '');
      const folderAbs = path.resolve(REPO_ROOT, folder);
      if (fs.existsSync(folderAbs)) {
        await walk(folderAbs, folder);
      }
    }
  }

  return results.sort();
}
