import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Activity,
  RefreshCw,
  Wrench,
  AlertTriangle,
  Zap,
  Globe,
  Clock,
  Sliders,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { ApiClient } from '../../services/api.client';
import { safeStorage } from '../../services/storage';

interface ToolsPanelProps {
  onBack: () => void;
}

interface MinuteBucket {
  minute: string;
  timestampMs: number;
  requests: number;
  tokens: number;
  errors: number;
}

interface UsageSummary {
  lastMinute: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedTokens: number;
    tavilyCredits: number;
    rateLimit429Count: number;
  };
  byPurpose: Record<
    string,
    {
      requests: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      errors: number;
    }
  >;
  byProvider: Record<
    string,
    Record<string, { requests: number; tokens: number; errors: number }>
  >;
  rateLimit429Count: number;
  mostExpensiveMessages: Array<{
    id: string;
    messageId?: string;
    provider: string;
    model: string;
    purpose: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    isEstimated: boolean;
    durationMs: number;
    timestampMs: number;
    createdAt: string;
  }>;
  tavilyCreditsThisMonth: number;
  totalEntriesRecorded: number;
}

interface ToolStatusItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  permissionLevel: string;
  enabled: boolean;
  available: boolean;
  callsToday: number;
  avgDurationMs: number;
  lastError?: string | null;
}

interface GeminiLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  tpd: number;
}

const DEFAULT_LIMITS: GeminiLimits = {
  rpm: 15,
  tpm: 250000,
  rpd: 1500,
  tpd: 1000000,
};

const LIMITS_STORAGE_KEY = 'jexa_gemini_limits';

function loadSavedLimits(): GeminiLimits {
  try {
    const raw = safeStorage.getItem(LIMITS_STORAGE_KEY);
    if (!raw) return DEFAULT_LIMITS;
    const parsed = JSON.parse(raw);
    return {
      rpm: Number(parsed.rpm) > 0 ? Number(parsed.rpm) : DEFAULT_LIMITS.rpm,
      tpm: Number(parsed.tpm) > 0 ? Number(parsed.tpm) : DEFAULT_LIMITS.tpm,
      rpd: Number(parsed.rpd) > 0 ? Number(parsed.rpd) : DEFAULT_LIMITS.rpd,
      tpd: Number(parsed.tpd) > 0 ? Number(parsed.tpd) : DEFAULT_LIMITS.tpd,
    };
  } catch {
    return DEFAULT_LIMITS;
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
  tavily_search: 'Tavily Web Search',
};

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ onBack }) => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [tools, setTools] = useState<ToolStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingTool, setTogglingTool] = useState<string | null>(null);

  const [limits, setLimits] = useState<GeminiLimits>(loadSavedLimits);
  const [editingLimits, setEditingLimits] = useState(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    try {
      const [usageRes, toolsRes] = await Promise.all([
        ApiClient.getUsageSummary(),
        ApiClient.getToolsStatus(),
      ]);
      setSummary(usageRes);
      setTools(toolsRes?.tools || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Tools and Token Tracker data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

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

  const handleLimitChange = (key: keyof GeminiLimits, value: string) => {
    const num = Math.max(1, parseInt(value, 10) || 0);
    const updated = { ...limits, [key]: num };
    setLimits(updated);
    try {
      safeStorage.setItem(LIMITS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const renderLimitMeter = (label: string, current: number, limit: number) => {
    const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
    const rawPct = limit > 0 ? (current / limit) * 100 : 0;
    const barColor =
      rawPct >= 100
        ? 'bg-rose-500'
        : rawPct >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';
    const textColor =
      rawPct >= 100
        ? 'text-rose-400'
        : rawPct >= 80
        ? 'text-amber-400'
        : 'text-emerald-400';

    return (
      <div className="p-2.5 rounded-xl bg-black/35 border border-white/[0.06] space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-300">{label}</span>
          <span className={`font-mono font-semibold ${textColor}`}>
            {current.toLocaleString()} / {limit.toLocaleString()} ({Math.round(rawPct)}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
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

  const aiPurposes = ['chat', 'tool_round', 'memory_extraction', 'style_learner', 'search_decision', 'voice_tts'];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06] bg-[#080b12] shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Back to chat"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-4 w-px bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-semibold text-white">Tools &amp; AI Token Tracker</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
            }`}
          >
            Auto 5s: {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-6 pb-10">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* SECTION 1: AI TOKEN TRACKER CARD                             */}
          {/* ============================================================ */}
          <section className="p-4 sm:p-5 rounded-2xl bg-[#0b101b] border border-white/[0.08] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">AI Token Tracker</h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>Entries logged: {summary?.totalEntriesRecorded ?? 0}</span>
                <span>·</span>
                <span className={summary && summary.rateLimit429Count > 0 ? 'text-amber-400 font-semibold' : ''}>
                  429 Rate Limits: {summary?.rateLimit429Count ?? 0}
                </span>
              </div>
            </div>

            {loading && !summary ? (
              <div className="py-10 text-center text-xs text-slate-400">Loading usage metrics...</div>
            ) : (
              <>
                {/* Top KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Last Minute
                    </div>
                    <div className="text-2xl font-bold text-white font-mono mt-1">
                      {(summary?.lastMinute.totalTokens ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      tokens · {summary?.lastMinute.requests ?? 0} reqs
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Today Total
                    </div>
                    <div className="text-2xl font-bold text-white font-mono mt-1">
                      {(summary?.today.totalTokens ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-cyan-400 font-mono mt-0.5">
                      tokens · {summary?.today.requests ?? 0} reqs
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Peak Burst (1s / 1m)
                    </div>
                    <div className="text-lg font-bold text-slate-100 font-mono mt-1">
                      {summary?.busiestSecond.requests ?? 0} / {summary?.busiestMinute.requests ?? 0} req
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {(summary?.busiestSecond.tokens ?? 0).toLocaleString()} / {(summary?.busiestMinute.tokens ?? 0).toLocaleString()} tok
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-cyan-400" />
                      <span>Tavily Credits (Month)</span>
                    </div>
                    <div className="text-2xl font-bold text-white font-mono mt-1">
                      {summary?.tavilyCreditsThisMonth ?? 0}
                    </div>
                    <div className="text-[11px] text-amber-400 font-mono mt-0.5">
                      429 errors today: {summary?.today.rateLimit429Count ?? 0}
                    </div>
                  </div>
                </div>

                {/* Last 30 Minutes Bar Chart */}
                <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Last 30 Minutes (Tokens &amp; Requests per Minute)</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Peak: {maxBucketTokens.toLocaleString()} tok/min
                    </span>
                  </div>
                  <div className="h-24 flex items-end gap-1 pt-2">
                    {last30.map((bucket) => {
                      const tokenHeight =
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
                          className="flex-1 h-full flex items-end group relative"
                          title={`${bucket.minute}: ${bucket.requests} reqs, ${bucket.tokens.toLocaleString()} tokens${
                            bucket.errors > 0 ? `, ${bucket.errors} errors` : ''
                          }`}
                        >
                          <div
                            className={`w-full rounded-t-sm transition-all ${barClass}`}
                            style={{ height: `${tokenHeight}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{last30[0]?.minute || '-30m'}</span>
                    <span>{last30[14]?.minute || '-15m'}</span>
                    <span>{last30[last30.length - 1]?.minute || 'Now'}</span>
                  </div>
                </div>

                {/* Editable Gemini Limit Meters */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Gemini Quota Meters (Orange ≥ 80%, Red ≥ 100%)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingLimits((v) => !v)}
                      className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      {editingLimits ? 'Done Editing' : 'Edit Limits'}
                    </button>
                  </div>

                  {editingLimits && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-white/[0.02] border border-cyan-500/20">
                      {(['rpm', 'tpm', 'rpd', 'tpd'] as Array<keyof GeminiLimits>).map((key) => (
                        <div key={key} className="space-y-1">
                          <label className="text-[10px] font-mono uppercase text-slate-400 block">
                            {key.toUpperCase()}
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={limits[key]}
                            onChange={(e) => handleLimitChange(key, e.target.value)}
                            className="w-full px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.1] text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {renderLimitMeter('RPM (Requests / min)', summary?.lastMinute.requests ?? 0, limits.rpm)}
                    {renderLimitMeter('TPM (Tokens / min)', summary?.lastMinute.totalTokens ?? 0, limits.tpm)}
                    {renderLimitMeter('RPD (Requests / day)', summary?.today.requests ?? 0, limits.rpd)}
                    {renderLimitMeter('TPD (Tokens / day)', summary?.today.totalTokens ?? 0, limits.tpd)}
                  </div>
                </div>

                {/* Breakdown by Purpose & Model */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.06] space-y-2.5">
                    <div className="text-xs font-semibold text-slate-300">Breakdown by Purpose</div>
                    <div className="space-y-1.5 text-xs">
                      {aiPurposes.map((p) => {
                        const stats = summary?.byPurpose?.[p] || {
                          requests: 0,
                          promptTokens: 0,
                          completionTokens: 0,
                          totalTokens: 0,
                          errors: 0,
                        };
                        return (
                          <div
                            key={p}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                          >
                            <span className="text-slate-300 font-medium">{PURPOSE_LABELS[p] || p}</span>
                            <div className="flex items-center gap-3 font-mono text-[11px]">
                              <span className="text-slate-400">{stats.requests} req</span>
                              <span className="text-white font-semibold">{stats.totalTokens.toLocaleString()} tok</span>
                              {stats.errors > 0 && (
                                <span className="text-rose-400">{stats.errors} err</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Most Expensive Messages */}
                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.06] space-y-2.5">
                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Most Expensive Calls</span>
                    </div>
                    {(!summary?.mostExpensiveMessages || summary.mostExpensiveMessages.length === 0) ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No AI calls recorded yet in this session.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {summary.mostExpensiveMessages.slice(0, 8).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px]"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-mono text-slate-200 truncate">
                                {item.model}{' '}
                                <span className="text-slate-500">({PURPOSE_LABELS[item.purpose] || item.purpose})</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {new Date(item.timestampMs).toLocaleTimeString()} · {item.durationMs}ms
                                {item.isEstimated ? ' · est' : ''}
                              </div>
                            </div>
                            <span className="font-mono font-bold text-amber-300 shrink-0">
                              {item.totalTokens.toLocaleString()} tok
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ============================================================ */}
          {/* SECTION 2: BUILT-IN TOOLS LIST                               */}
          {/* ============================================================ */}
          <section className="p-4 sm:p-5 rounded-2xl bg-[#0b101b] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Built-in AI Tools ({tools.length})
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                All tools active without access keys
              </span>
            </div>

            {tools.length === 0 && !loading ? (
              <div className="py-6 text-center text-xs text-slate-500">No tools registered.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xs font-semibold text-white">{tool.displayName}</h3>
                          <span className="text-[10px] font-mono text-slate-400">{tool.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          {tool.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleTool(tool)}
                        disabled={togglingTool === tool.name}
                        className={`w-10 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                          tool.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                        aria-label={`Toggle ${tool.displayName}`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            tool.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        {tool.enabled && tool.available ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <XCircle className="w-3 h-3 text-slate-500" />
                            <span>{tool.enabled ? 'Unavailable' : 'Disabled'}</span>
                          </span>
                        )}
                        <span className="text-slate-500 uppercase">{tool.category}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        <span>{tool.callsToday} calls today</span>
                        <span>·</span>
                        <span>{tool.avgDurationMs}ms avg</span>
                      </div>
                    </div>

                    {tool.lastError && (
                      <div className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1 truncate" title={tool.lastError}>
                        Last error: {tool.lastError}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
