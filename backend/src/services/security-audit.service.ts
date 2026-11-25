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
  | 'security_config_changed'
  | 'brain_profile_changed'
  | 'tool_toggled'
  | 'tool_tested'
  | 'provider_tested'
  | 'rate_limiter_degraded'
  | 'gateway_unavailable';

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

export interface AuditDurabilityStatus {
  mode: 'supabase_durable' | 'in_memory_only';
  durableConfigured: boolean;
  tableName: string;
  persistedCount: number;
  persistenceErrorCount: number;
  lastPersistenceError?: string;
  lastPersistenceSuccessAt?: string;
  bufferedInMemory: number;
  maxMemoryEntries: number;
}

const SECRET_FIELD_REGEX =
  /^(?:password|pass|secret|token|access_?token|refresh_?token|api_?key|apikey|authorization|auth|cookie|set-cookie|owner_?key|service_?role_?key|master_?key|private_?key)$/i;

function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

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

function computeCountsLast24h(items: SecurityAuditEntry[]): {
  ownerLogins: number;
  failedAuthAttempts: number;
  unauthorizedAdminAttempts: number;
  configChanges: number;
} {
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  let ownerLogins = 0;
  let failedAuthAttempts = 0;
  let unauthorizedAdminAttempts = 0;
  let configChanges = 0;

  for (const item of items) {
    if (item.timestampMs < cutoff24h) continue;
    if (item.eventType === 'owner_login_success') ownerLogins++;
    else if (item.eventType === 'auth_login_failed' || item.eventType === 'auth_refresh_failed') {
      failedAuthAttempts++;
    } else if (item.eventType === 'unauthorized_admin_access') {
      unauthorizedAdminAttempts++;
    } else if (
      item.eventType === 'provider_config_changed' ||
      item.eventType === 'gateway_config_changed' ||
      item.eventType === 'security_config_changed' ||
      item.eventType === 'brain_profile_changed' ||
      item.eventType === 'tool_toggled'
    ) {
      configChanges++;
    }
  }

  return {
    ownerLogins,
    failedAuthAttempts,
    unauthorizedAdminAttempts,
    configChanges,
  };
}

export class SecurityAuditService {
  private static readonly MAX_ENTRIES = 500;
  private static entries: SecurityAuditEntry[] = [];
  private static persistedCount = 0;
  private static persistenceErrorCount = 0;
  private static lastPersistenceError?: string;
  private static lastPersistenceSuccessAt?: string;
  private static pendingWrites = new Set<Promise<void>>();

  private static getPersistenceConfig(): {
    configured: boolean;
    supabaseUrl: string;
    serviceRoleKey: string;
    tableName: string;
  } {
    const rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const rawTable = (process.env.SECURITY_AUDIT_TABLE || 'jexa_security_audit_logs').trim();
    const tableName = /^[a-zA-Z0-9_]{1,64}$/.test(rawTable) ? rawTable : 'jexa_security_audit_logs';
    const configured = Boolean(rawUrl && isValidHttpUrl(rawUrl) && serviceRoleKey);

    return {
      configured,
      supabaseUrl: configured ? rawUrl : '',
      serviceRoleKey: configured ? serviceRoleKey : '',
      tableName,
    };
  }

  public static getDurabilityStatus(): AuditDurabilityStatus {
    const cfg = this.getPersistenceConfig();
    return {
      mode: cfg.configured ? 'supabase_durable' : 'in_memory_only',
      durableConfigured: cfg.configured,
      tableName: cfg.tableName,
      persistedCount: this.persistedCount,
      persistenceErrorCount: this.persistenceErrorCount,
      lastPersistenceError: this.lastPersistenceError,
      lastPersistenceSuccessAt: this.lastPersistenceSuccessAt,
      bufferedInMemory: this.entries.length,
      maxMemoryEntries: this.MAX_ENTRIES,
    };
  }

  private static async persistEntry(entry: SecurityAuditEntry): Promise<void> {
    const cfg = this.getPersistenceConfig();
    if (!cfg.configured) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${cfg.tableName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.serviceRoleKey,
          Authorization: `Bearer ${cfg.serviceRoleKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: entry.id,
          created_at: entry.timestamp,
          timestamp_ms: entry.timestampMs,
          event_type: entry.eventType,
          severity: entry.severity,
          actor_user_id: entry.actorUserId ?? null,
          actor_email: entry.actorEmail ?? null,
          actor_role: entry.actorRole ?? null,
          ip: entry.ip ?? null,
          method: entry.method ?? null,
          path: entry.path ?? null,
          status_code: entry.statusCode ?? null,
          summary: entry.summary,
          details: entry.details ?? null,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.persistenceErrorCount++;
        this.lastPersistenceError = scrubSecretsAndUrls(
          errText || `Audit persistence HTTP ${response.status}`
        ).slice(0, 180);
        return;
      }

      this.persistedCount++;
      this.lastPersistenceError = undefined;
      this.lastPersistenceSuccessAt = new Date().toISOString();
    } catch (err: any) {
      this.persistenceErrorCount++;
      this.lastPersistenceError = scrubSecretsAndUrls(
        controller.signal.aborted
          ? 'Audit persistence timed out.'
          : err?.message || 'Audit persistence failed.'
      ).slice(0, 180);
    } finally {
      clearTimeout(timer);
    }
  }

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

      if (this.getPersistenceConfig().configured) {
        const writePromise = this.persistEntry(entry).finally(() => {
          this.pendingWrites.delete(writePromise);
        });
        this.pendingWrites.add(writePromise);
      }
    } catch {
      // Never allow audit logging to fail a request
    }

    return entry;
  }

  public static async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.size === 0) return;
    await Promise.allSettled(Array.from(this.pendingWrites));
  }

  public static getSummary(limit = 100, eventType?: string): {
    totalRecorded: number;
    durability: AuditDurabilityStatus;
    countsLast24h: {
      ownerLogins: number;
      failedAuthAttempts: number;
      unauthorizedAdminAttempts: number;
      configChanges: number;
    };
    events: SecurityAuditEntry[];
  } {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit || 100)), 250);
    const filtered = eventType
      ? this.entries.filter((e) => e.eventType === eventType)
      : this.entries;

    return {
      totalRecorded: this.entries.length,
      durability: this.getDurabilityStatus(),
      countsLast24h: computeCountsLast24h(this.entries),
      events: filtered.slice(0, safeLimit),
    };
  }

  public static async getDurableSummary(limit = 100, eventType?: string): Promise<{
    totalRecorded: number;
    durability: AuditDurabilityStatus;
    countsLast24h: {
      ownerLogins: number;
      failedAuthAttempts: number;
      unauthorizedAdminAttempts: number;
      configChanges: number;
    };
    events: SecurityAuditEntry[];
  }> {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit || 100)), 250);
    const cfg = this.getPersistenceConfig();

    if (!cfg.configured) {
      return this.getSummary(safeLimit, eventType);
    }

    await this.flushPendingWrites();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const fetchLimit = Math.max(safeLimit, 200);
      const queryParams = new URLSearchParams({
        select: '*',
        order: 'timestamp_ms.desc',
        limit: String(fetchLimit),
      });
      if (eventType) {
        queryParams.set('event_type', `eq.${eventType}`);
      }

      const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${cfg.tableName}?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          apikey: cfg.serviceRoleKey,
          Authorization: `Bearer ${cfg.serviceRoleKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.persistenceErrorCount++;
        this.lastPersistenceError = `Audit query HTTP ${response.status}`;
        return this.getSummary(safeLimit, eventType);
      }

      const rows = (await response.json()) as any[];
      if (!Array.isArray(rows)) {
        return this.getSummary(safeLimit, eventType);
      }

      const byId = new Map<string, SecurityAuditEntry>();
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue;
        byId.set(row.id, {
          id: row.id,
          timestamp: row.created_at || new Date(Number(row.timestamp_ms) || Date.now()).toISOString(),
          timestampMs: Number(row.timestamp_ms) || Date.parse(row.created_at) || Date.now(),
          eventType: row.event_type as SecurityAuditEventType,
          severity: (row.severity || 'info') as SecurityAuditSeverity,
          actorUserId: row.actor_user_id || undefined,
          actorEmail: row.actor_email || undefined,
          actorRole: row.actor_role || undefined,
          ip: row.ip || undefined,
          method: row.method || undefined,
          path: row.path || undefined,
          statusCode: typeof row.status_code === 'number' ? row.status_code : undefined,
          summary: typeof row.summary === 'string' ? scrubSecretsAndUrls(row.summary) : '',
          details:
            row.details && typeof row.details === 'object'
              ? (sanitizeAuditValue(row.details) as Record<string, any>)
              : undefined,
        });
      }

      for (const localEntry of this.entries) {
        if (eventType && localEntry.eventType !== eventType) continue;
        if (!byId.has(localEntry.id)) {
          byId.set(localEntry.id, localEntry);
        }
      }

      const merged = Array.from(byId.values()).sort((a, b) => b.timestampMs - a.timestampMs);
      this.lastPersistenceError = undefined;

      return {
        totalRecorded: Math.max(merged.length, this.entries.length),
        durability: this.getDurabilityStatus(),
        countsLast24h: computeCountsLast24h(merged),
        events: merged.slice(0, safeLimit),
      };
    } catch (err: any) {
      this.persistenceErrorCount++;
      this.lastPersistenceError = scrubSecretsAndUrls(
        controller.signal.aborted
          ? 'Audit query timed out.'
          : err?.message || 'Audit query failed.'
      ).slice(0, 180);
      return this.getSummary(safeLimit, eventType);
    } finally {
      clearTimeout(timer);
    }
  }

  public static clear(): void {
    this.entries = [];
    this.persistedCount = 0;
    this.persistenceErrorCount = 0;
    this.lastPersistenceError = undefined;
    this.lastPersistenceSuccessAt = undefined;
  }
}
