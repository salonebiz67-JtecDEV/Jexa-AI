import crypto from 'node:crypto';

export interface SystemErrorLogEntry {
  id: string;
  source: 'chat' | 'ai_provider' | 'web_search' | 'system' | string;
  message: string;
  details?: Record<string, any>;
  created_at: string;
}

export class ErrorLogService {
  private static readonly MAX_BUFFER_SIZE = 100;
  private static buffer: SystemErrorLogEntry[] = [];

  /**
   * Cleans sensitive secret tokens, API keys, passwords, and connection strings
   * from log messages and metadata payloads.
   */
  public static scrubSecrets(text: string): string {
    if (!text || typeof text !== 'string') return '';

    let sanitized = text;

    // 1. Scrub bearer authorization tokens
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');

    // 2. Scrub OpenAI / Groq / general API keys starting with sk- or gsk_
    sanitized = sanitized.replace(/gsk_[A-Za-z0-9_\-]{16,}/gi, 'gsk_[REDACTED_GROQ_KEY]');
    sanitized = sanitized.replace(/sk-[A-Za-z0-9_\-]{16,}/gi, 'sk-[REDACTED_API_KEY]');

    // 3. Scrub Google Gemini API keys (AIza...)
    sanitized = sanitized.replace(/AIza[0-9A-Za-z\-_]{35}/g, 'AIza[REDACTED_GEMINI_KEY]');

    // 4. Scrub GitHub personal access tokens
    sanitized = sanitized.replace(/ghp_[0-9a-zA-Z]{36}/g, 'ghp_[REDACTED_GITHUB_KEY]');

    // 5. Scrub Supabase JWTs
    sanitized = sanitized.replace(/eyJhbGciOi[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[REDACTED_JWT]');

    // 6. Scrub database connection URLs (e.g. postgresql://user:pass@host)
    sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)([^@\s]+)(@[^/\s]+)/gi, '$1[REDACTED_PASSWORD]$3');

    // 7. Scrub explicit password/secret/api_key key-value patterns
    sanitized = sanitized.replace(/(?:password|secret|apiKey|api_key|token|access_key|master_key)\s*[:=]\s*["']?([^"',\s]+)["']?/gi, (match, val) => {
      return match.replace(val, '[REDACTED]');
    });

    // 8. Mask any known runtime environment secrets if they appear literally
    const sensitiveEnvKeys = [
      'GEMINI_API_KEY',
      'AI_API_KEY',
      'VOICE_AI_API_KEY',
      'TAVILY_API_KEY',
      'LITELLM_BASE_URL',
      'LITELLM_MASTER_KEY',
      'LITELLM_API_KEY',
      'GROQ_API_KEY',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'OWNER_EMAIL',
      'OWNER_USER_ID',
    ];
    for (const envKey of sensitiveEnvKeys) {
      const val = process.env[envKey]?.trim();
      if (val && val.length >= 6) {
        sanitized = sanitized.split(val).join(`[REDACTED_${envKey}]`);
      }
    }

    return sanitized;
  }

  /**
   * Recursively sanitizes objects and details records to ensure no secrets enter logs
   */
  public static scrubObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.scrubSecrets(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.scrubObject(item));
    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (/^(?:password|secret|key|token|authorization|auth|owner_?key)$/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.scrubObject(val);
        }
      }
      return sanitized;
    }
    return String(obj);
  }

  /**
   * Captures an error or warning into the in-memory circular buffer.
   */
  public static log(
    source: 'chat' | 'ai_provider' | 'web_search' | 'system' | string,
    message: string | Error,
    details?: Record<string, any>
  ): SystemErrorLogEntry {
    const rawMessage = message instanceof Error ? (message.stack || message.message) : String(message);
    const cleanMessage = this.scrubSecrets(rawMessage);
    const cleanDetails = details ? this.scrubObject(details) : {};

    const entry: SystemErrorLogEntry = {
      id: crypto.randomUUID(),
      source,
      message: cleanMessage,
      details: cleanDetails,
      created_at: new Date().toISOString(),
    };

    // Maintain in-memory buffer capped at MAX_BUFFER_SIZE entries
    this.buffer.unshift(entry);
    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.buffer.length = this.MAX_BUFFER_SIZE;
    }

    return entry;
  }

  /**
   * Retrieves the latest entries from the in-memory buffer
   */
  public static async getRecentErrors(limit = 20): Promise<SystemErrorLogEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    return this.buffer.slice(0, safeLimit);
  }

  /**
   * Returns current count of buffered errors
   */
  public static getBufferCount(): number {
    return this.buffer.length;
  }

  /**
   * Clear buffer (primarily for unit tests)
   */
  public static clearBuffer(): void {
    this.buffer = [];
  }
}
