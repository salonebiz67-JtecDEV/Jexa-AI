import crypto from 'node:crypto';
import { ErrorLogService } from './error-log.service';
import { scrubSecretsAndUrls } from '../../../shared/types/provider';

export type SecurityAuditEventType =
  | 'owner_login_success'
  | 'user_login_success'
  | 'auth_login_failed'
  | 'owner_logout'
  | 'user_logout'
  | 'session_restored'
  | 'auth_refresh_failed'
  | 'unauthorized_admin_access'
  | 'provider_config_changed'
  | 'gateway_config_changed'
  | 'brain_profile_changed'
  | 'tool_toggled'
  | 'tool_tested'
  | 'provider_tested';

export type SecurityAuditSeverity = 'info' | 'warning' | 'critical';

export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  eventType: SecurityAuditEventType;
  severity: SecurityAuditSeverity;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  summary: string;
  details?: Record<string, any>;
}

export interface RecordSecurityAuditInput {
  eventType: SecurityAuditEventType;
  severity?: SecurityAuditSeverity;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  summary: string;
  details?: Record<string, any>;
}

const SECRET_FIELD_REGEX =
  /^(?:password|pass|secret|token|access_?token|refresh_?token|api_?key|apikey|authorization|auth|cookie|set-cookie|owner_?key|service_?role_?key|master_?key|private_?key)$/i;

function sanitizeAuditValue(value: any, depth = 0): any {
  if (depth > 4) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return scrubSecretsAndUrls(ErrorLogService.scrubSecrets(value)).slice(0, 400);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELD_REGEX.test(k)) {
        continue; // Omit secret fields entirely from audit logs
      }
      out[k] = sanitizeAuditValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

function maskEmailForAudit(email?: string): string | undefined {
  if (!email || typeof email !== 'string') return undefined;
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 1) return trimmed ? '***' : undefined;
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

export class SecurityAuditService {
  private static readonly MAX_ENTRIES = 500;
  private static entries: SecurityAuditEntry[] = [];

  public static record(input: RecordSecurityAuditInput): SecurityAuditEntry {
    const nowMs = Date.now();
    const cleanSummary = sanitizeAuditValue(input.summary) as string;
    const cleanDetails = input.details
      ? (sanitizeAuditValue(input.details) as Record<string, any>)
      : undefined;

    const entry: SecurityAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(nowMs).toISOString(),
      timestampMs: nowMs,
      eventType: input.eventType,
      severity: input.severity || 'info',
      actorUserId: input.actorUserId ? String(input.actorUserId).slice(0, 128) : undefined,
      actorEmail: maskEmailForAudit(input.actorEmail),
      actorRole: input.actorRole ? String(input.actorRole).slice(0, 32) : undefined,
      ip: input.ip ? String(input.ip).slice(0, 64) : undefined,
      method: input.method ? String(input.method).slice(0, 16) : undefined,
      path: input.path ? String(input.path).slice(0, 200) : undefined,
      statusCode: typeof input.statusCode === 'number' ? input.statusCode : undefined,
      summary: cleanSummary,
      ...(cleanDetails && Object.keys(cleanDetails).length > 0 ? { details: cleanDetails } : {}),
    };

    try {
      this.entries.unshift(entry);
      if (this.entries.length > this.MAX_ENTRIES) {
        this.entries.length = this.MAX_ENTRIES;
      }
    } catch {
      // Never allow audit logging to fail a request
    }

    return entry;
  }

  public static getSummary(limit = 100, eventType?: string): {
    totalRecorded: number;
    countsLast24h: {
      ownerLogins: number;
      failedAuthAttempts: number;
      unauthorizedAdminAttempts: number;
      configChanges: number;
    };
    events: SecurityAuditEntry[];
  } {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit || 100)), 250);
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    let ownerLogins = 0;
    let failedAuthAttempts = 0;
    let unauthorizedAdminAttempts = 0;
    let configChanges = 0;

    for (const item of this.entries) {
      if (item.timestampMs < cutoff24h) continue;
      if (item.eventType === 'owner_login_success') ownerLogins++;
      else if (item.eventType === 'auth_login_failed' || item.eventType === 'auth_refresh_failed') {
        failedAuthAttempts++;
      } else if (item.eventType === 'unauthorized_admin_access') {
        unauthorizedAdminAttempts++;
      } else if (
        item.eventType === 'provider_config_changed' ||
        item.eventType === 'gateway_config_changed' ||
        item.eventType === 'brain_profile_changed' ||
        item.eventType === 'tool_toggled'
      ) {
        configChanges++;
      }
    }

    const filtered = eventType
      ? this.entries.filter((e) => e.eventType === eventType)
      : this.entries;

    return {
      totalRecorded: this.entries.length,
      countsLast24h: {
        ownerLogins,
        failedAuthAttempts,
        unauthorizedAdminAttempts,
        configChanges,
      },
      events: filtered.slice(0, safeLimit),
    };
  }

  public static clear(): void {
    this.entries = [];
  }
}
