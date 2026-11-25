import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Activity,
  RefreshCw,
  Wrench,
  AlertTriangle,
  Globe,
  Clock,
  Sliders,
  CheckCircle2,
  XCircle,
  Play,
  Trash2,
  Plus,
  X,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { ApiClient, ToolTestResult, hasConfiguredBackend } from '../../services/api.client';
import { safeStorage } from '../../services/storage';
import { FREE_GEMINI_CHAT_MODELS, FREE_GEMINI_VOICE_MODELS } from '../../../shared/types/provider';

interface ToolsPanelProps {
  onBack: () => void;
}

interface MinuteBucket {
  minute: string;
  timestampMs: number;
  requests: number;
  succeeded: number;
  failed: number;
  tokens: number;
  errors: number;
}

interface CallEntry {
  id: string;
  messageId?: string;
  provider: string;
  model: string;
  purpose: string;
  status: 'ok' | 'rate_limited' | 'error';
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  isEstimated: boolean;
  durationMs: number;
  timestampMs: number;
  createdAt: string;
  errorStatusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string;
}

interface ModelUsageBreakdown {
  model: string;
  provider: string;
  lastMinute: {
    requests: number;
    succeeded: number;
    failed: number;
    tokens: number;
    estimatedTokens: number;
  };
  today: {
    requests: number;
    succeeded: number;
    failed: number;
    rateLimited: number;
    tokens: number;
    estimatedTokens: number;
  };
  total: {
    requests: number;
    succeeded: number;
    failed: number;
    rateLimited: number;
    tokens: number;
    estimatedTokens: number;
  };
}

interface UsageSummary {
  serverStartedAtMs: number;
  serverStartedAt: string;
  lastMinute: {
    requests: number;
    succeededRequests: number;
    failedRequests: number;
    rateLimit429Count: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedTokens: number;
  };
  busiestSecond: {
    timestampMs: number;
    requests: number;
    tokens: number;
  };
  busiestMinute: {
    timestampMs: number;
    requests: number;
    tokens: number;
  };
  last30Minutes: MinuteBucket[];
  today: {
    requests: number;
    succeededRequests: number;
    failedRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedTokens: number;
    tavilyCredits: number;
    rateLimit429Count: number;
  };
  overall: {
    requests: number;
    succeededRequests: number;
    failedRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedTokens: number;
    rateLimit429Count: number;
  };
  byPurpose: Record<
    string,
    {
      requests: number;
      succeeded: number;
      failed: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedTokens: number;
      errors: number;
    }
  >;
  byModel: ModelUsageBreakdown[];
  rateLimit429Count: number;
  mostExpensiveMessages: CallEntry[];
  recentCalls: CallEntry[];
  failedCalls: CallEntry[];
  tavilyCreditsThisMonth: number;
  totalEntriesRecorded: number;
}

interface ToolStatusItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  permissionLevel?: 'read_only' | 'sensitive' | 'write' | string;
  enabled: boolean;
  available: boolean;
  callsToday: number;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  avgDurationMs: number;
  lastUsedAt: string | null;
  lastError?: string | null;
}

const BUILT_IN_TOOLS_CATALOG: ToolStatusItem[] = [
  {
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the live web for current events, facts, documentation, and sources.',
    category: 'web',
    permissionLevel: 'read_only',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'open_link',
    displayName: 'Open & Analyze Link',
    description: 'Fetch and extract clean readable text and metadata from a specific URL.',
    category: 'web',
    permissionLevel: 'read_only',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'system_time',
    displayName: 'System Time',
    description: 'Return current UTC and local date/time in any IANA timezone.',
    category: 'system',
    permissionLevel: 'read_only',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'system_check',
    displayName: 'System Health Check',
    description: 'Inspect runtime uptime, provider readiness, and active tool health.',
    category: 'system',
    permissionLevel: 'sensitive',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'recent_errors',
    displayName: 'Recent Errors',
    description: 'Retrieve buffered backend and provider error diagnostics.',
    category: 'diagnostics',
    permissionLevel: 'sensitive',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'list_source_files',
    displayName: 'List Source Files',
    description: 'Browse project directories and source files inside the repository.',
    category: 'code',
    permissionLevel: 'sensitive',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'read_source_file',
    displayName: 'Read Source File',
    description: 'Read specific line ranges from repository source files for analysis.',
    category: 'code',
    permissionLevel: 'sensitive',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
  {
    name: 'search_code',
    displayName: 'Search Code',
    description: 'Search across source files for symbols, patterns, and definitions.',
    category: 'code',
    permissionLevel: 'sensitive',
    enabled: true,
    available: false,
    callsToday: 0,
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    successRate: null,
    avgDurationMs: 0,
    lastUsedAt: null,
  },
];

interface ModelQuotaLimits {
  rpm?: number;
  tpm?: number;
  rpd?: number;
  tpd?: number;
}

type PerModelLimitsMap = Record<string, ModelQuotaLimits>;

const PER_MODEL_LIMITS_KEY = 'jexa_per_model_limits_v1';

function loadSavedModelLimits(): PerModelLimitsMap {
  try {
    const raw = safeStorage.getItem(PER_MODEL_LIMITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const clean: PerModelLimitsMap = {};
    for (const [modelId, cfg] of Object.entries(parsed)) {
      if (!modelId || !cfg || typeof cfg !== 'object') continue;
      const entry: ModelQuotaLimits = {};
      for (const k of ['rpm', 'tpm', 'rpd', 'tpd'] as const) {
        const val = Number((cfg as any)[k]);
        if (Number.isFinite(val) && val > 0) {
          entry[k] = Math.round(val);
        }
      }
      if (Object.keys(entry).length > 0) {
        clean[modelId] = entry;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

const PURPOSE_LABELS: Record<string, string> = {
  chat: 'Chat Replies',
  tool_round: 'Tool Rounds',
  memory_extraction: 'Memory Extractor',
  style_learner: 'Style Learner',
  search_decision: 'Search Classifier',
  voice_tts: 'Voice TTS',
  tool_execution: 'Tool Calls',
  tavily_search: 'Web Search (Tavily)',
};

function formatHHMM(tsMs?: number): string {
  if (!tsMs) return '--:--';
  const d = new Date(tsMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTimeShort(tsOrIso?: number | string | null): string {
  if (!tsOrIso) return 'Never';
  const d = new Date(tsOrIso);
  if (Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function parsePositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Math.floor(Number(trimmed));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  timestampMs: number;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
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

interface SecurityCounts24h {
  ownerLogins: number;
  failedAuthAttempts: number;
  unauthorizedAdminAttempts: number;
  configChanges: number;
}

interface AuditDurabilityInfo {
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

interface SecurityStatusData {
  setup: {
    authConfigured: boolean;
    hasOwnerConfigured: boolean;
    ownerUserIdConfigured: boolean;
    ownerEmailConfigured: boolean;
    serviceRoleConfigured: boolean;
    requireAuthForChat: boolean;
  };
  gatewayActive: boolean;
  gatewayEnforced?: boolean;
  gateway?: {
    configured: boolean;
    active: boolean;
    enforced: boolean;
    reachable: boolean;
    latencyMs: number;
    error?: string;
    textProvider: string;
    model: string;
    backupModel: string;
  };
  providers?: {
    text: {
      type: string;
      status: string;
      configured: boolean;
      model: string;
      backupModel?: string;
    };
    voice: {
      type: string;
      status: string;
      configured: boolean;
      model: string;
    };
  };
  rateLimiting: {
    mode: string;
    upstashConfigured?: boolean;
    failClosedPolicy?: string;
    failClosedActiveForCritical?: boolean;
    activeMemoryBuckets?: number;
    maxMemoryKeys?: number;
    upstashErrorsCount?: number;
    fallbackCount?: number;
    failClosedRejectionsCount?: number;
    lastUpstashError?: string;
    upstashHealth?: {
      configured: boolean;
      reachable: boolean;
      latencyMs: number;
      error?: string;
    };
  };
  auditPersistence?: AuditDurabilityInfo;
  auth?: {
    cacheTtlMs: number;
    cachedTokensCount: number;
    revokedTokensCount: number;
  };
  countsLast24h: SecurityCounts24h;
  recentGatewayErrors?: Array<{
    id: string;
    timestamp: string;
    timestampMs: number;
    model: string;
    statusCode?: number;
    code?: string;
    message: string;
  }>;
}

type SecurityFilterCategory = 'all' | 'auth' | 'blocked' | 'config';

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'usage' | 'tools' | 'security'>('usage');
  const [callLogFilter, setCallLogFilter] = useState<'recent' | 'failed' | 'expensive'>('recent');
  const [securityFilter, setSecurityFilter] = useState<SecurityFilterCategory>('all');

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [tools, setTools] = useState<ToolStatusItem[]>([]);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatusData | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityAuditEvent[]>([]);
  const [securityCounts24h, setSecurityCounts24h] = useState<SecurityCounts24h | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingTool, setTogglingTool] = useState<string | null>(null);

  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [toolTestResults, setToolTestResults] = useState<Record<string, ToolTestResult>>({});

  const [selectedCall, setSelectedCall] = useState<CallEntry | null>(null);

  // User-entered per-model limits only (no defaults)
  const [modelLimits, setModelLimits] = useState<PerModelLimitsMap>(loadSavedModelLimits);
  const [showLimitEditor, setShowLimitEditor] = useState(false);

  useEffect(() => {
    const handleHardwareBack = (e: Event) => {
      if (selectedCall) {
        e.preventDefault();
        setSelectedCall(null);
        return;
      }
      if (showLimitEditor) {
        e.preventDefault();
        setShowLimitEditor(false);
      }
    };
    window.addEventListener('jexa:hardware-back', handleHardwareBack);
    return () => window.removeEventListener('jexa:hardware-back', handleHardwareBack);
  }, [selectedCall, showLimitEditor]);
  const [draftModel, setDraftModel] = useState<string>(FREE_GEMINI_CHAT_MODELS[1]?.id || 'gemini-3.8-flash');
  const [draftRpm, setDraftRpm] = useState('');
  const [draftTpm, setDraftTpm] = useState('');
  const [draftRpd, setDraftRpd] = useState('');
  const [draftTpd, setDraftTpd] = useState('');

  const persistModelLimits = useCallback((next: PerModelLimitsMap) => {
    setModelLimits(next);
    try {
      safeStorage.setItem(PER_MODEL_LIMITS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const backendConfigured = hasConfiguredBackend();

  const fetchData = useCallback(async (isInitial = false) => {
    if (!hasConfiguredBackend()) {
      setTools((prev) => (prev.length > 0 ? prev : BUILT_IN_TOOLS_CATALOG));
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const [usageRes, toolsRes, secStatusRes, secLogsRes] = await Promise.allSettled([
        ApiClient.getUsageSummary(),
        ApiClient.getToolsStatus(),
        ApiClient.getSecurityStatus(),
        ApiClient.getSecurityAuditLogs(100),
      ]);

      const failures: string[] = [];

      if (usageRes.status === 'fulfilled') {
        setSummary(usageRes.value);
      } else {
        failures.push(usageRes.reason?.message || 'Usage telemetry unavailable');
      }

      if (toolsRes.status === 'fulfilled') {
        setTools(toolsRes.value?.tools || BUILT_IN_TOOLS_CATALOG);
      } else {
        setTools((prev) => (prev.length > 0 ? prev : BUILT_IN_TOOLS_CATALOG));
        failures.push(toolsRes.reason?.message || 'Tools status unavailable');
      }

      if (secStatusRes.status === 'fulfilled') {
        setSecurityStatus(secStatusRes.value || null);
      }
      if (secLogsRes.status === 'fulfilled') {
        setSecurityEvents(secLogsRes.value?.events || []);
        setSecurityCounts24h(
          secLogsRes.value?.countsLast24h ||
            (secStatusRes.status === 'fulfilled' ? secStatusRes.value?.countsLast24h : null) ||
            null
        );
      } else if (secStatusRes.status === 'fulfilled') {
        setSecurityCounts24h(secStatusRes.value?.countsLast24h || null);
      }

      setError(failures.length > 0 ? failures[0] : null);
    } catch (err: any) {
      setTools((prev) => (prev.length > 0 ? prev : BUILT_IN_TOOLS_CATALOG));
      setError(err?.message || 'Failed to load usage, tools, and security status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || !backendConfigured) return;
    const interval = setInterval(() => {
      void fetchData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, backendConfigured, fetchData]);

  const handleToggleTool = async (tool: ToolStatusItem) => {
    setTogglingTool(tool.name);
    try {
      const res = await ApiClient.toggleTool(tool.name, !tool.enabled);
      setTools((prev) =>
        prev.map((t) => (t.name === tool.name ? { ...t, enabled: res.enabled } : t))
      );
    } catch (err: any) {
      setError(err?.message || `Failed to toggle ${tool.displayName}`);
    } finally {
      setTogglingTool(null);
    }
  };

  const handleTestTool = async (tool: ToolStatusItem) => {
    setTestingTool(tool.name);
    try {
      const result = await ApiClient.testTool(tool.name);
      setToolTestResults((prev) => ({ ...prev, [tool.name]: result }));
      await fetchData(false);
    } catch (err: any) {
      setToolTestResults((prev) => ({
        ...prev,
        [tool.name]: {
          success: false,
          toolName: tool.name,
          durationMs: 0,
          message: err?.message || `Test failed for ${tool.displayName}`,
          error: err?.message || `Test failed for ${tool.displayName}`,
        },
      }));
    } finally {
      setTestingTool(null);
    }
  };

  const availableModelSuggestions = useMemo(() => {
    const set = new Set<string>();
    FREE_GEMINI_CHAT_MODELS.forEach((m) => set.add(m.id));
    FREE_GEMINI_VOICE_MODELS.forEach((m) => set.add(m.id));
    summary?.byModel?.forEach((m) => {
      if (m.model) set.add(m.model);
    });
    Object.keys(modelLimits).forEach((m) => set.add(m));
    return Array.from(set);
  }, [summary?.byModel, modelLimits]);

  const handleOpenLimitEditorFor = (modelId?: string) => {
    const target = modelId || draftModel || FREE_GEMINI_CHAT_MODELS[1]?.id || 'gemini-3.8-flash';
    const existing = modelLimits[target] || {};
    setDraftModel(target);
    setDraftRpm(existing.rpm ? String(existing.rpm) : '');
    setDraftTpm(existing.tpm ? String(existing.tpm) : '');
    setDraftRpd(existing.rpd ? String(existing.rpd) : '');
    setDraftTpd(existing.tpd ? String(existing.tpd) : '');
    setShowLimitEditor(true);
  };

  const handleSaveModelLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const modelId = draftModel.trim();
    if (!modelId) return;

    const entry: ModelQuotaLimits = {};
    const rpm = parsePositiveInt(draftRpm);
    const tpm = parsePositiveInt(draftTpm);
    const rpd = parsePositiveInt(draftRpd);
    const tpd = parsePositiveInt(draftTpd);
    if (rpm) entry.rpm = rpm;
    if (tpm) entry.tpm = tpm;
    if (rpd) entry.rpd = rpd;
    if (tpd) entry.tpd = tpd;

    const next = { ...modelLimits };
    if (Object.keys(entry).length === 0) {
      delete next[modelId];
    } else {
      next[modelId] = entry;
    }
    persistModelLimits(next);
    setShowLimitEditor(false);
  };

  const handleRemoveModelLimit = (modelId: string) => {
    const next = { ...modelLimits };
    delete next[modelId];
    persistModelLimits(next);
  };

  const renderLimitMeter = (label: string, current: number, limit: number) => {
    const rawPct = limit > 0 ? (current / limit) * 100 : 0;
    const pct = Math.min(100, Math.round(rawPct));
    const barColor =
      rawPct >= 100 ? 'bg-rose-500' : rawPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
    const textColor =
      rawPct >= 100 ? 'text-rose-400' : rawPct >= 80 ? 'text-amber-400' : 'text-emerald-400';

    return (
      <div className="p-2.5 rounded-lg bg-[#0d1320] border border-white/[0.06] space-y-1.5">
        <div className="flex items-center justify-between text-[11px] gap-2">
          <span className="font-medium text-slate-300">{label}</span>
          <span className={`font-mono tabular-nums font-semibold ${textColor}`}>
            {current.toLocaleString()} / {limit.toLocaleString()} ({Math.round(rawPct)}%)
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const last30 = summary?.last30Minutes || [];
  const maxBucketTokens = Math.max(1, ...last30.map((b) => b.tokens));
  const maxBucketRequests = Math.max(1, ...last30.map((b) => b.requests));

  const configuredLimitEntries = Object.entries(modelLimits);

  const visibleCallList: CallEntry[] = useMemo(() => {
    if (!summary) return [];
    if (callLogFilter === 'failed') return summary.failedCalls || [];
    if (callLogFilter === 'expensive') return summary.mostExpensiveMessages || [];
    return summary.recentCalls || [];
  }, [summary, callLogFilter]);

  const filteredSecurityEvents: SecurityAuditEvent[] = useMemo(() => {
    if (securityFilter === 'all') return securityEvents;
    if (securityFilter === 'blocked') {
      return securityEvents.filter((ev) =>
        ['unauthorized_admin_access', 'rate_limiter_degraded', 'gateway_unavailable'].includes(ev.eventType)
      );
    }
    if (securityFilter === 'auth') {
      return securityEvents.filter((ev) =>
        [
          'owner_login_success',
          'user_login_success',
          'auth_login_failed',
          'owner_logout',
          'user_logout',
          'session_restored',
          'auth_refresh_failed',
        ].includes(ev.eventType)
      );
    }
    return securityEvents.filter((ev) =>
      [
        'provider_config_changed',
        'gateway_config_changed',
        'security_config_changed',
        'brain_profile_changed',
        'tool_toggled',
        'tool_tested',
        'provider_tested',
      ].includes(ev.eventType)
    );
  }, [securityEvents, securityFilter]);

  const purposeEntries = useMemo(() => {
    const order = [
      'chat',
      'tool_round',
      'search_decision',
      'memory_extraction',
      'style_learner',
      'voice_tts',
      'tool_execution',
      'tavily_search',
    ];
    const map = summary?.byPurpose || {};
    const keys = [
      ...order.filter((k) => map[k] || k === 'chat' || k === 'tool_round' || k === 'voice_tts'),
      ...Object.keys(map).filter((k) => !order.includes(k)),
    ];
    return keys.map((key) => ({
      key,
      label: PURPOSE_LABELS[key] || key,
      stats: map[key] || {
        requests: 0,
        succeeded: 0,
        failed: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedTokens: 0,
        errors: 0,
      },
    }));
  }, [summary?.byPurpose]);

  const renderCallStatusBadge = (status: CallEntry['status']) => {
    if (status === 'rate_limited') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 shrink-0">
          <AlertTriangle className="w-3 h-3" />
          <span>429</span>
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-400 shrink-0">
          <XCircle className="w-3 h-3" />
          <span>Failed</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        <span>OK</span>
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Compact Header */}
      <header className="shrink-0 border-b border-white/[0.07] bg-[#090d16] pt-safe pl-safe pr-safe">
        <div className="flex items-center justify-between h-14 px-3 sm:px-5 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            aria-label="Back to chat"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08] shrink-0" />
          <h1 className="text-sm font-semibold text-white truncate">Tools</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            onClick={() => setAutoRefresh((v) => !v)}
            className="min-h-[44px] px-2 flex items-center gap-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Auto-refresh every 5 seconds"
          >
            <span className="text-[11px] font-medium text-slate-400">Auto</span>
            <span
              className={`w-8 h-4.5 rounded-full transition-colors relative p-0.5 inline-flex items-center ${
                autoRefresh ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-3.5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => fetchData(false)}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
        </div>
      </header>

      {/* Dashboard Tab Bar */}
      <div className="px-3 sm:px-5 py-2.5 border-b border-white/[0.06] bg-[#080b12] flex items-center justify-between gap-3 shrink-0 flex-wrap pl-safe pr-safe">
        <div
          role="tablist"
          aria-label="Tools views"
          className="inline-flex p-1 rounded-xl bg-[#0e1422] border border-white/[0.07]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'usage'}
            onClick={() => setActiveTab('usage')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'usage'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Usage</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'tools'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Tools</span>
            <span className="text-[11px] font-mono tabular-nums text-slate-400 ml-0.5">
              ({tools.length})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'security'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Security</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-400 tabular-nums flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Development Access</span>
          </span>
          {summary && (
            <span className="text-slate-500">
              · Up since {formatHHMM(summary.serverStartedAtMs)}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 pb-safe pl-safe pr-safe">
        <div className="max-w-5xl mx-auto space-y-4 pb-10">
          {!backendConfigured && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Standalone device mode: showing registered tool definitions and local model limits. Live server execution and telemetry activate when a backend server URL is configured in Variables.
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {loading && !summary && tools.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading usage, tool, and security telemetry…</span>
            </div>
          ) : activeTab === 'usage' ? (
            /* ============================================================ */
            /* TAB 1: HONEST USAGE TRACKER                                  */
            /* ============================================================ */
            <div className="space-y-4">
              {/* Top Honest KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Last Minute</div>
                  <div className="text-xl font-semibold text-white font-mono tabular-nums mt-1">
                    {(summary?.lastMinute.totalTokens ?? 0).toLocaleString()}
                    {summary && summary.lastMinute.estimatedTokens > 0 && (
                      <span className="text-[10px] font-normal text-amber-400 ml-1">~est</span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums mt-1 flex items-center gap-2">
                    <span className="text-emerald-400">{summary?.lastMinute.succeededRequests ?? 0} ok</span>
                    <span className="text-slate-600">·</span>
                    <span className={summary && summary.lastMinute.failedRequests > 0 ? 'text-rose-400' : 'text-slate-500'}>
                      {summary?.lastMinute.failedRequests ?? 0} failed
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Today Tokens</div>
                  <div className="text-xl font-semibold text-white font-mono tabular-nums mt-1">
                    {(summary?.today.totalTokens ?? 0).toLocaleString()}
                    {summary && summary.today.estimatedTokens > 0 && (
                      <span className="text-[10px] font-normal text-amber-400 ml-1">~est</span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1 truncate">
                    {(summary?.today.promptTokens ?? 0).toLocaleString()} in · {(summary?.today.completionTokens ?? 0).toLocaleString()} out
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">AI Calls Today</div>
                  <div className="text-xl font-semibold text-white font-mono tabular-nums mt-1 flex items-baseline gap-2">
                    <span className="text-emerald-400">{summary?.today.succeededRequests ?? 0}</span>
                    <span className="text-xs font-normal text-slate-500">ok</span>
                    <span className={summary && summary.today.failedRequests > 0 ? 'text-rose-400' : 'text-slate-400'}>
                      {summary?.today.failedRequests ?? 0}
                    </span>
                    <span className="text-xs font-normal text-slate-500">failed</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums mt-1 text-slate-400">
                    429 limits: <span className={summary && summary.today.rateLimit429Count > 0 ? 'text-amber-400' : 'text-slate-300'}>{summary?.today.rateLimit429Count ?? 0}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Web Search Credits</span>
                  </div>
                  <div className="text-xl font-semibold text-white font-mono tabular-nums mt-1">
                    {summary?.tavilyCreditsThisMonth ?? 0}
                    <span className="text-[11px] font-normal text-slate-500 ml-1">this month</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                    Today: {summary?.today.tavilyCredits ?? 0} · Peak 1m: {summary?.busiestMinute.requests ?? 0} req
                  </div>
                </div>
              </div>

              {summary && (summary.today.estimatedTokens > 0 || summary.overall.estimatedTokens > 0) && (
                <div className="px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-[11px] text-amber-200/90 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Numbers labeled <span className="font-mono font-semibold text-amber-300">~est</span> are estimated (characters / 4) when the provider did not return token counts (e.g. voice or aborted calls).
                  </span>
                </div>
              )}

              {/* Last 30 Minutes Chart */}
              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="font-medium text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Last 30 Minutes</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    Peak: {maxBucketTokens.toLocaleString()} tok/min · {summary?.totalEntriesRecorded ?? 0} entries
                  </span>
                </div>
                <div className="h-20 flex items-end gap-1 pt-1">
                  {last30.map((bucket) => {
                    const height =
                      bucket.tokens > 0
                        ? Math.max(10, Math.round((bucket.tokens / maxBucketTokens) * 100))
                        : bucket.requests > 0
                        ? Math.max(10, Math.round((bucket.requests / maxBucketRequests) * 100))
                        : 4;
                    const barClass =
                      bucket.errors > 0
                        ? 'bg-rose-500/80 hover:bg-rose-400'
                        : bucket.tokens > 0 || bucket.requests > 0
                        ? 'bg-emerald-500/80 hover:bg-emerald-400'
                        : 'bg-white/[0.06]';

                    return (
                      <div
                        key={bucket.timestampMs}
                        className="flex-1 h-full flex items-end"
                        title={`${bucket.minute}: ${bucket.succeeded} ok, ${bucket.failed} failed, ${bucket.tokens.toLocaleString()} tokens`}
                      >
                        <div className={`w-full rounded-t-sm transition-all ${barClass}`} style={{ height: `${height}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500">
                  <span>{last30[0]?.minute || '-30m'}</span>
                  <span>{last30[14]?.minute || '-15m'}</span>
                  <span>{last30[last30.length - 1]?.minute || 'Now'}</span>
                </div>
              </div>

              {/* Custom Per-Model Limits (Meters appear ONLY after user enters limits) */}
              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <h2 className="text-xs font-semibold text-white">Your Per-Model Limits</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenLimitEditorFor()}
                    className="min-h-[36px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-cyan-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Set Model Limit</span>
                  </button>
                </div>

                {showLimitEditor && (
                  <form
                    onSubmit={handleSaveModelLimit}
                    className="p-3 rounded-xl bg-[#0d1320] border border-cyan-500/25 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">
                          Model ID
                        </label>
                        <input
                          type="text"
                          list="jexa-model-suggestions"
                          value={draftModel}
                          onChange={(e) => setDraftModel(e.target.value)}
                          placeholder="e.g. gemini-3.8-flash"
                          className="w-full px-2.5 py-2 rounded-lg bg-[#070a12] border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                        />
                        <datalist id="jexa-model-suggestions">
                          {availableModelSuggestions.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1">RPM</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            value={draftRpm}
                            onChange={(e) => setDraftRpm(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg bg-[#070a12] border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1">TPM</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            value={draftTpm}
                            onChange={(e) => setDraftTpm(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg bg-[#070a12] border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1">RPD</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            value={draftRpd}
                            onChange={(e) => setDraftRpd(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg bg-[#070a12] border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1">TPD</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="—"
                            value={draftTpd}
                            onChange={(e) => setDraftTpd(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg bg-[#070a12] border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLimitEditor(false)}
                        className="min-h-[36px] px-3 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.05] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[36px] px-3.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-xs font-medium text-emerald-200 cursor-pointer"
                      >
                        Save Limits
                      </button>
                    </div>
                  </form>
                )}

                {configuredLimitEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1">
                    No limits configured yet. Quota meters appear here only after you enter your own RPM, TPM, RPD, or TPD limits for a model.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {configuredLimitEntries.map(([modelId, cfg]) => {
                      const modelStats = summary?.byModel?.find((m) => m.model === modelId);
                      const minReq = modelStats?.lastMinute.requests ?? 0;
                      const minTok = modelStats?.lastMinute.tokens ?? 0;
                      const dayReq = modelStats?.today.requests ?? 0;
                      const dayTok = modelStats?.today.tokens ?? 0;

                      return (
                        <div
                          key={modelId}
                          className="p-3 rounded-xl bg-black/25 border border-white/[0.06] space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-semibold text-white truncate">
                              {modelId}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenLimitEditorFor(modelId)}
                                className="px-2 py-1 rounded text-[11px] text-cyan-400 hover:bg-white/[0.05] cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveModelLimit(modelId)}
                                aria-label={`Remove limits for ${modelId}`}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-white/[0.05] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {cfg.rpm ? renderLimitMeter('RPM (Req / min)', minReq, cfg.rpm) : null}
                            {cfg.tpm ? renderLimitMeter('TPM (Tok / min)', minTok, cfg.tpm) : null}
                            {cfg.rpd ? renderLimitMeter('RPD (Req / day)', dayReq, cfg.rpd) : null}
                            {cfg.tpd ? renderLimitMeter('TPD (Tok / day)', dayTok, cfg.tpd) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Calls Log (Recent / Failed / Most Expensive) — Tap any entry for full error/details */}
              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-xs font-semibold text-white">AI Call Log</h2>
                    <p className="text-[11px] text-slate-400">
                      Tap any entry to view full error status, message, and token breakdown.
                    </p>
                  </div>
                  <div className="inline-flex p-0.5 rounded-lg bg-[#0d1320] border border-white/[0.07]">
                    {(
                      [
                        { id: 'recent', label: `Recent (${summary?.recentCalls?.length ?? 0})` },
                        { id: 'failed', label: `Failed (${summary?.failedCalls?.length ?? 0})` },
                        { id: 'expensive', label: 'Heaviest' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCallLogFilter(tab.id)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                          callLogFilter === tab.id
                            ? 'bg-white/[0.1] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleCallList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    {callLogFilter === 'failed'
                      ? 'No failed AI or tool calls recorded since server started.'
                      : 'No AI calls recorded yet since server started.'}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                    {visibleCallList.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedCall(entry)}
                        className="w-full text-left px-3 py-2.5 rounded-lg bg-[#0d1320] hover:bg-[#121a2c] border border-white/[0.06] flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {renderCallStatusBadge(entry.status)}
                            <span className="text-xs font-mono text-slate-100 truncate">
                              {entry.model}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              · {PURPOSE_LABELS[entry.purpose] || entry.purpose}
                            </span>
                          </div>
                          {entry.status !== 'ok' && entry.errorMessage ? (
                            <div className="text-[11px] font-mono text-rose-300/90 truncate">
                              {entry.errorStatusCode ? `[${entry.errorStatusCode}] ` : ''}
                              {entry.errorMessage}
                            </div>
                          ) : (
                            <div className="text-[10px] font-mono text-slate-500 tabular-nums">
                              {formatTimeShort(entry.timestampMs)} · {entry.durationMs}ms
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right font-mono tabular-nums">
                            <div className="text-xs font-semibold text-slate-200">
                              {entry.totalTokens.toLocaleString()} tok
                              {entry.isEstimated && (
                                <span className="text-[10px] font-normal text-amber-400 ml-1">~est</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {entry.status !== 'ok' ? formatTimeShort(entry.timestampMs) : `${entry.promptTokens}+${entry.completionTokens}`}
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Breakdown by Model & Purpose */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-2.5">
                  <h2 className="text-xs font-semibold text-white">By Model</h2>
                  {!summary?.byModel || summary.byModel.length === 0 ? (
                    <div className="py-5 text-center text-xs text-slate-500">No model activity yet.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {summary.byModel.map((m) => (
                        <div
                          key={`${m.provider}:${m.model}`}
                          className="px-2.5 py-2 rounded-lg bg-[#0d1320] border border-white/[0.05] flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-slate-200 truncate">{m.model}</div>
                            <div className="text-[10px] font-mono tabular-nums text-slate-500">
                              <span className="text-emerald-400">{m.total.succeeded} ok</span>
                              {' · '}
                              <span className={m.total.failed > 0 ? 'text-rose-400' : ''}>
                                {m.total.failed} failed
                              </span>
                              {m.total.rateLimited > 0 && (
                                <span className="text-amber-400"> · {m.total.rateLimited} 429</span>
                              )}
                            </div>
                          </div>
                          <div className="font-mono tabular-nums text-slate-200 font-semibold shrink-0">
                            {m.total.tokens.toLocaleString()} tok
                            {m.total.estimatedTokens > 0 && (
                              <span className="text-[10px] font-normal text-amber-400 ml-1">~est</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-2.5">
                  <h2 className="text-xs font-semibold text-white">By Purpose</h2>
                  <div className="space-y-1.5">
                    {purposeEntries.map(({ key, label, stats }) => (
                      <div
                        key={key}
                        className="px-2.5 py-2 rounded-lg bg-[#0d1320] border border-white/[0.05] flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-300 font-medium truncate">{label}</span>
                        <div className="flex items-center gap-2.5 font-mono tabular-nums shrink-0">
                          <span className="text-emerald-400">{stats.succeeded} ok</span>
                          {stats.failed > 0 && <span className="text-rose-400">{stats.failed} fail</span>}
                          <span className="text-white font-semibold">
                            {stats.totalTokens.toLocaleString()} tok
                            {stats.estimatedTokens > 0 && (
                              <span className="text-[10px] font-normal text-amber-400 ml-0.5">~est</span>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'tools' ? (
            /* ============================================================ */
            /* TAB 2: COMPACT TOOL CARDS WITH PER-TOOL TEST                 */
            /* ============================================================ */
            <div className="space-y-3">
              {tools.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">No tools registered.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tools.map((tool) => {
                    const testResult = toolTestResults[tool.name];
                    const isTesting = testingTool === tool.name;

                    return (
                      <div
                        key={tool.name}
                        className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] flex flex-col justify-between gap-3"
                      >
                        {/* Top row: Name + permission/category + description + On/Off switch */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h2 className="text-xs font-semibold text-white">{tool.displayName}</h2>
                              <span className="text-[11px] font-mono text-slate-400">{tool.name}</span>
                              {tool.category && (
                                <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[9px] font-mono uppercase text-slate-300">
                                  {tool.category}
                                </span>
                              )}
                              {tool.permissionLevel && (
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase ${
                                    tool.permissionLevel === 'sensitive'
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                      : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                                  }`}
                                >
                                  {tool.permissionLevel}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                              {tool.description}
                            </p>
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={tool.enabled}
                            aria-label={`Toggle ${tool.displayName}`}
                            onClick={() => handleToggleTool(tool)}
                            disabled={togglingTool === tool.name}
                            className="min-w-[44px] min-h-[44px] -mr-1 -mt-1 flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            <span
                              className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 inline-flex items-center ${
                                tool.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                                  tool.enabled ? 'translate-x-4.5' : 'translate-x-0'
                                }`}
                              />
                            </span>
                          </button>
                        </div>

                        {/* Metrics strip */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2.5 border-t border-white/[0.06] text-[11px] font-mono tabular-nums">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Calls</span>
                            <span className="text-slate-200">
                              {tool.callsToday} today / {tool.totalCalls} total
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Success</span>
                            <span
                              className={
                                tool.successRate === null
                                  ? 'text-slate-500'
                                  : tool.successRate >= 80
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }
                            >
                              {tool.successRate !== null ? `${tool.successRate}%` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Avg time</span>
                            <span className="text-slate-200">
                              {tool.totalCalls > 0 ? `${tool.avgDurationMs}ms` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Last used</span>
                            <span className="text-slate-200">{formatTimeShort(tool.lastUsedAt)}</span>
                          </div>
                        </div>

                        {/* Last Error (if any) */}
                        {tool.lastError && (
                          <div className="text-[11px] font-mono text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-1.5 break-words">
                            Last error: {tool.lastError}
                          </div>
                        )}

                        {/* Live Test Result */}
                        {testResult && (
                          <div
                            className={`text-[11px] rounded-lg px-2.5 py-2 border space-y-1 ${
                              testResult.success
                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                                : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                {testResult.success ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                )}
                                <span>{testResult.success ? 'Test passed' : 'Test failed'}</span>
                              </span>
                              <span className="font-mono text-[10px] tabular-nums opacity-80">
                                {testResult.durationMs}ms
                              </span>
                            </div>
                            <p className="text-[11px] break-words leading-snug opacity-95">
                              {testResult.message}
                            </p>
                            {testResult.preview && (
                              <p className="text-[10px] font-mono opacity-75 truncate">
                                {testResult.preview}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Card Footer: Status + Test button */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                            {tool.enabled && tool.available ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Active</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-slate-500" />
                                <span className="text-slate-400">
                                  {tool.enabled ? 'Unavailable' : 'Disabled'}
                                </span>
                              </>
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleTestTool(tool)}
                            disabled={isTesting}
                            className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {isTesting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span>{isTesting ? 'Testing…' : 'Test'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ============================================================ */
            /* TAB 3: OWNER SECURITY & AUDIT LOG                            */
            /* ============================================================ */
            <div className="space-y-4">
              {/* Security Posture Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">
                    {securityStatus?.setup?.authConfigured ? 'Owner Binding' : 'Access Mode'}
                  </div>
                  <div className="text-sm font-semibold text-white mt-1 truncate">
                    {securityStatus?.setup?.authConfigured
                      ? securityStatus.setup.ownerUserIdConfigured
                        ? 'OWNER_USER_ID'
                        : securityStatus.setup.ownerEmailConfigured
                        ? 'OWNER_EMAIL'
                        : 'app_metadata'
                      : 'Development Mode'}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-1 truncate">
                    {securityStatus?.setup?.authConfigured
                      ? `Server-verified · TTL ${securityStatus?.auth?.cacheTtlMs ?? 5000}ms`
                      : 'Open local access · Login not required'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">AI Gateway</div>
                  <div className="text-sm font-semibold text-white mt-1 truncate">
                    {securityStatus?.gateway?.reachable
                      ? 'LiteLLM Online'
                      : securityStatus?.gatewayEnforced
                      ? 'Enforced (Offline)'
                      : securityStatus?.gatewayActive
                      ? 'LiteLLM Unreachable'
                      : 'Direct Gemini'}
                  </div>
                  <div
                    className={`text-[11px] font-mono mt-1 truncate ${
                      securityStatus?.gateway?.reachable
                        ? 'text-emerald-400'
                        : securityStatus?.gatewayEnforced
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {securityStatus?.gateway?.reachable
                      ? `${securityStatus.gatewayEnforced ? 'Enforced · ' : ''}${securityStatus.gateway.latencyMs}ms`
                      : securityStatus?.gateway?.error || 'Voice TTS & Live direct'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Rate Limiting</div>
                  <div className="text-sm font-semibold text-white mt-1 truncate">
                    {securityStatus?.rateLimiting?.mode === 'upstash_redis'
                      ? 'Upstash Redis'
                      : securityStatus?.rateLimiting?.mode === 'fail_closed_unavailable'
                      ? 'Fail-Closed (503)'
                      : securityStatus?.rateLimiting?.mode === 'degraded_memory_fallback'
                      ? 'Degraded Memory'
                      : 'In-Memory'}
                  </div>
                  <div
                    className={`text-[11px] font-mono mt-1 truncate ${
                      securityStatus?.rateLimiting?.upstashHealth?.reachable
                        ? 'text-emerald-400'
                        : securityStatus?.rateLimiting?.upstashConfigured
                        ? 'text-rose-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {securityStatus?.rateLimiting?.upstashHealth?.reachable
                      ? `Upstash ${securityStatus.rateLimiting.upstashHealth.latencyMs}ms · ${securityStatus.rateLimiting.failClosedPolicy || 'critical_prod'}`
                      : securityStatus?.rateLimiting?.upstashConfigured
                      ? `Upstash down (${securityStatus.rateLimiting.failClosedPolicy || 'critical_prod'})`
                      : `No Redis (${securityStatus?.rateLimiting?.activeMemoryBuckets ?? 0} keys)`}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Audit Persistence</div>
                  <div className="text-sm font-semibold text-white mt-1 truncate">
                    {securityStatus?.auditPersistence?.mode === 'supabase_durable'
                      ? 'Supabase Durable'
                      : 'In-Memory Only'}
                  </div>
                  <div
                    className={`text-[11px] font-mono mt-1 truncate ${
                      securityStatus?.auditPersistence?.mode === 'supabase_durable' &&
                      !securityStatus?.auditPersistence?.lastPersistenceError
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {securityStatus?.auditPersistence?.mode === 'supabase_durable'
                      ? securityStatus.auditPersistence.lastPersistenceError
                        ? `DB Err: ${securityStatus.auditPersistence.lastPersistenceError}`
                        : `${securityStatus.auditPersistence.persistedCount} written · RLS on`
                      : 'Resets on restart'}
                  </div>
                </div>
              </div>

              {/* Infrastructure Warnings (Honest Status) */}
              {((securityStatus?.gatewayEnforced && !securityStatus?.gateway?.reachable) ||
                (securityStatus?.rateLimiting?.upstashConfigured &&
                  !securityStatus?.rateLimiting?.upstashHealth?.reachable) ||
                securityStatus?.auditPersistence?.mode === 'in_memory_only') && (
                <div className="p-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/25 text-[11px] text-amber-200/90 space-y-1">
                  {securityStatus?.gatewayEnforced && !securityStatus?.gateway?.reachable && (
                    <div className="flex items-start gap-2 text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>LiteLLM Gateway Enforced & Unreachable:</strong>{' '}
                        {securityStatus.gateway?.error || 'Text chat fails closed until the private gateway responds.'}
                      </span>
                    </div>
                  )}
                  {securityStatus?.rateLimiting?.upstashConfigured &&
                    !securityStatus?.rateLimiting?.upstashHealth?.reachable && (
                      <div className="flex items-start gap-2 text-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          <strong>Upstash Redis Unreachable:</strong>{' '}
                          {securityStatus.rateLimiting.upstashHealth?.error ||
                            securityStatus.rateLimiting.lastUpstashError ||
                            'Distributed rate limiter degraded.'}
                        </span>
                      </div>
                    )}
                  {securityStatus?.auditPersistence?.mode === 'in_memory_only' && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Audit logs are currently in-memory only. Configure{' '}
                        <code className="font-mono text-amber-100">SUPABASE_SERVICE_ROLE_KEY</code> and create{' '}
                        <code className="font-mono text-amber-100">jexa_security_audit_logs</code> for durable storage.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Gateway Errors (Scrubbed) */}
              {securityStatus?.recentGatewayErrors && securityStatus.recentGatewayErrors.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-rose-500/25 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold text-rose-300">Recent Gateway Errors</h2>
                    <span className="text-[11px] font-mono text-slate-400">
                      {securityStatus.recentGatewayErrors.length} recent
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {securityStatus.recentGatewayErrors.map((gErr) => (
                      <div
                        key={gErr.id}
                        className="px-2.5 py-2 rounded-lg bg-[#0d1320] border border-white/[0.06] text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono text-slate-400">
                          <span className="text-rose-300 truncate">
                            {gErr.model}
                            {gErr.statusCode ? ` · HTTP ${gErr.statusCode}` : ''}
                            {gErr.code ? ` · ${gErr.code}` : ''}
                          </span>
                          <span className="shrink-0">{formatTimeShort(gErr.timestampMs)}</span>
                        </div>
                        <div className="text-slate-300 break-words">{gErr.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 24h Security Activity KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Owner Logins (24h)</div>
                  <div className="text-xl font-semibold text-emerald-400 font-mono tabular-nums mt-1">
                    {securityCounts24h?.ownerLogins ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Failed Logins (24h)</div>
                  <div
                    className={`text-xl font-semibold font-mono tabular-nums mt-1 ${
                      (securityCounts24h?.failedAuthAttempts ?? 0) > 0
                        ? 'text-amber-300'
                        : 'text-slate-200'
                    }`}
                  >
                    {securityCounts24h?.failedAuthAttempts ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Blocked Admin (24h)</div>
                  <div
                    className={`text-xl font-semibold font-mono tabular-nums mt-1 ${
                      (securityCounts24h?.unauthorizedAdminAttempts ?? 0) > 0
                        ? 'text-rose-400'
                        : 'text-slate-200'
                    }`}
                  >
                    {securityCounts24h?.unauthorizedAdminAttempts ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08]">
                  <div className="text-[11px] font-medium text-slate-400">Config Actions (24h)</div>
                  <div className="text-xl font-semibold text-cyan-300 font-mono tabular-nums mt-1">
                    {securityCounts24h?.configChanges ?? 0}
                  </div>
                </div>
              </div>

              {/* Audit Events List */}
              <div className="p-3.5 rounded-xl bg-[#0b101b] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-xs font-semibold text-white">Security Audit Log</h2>
                    <p className="text-[11px] text-slate-400">
                      Authentication, blocked unauthorized admin requests, and configuration changes (credentials stripped).
                    </p>
                  </div>
                  <div className="inline-flex p-0.5 rounded-lg bg-[#0d1320] border border-white/[0.07]">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'auth', label: 'Auth' },
                        { id: 'blocked', label: 'Blocked' },
                        { id: 'config', label: 'Config' },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSecurityFilter(cat.id)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                          securityFilter === cat.id
                            ? 'bg-white/[0.1] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredSecurityEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No matching security events recorded yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
                    {filteredSecurityEvents.map((ev) => {
                      const badgeCls =
                        ev.severity === 'critical'
                          ? 'text-rose-300 bg-rose-500/15 border-rose-500/30'
                          : ev.severity === 'warning'
                          ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                          : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';

                      return (
                        <div
                          key={ev.id}
                          className="px-3 py-2.5 rounded-lg bg-[#0d1320] border border-white/[0.06] space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase shrink-0 ${badgeCls}`}
                              >
                                {ev.severity}
                              </span>
                              <span className="text-xs font-mono text-white truncate">
                                {ev.eventType}
                              </span>
                              {ev.statusCode ? (
                                <span className="text-[11px] font-mono text-slate-400">
                                  HTTP {ev.statusCode}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">
                              {formatTimeShort(ev.timestampMs)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 break-words">{ev.summary}</div>
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2 flex-wrap">
                            {ev.actorEmail && <span>Actor: {ev.actorEmail}</span>}
                            {ev.actorRole && <span>Role: {ev.actorRole}</span>}
                            {ev.method && ev.path && (
                              <span>
                                Route: {ev.method} {ev.path}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Detail Modal (Full Error Status + Message + Breakdown) */}
      {selectedCall && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe"
          onClick={() => setSelectedCall(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Call details"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#0b101b] border border-white/[0.12] p-4 sm:p-5 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {renderCallStatusBadge(selectedCall.status)}
                  <h3 className="text-sm font-semibold font-mono text-white truncate">
                    {selectedCall.model}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {PURPOSE_LABELS[selectedCall.purpose] || selectedCall.purpose} ·{' '}
                  {new Date(selectedCall.timestampMs).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                aria-label="Close call details"
                className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-[#0d1320] border border-white/[0.06]">
                <div className="text-[10px] font-sans text-slate-400">Duration</div>
                <div className="text-white mt-0.5">{selectedCall.durationMs} ms</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1320] border border-white/[0.06]">
                <div className="text-[10px] font-sans text-slate-400">Tokens</div>
                <div className="text-white mt-0.5">
                  {selectedCall.totalTokens.toLocaleString()}{' '}
                  <span className="text-[10px] text-amber-400">
                    {selectedCall.isEstimated ? '(~est)' : '(measured)'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1320] border border-white/[0.06] col-span-2 sm:col-span-1">
                <div className="text-[10px] font-sans text-slate-400">In / Out</div>
                <div className="text-white mt-0.5">
                  {selectedCall.promptTokens.toLocaleString()} / {selectedCall.completionTokens.toLocaleString()}
                </div>
              </div>
            </div>

            {selectedCall.messageId && (
              <div className="text-[11px] font-mono text-slate-400">
                Message ID: <span className="text-slate-200">{selectedCall.messageId}</span>
              </div>
            )}

            {(selectedCall.errorStatusCode ||
              selectedCall.errorCode ||
              selectedCall.errorMessage ||
              selectedCall.errorDetails) && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-rose-300">
                  <span>Error Details</span>
                  <span className="font-mono text-[11px]">
                    {selectedCall.errorStatusCode ? `Status ${selectedCall.errorStatusCode}` : ''}
                    {selectedCall.errorStatusCode && selectedCall.errorCode ? ' · ' : ''}
                    {selectedCall.errorCode || ''}
                  </span>
                </div>
                {selectedCall.errorMessage && (
                  <p className="text-xs text-rose-100 break-words leading-relaxed">
                    {selectedCall.errorMessage}
                  </p>
                )}
                {selectedCall.errorDetails && selectedCall.errorDetails !== selectedCall.errorMessage && (
                  <pre className="p-2 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] font-mono text-rose-200/90 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {selectedCall.errorDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
