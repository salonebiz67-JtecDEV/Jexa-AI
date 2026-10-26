import path from 'path';

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  resolvedPath?: string;
  relativePath?: string;
}

/**
 * Validates that a requested file or directory path is strictly within the allowed
 * repository boundaries and not in any forbidden or sensitive directories.
 *
 * Allowed: src, backend, ai, shared, scripts, database SQL, package.json, render.yaml, vite config, .github/workflows
 * Blocked: .env files, .git, node_modules, dist, and any path outside the repo (including ../ tricks).
 */
export function validateSourcePath(inputPath: string, allowRoot: boolean = false): PathValidationResult {
  const rootDir = process.cwd();
  const cleaned = (inputPath || '').trim();

  // Guard against null-byte or obvious traversal tokens
  if (cleaned.includes('\0') || cleaned.includes('..')) {
    return {
      allowed: false,
      reason: 'Path traversal ("..") is strictly forbidden.',
    };
  }

  // Resolve absolute path from repo root
  const resolved = path.isAbsolute(cleaned)
    ? path.normalize(cleaned)
    : path.resolve(rootDir, cleaned);

  // Ensure resolved path is strictly inside rootDir
  const rel = path.relative(rootDir, resolved).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      allowed: false,
      reason: 'Path is outside of repository root.',
    };
  }

  if (rel === '' || rel === '.') {
    if (allowRoot) {
      return { allowed: true, resolvedPath: rootDir, relativePath: '' };
    }
    return {
      allowed: false,
      reason: 'Root directory access is restricted for file reading. Specify an allowed file or subfolder.',
    };
  }

  // Block forbidden directory and file names across all segments
  const segments = rel.split('/');
  for (const seg of segments) {
    if (seg === '.git' || seg === 'node_modules' || seg === 'dist') {
      return {
        allowed: false,
        reason: `Access to "${seg}" is strictly forbidden.`,
      };
    }
    if (seg.startsWith('.env')) {
      return {
        allowed: false,
        reason: 'Access to .env files and server secrets is strictly blocked.',
      };
    }
  }

  // Check allowed whitelist
  const isAllowed =
    rel === 'package.json' ||
    rel === 'render.yaml' ||
    rel === 'vite.config.ts' ||
    rel === 'vite.config.js' ||
    rel.startsWith('vite.config.') ||
    rel === 'src' ||
    rel.startsWith('src/') ||
    rel === 'backend' ||
    rel.startsWith('backend/') ||
    rel === 'ai' ||
    rel.startsWith('ai/') ||
    rel === 'shared' ||
    rel.startsWith('shared/') ||
    rel === 'scripts' ||
    rel.startsWith('scripts/') ||
    rel === '.github' ||
    rel === '.github/workflows' ||
    rel.startsWith('.github/workflows/') ||
    rel.endsWith('.sql');

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Path "${rel}" is not within allowed source folders (src, backend, ai, shared, scripts, database SQL, package.json, render.yaml, vite config, .github/workflows).`,
    };
  }

  return {
    allowed: true,
    resolvedPath: resolved,
    relativePath: rel,
  };
}

/**
 * Redacts secrets, credentials, tokens, and sensitive strings from source code output.
 */
export function redactSecrets(content: string): string {
  if (!content || typeof content !== 'string') return '';

  let out = content;

  // 1. Redact values following any variable/key containing KEY, SECRET, TOKEN, PASSWORD, PASS, CREDENTIALS
  // e.g. GEMINI_API_KEY="...", OWNER_ACCESS_KEY: '...', password: "..."
  out = out.replace(
    /([A-Za-z0-9_-]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIALS?)[A-Za-z0-9_-]*\s*[:=]\s*)(['"][^'"]+['"]|[^\s,;}\]\n\r]+)/gi,
    '$1"[REDACTED_SECRET]"'
  );

  // 2. Specific API key patterns
  // Google / Gemini API keys: AIza...
  out = out.replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, '[REDACTED_GEMINI_KEY]');
  // Groq API keys: gsk_...
  out = out.replace(/\bgsk_[a-zA-Z0-9]{15,}\b/g, '[REDACTED_GROQ_KEY]');
  // OpenAI / generic sk- keys
  out = out.replace(/\bsk-[a-zA-Z0-9_\-]{15,}\b/g, '[REDACTED_API_KEY]');
  // Tavily search keys
  out = out.replace(/\btvly-[a-zA-Z0-9_\-]{15,}\b/g, '[REDACTED_TAVILY_KEY]');
  // GitHub Personal Access Tokens
  out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]');
  // JWT tokens (Header.Payload.Signature)
  out = out.replace(/\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT_TOKEN]');

  // 3. Bearer authorization tokens
  out = out.replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{10,}/gi, '$1[REDACTED_TOKEN]');

  // 4. Database URIs with embedded passwords (e.g. postgresql://user:password@host...)
  out = out.replace(
    /((?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:)([^@\s]+)(@)/gi,
    '$1[REDACTED_PASSWORD]$3'
  );

  // 5. Private Key PEM blocks
  out = out.replace(
    /-----BEGIN [A-Z\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+ PRIVATE KEY-----/g,
    '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----'
  );

  // 6. Long continuous hex/base64 strings (32 to 64 chars) assigned inside quotes
  out = out.replace(
    /(?<=['"])[0-9a-fA-F]{32,64}(?=['"])/g,
    '[REDACTED_HEX_KEY]'
  );

  return out;
}
