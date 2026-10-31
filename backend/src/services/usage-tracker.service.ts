import crypto from 'node:crypto';
import { getSupabaseClient } from '../database/supabase';

export type UsagePurpose =
  | 'chat'
  | 'tool_round'
  | 'memory_extraction'
  | 'style_learner'
  | 'search_decision'
  | 'voice_tts'
  | 'tool_execution'
  | 'tavily_search';

export type UsageStatus = 'ok' | 'rate_limited' | 'error';

export interface AIUsageEntry {
  id: string;
  timestampMs: number;
  createdAt: string;
  provider: string;
  model: string;
  purpose: UsagePurpose;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimated: boolean;
  durationMs: number;
  status: UsageStatus;
  messageId?: string;
  toolName?: string;
  tavilyCredits?: number;
  metadata?: Record<string, any>;
}

export interface RecordAICallParams {
  provider: string;
  model: string;
  purpose: UsagePurpose;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  isEstimated?: boolean;
  durationMs: number;
  status: UsageStatus;
  messageId?: string;
  promptChars?: number;
  completionChars?: number;
  metadata?: Record<string, any>;
}

export interface MinuteBucket {
  minute: string;
  timestampMs: number;
  requests: number;
  tokens: number;
  errors: number;
}

export interface DayBucket {
  date: string;
  timestampMs: number;
  requests: number;
  tokens: number;
  credits: number;
  errors: number;
}

export interface UsageSummaryResponse {
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
  last14Days: DayBucket[];
  byPurpose: Record<string, { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; errors: number }>;
  byProvider: Record<string, Record<string, { requests: number; tokens: number; errors: number }>>;
  rateLimit429Count: number;
  mostExpensiveMessages: Array<{
    id: string;
    messageId?: string;
    provider: string;
    model: string;
    purpose: UsagePurpose;
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

export class UsageTracker {
  private static readonly MAX_MEMORY_ENTRIES = 2000;
  private static inMemoryLog: AIUsageEntry[] = [];

  /**
   * Records an AI or tool invocation.
   * NEVER throws, never blocks the event loop, and writes to database in the background.
   */
  public static recordAICall(params: RecordAICallParams): void {
    try {
      const now = Date.now();
      const hasProviderTokens =
        typeof params.promptTokens === 'number' &&
        typeof params.completionTokens === 'number' &&
        (params.promptTokens > 0 || params.completionTokens > 0);

      let promptTokens = params.promptTokens ?? 0;
      let completionTokens = params.completionTokens ?? 0;
      let isEstimated = params.isEstimated ?? !hasProviderTokens;

      if (!hasProviderTokens) {
        if (typeof params.promptChars === 'number' && params.promptChars > 0) {
          promptTokens = Math.ceil(params.promptChars / 4);
        }
        if (typeof params.completionChars === 'number' && params.completionChars > 0) {
          completionTokens = Math.ceil(params.completionChars / 4);
        }
        isEstimated = true;
      }

      const totalTokens = params.totalTokens ?? promptTokens + completionTokens;

      const entry: AIUsageEntry = {
        id: crypto.randomUUID(),
        timestampMs: now,
        createdAt: new Date(now).toISOString(),
        provider: params.provider || 'unknown',
        model: params.model || 'unknown',
        purpose: params.purpose,
        promptTokens,
        completionTokens,
        totalTokens,
        isEstimated,
        durationMs: Math.max(0, Math.round(params.durationMs || 0)),
        status: params.status || 'ok',
        messageId: params.messageId,
        metadata: params.metadata,
      };

      this.addEntry(entry);
    } catch (err: any) {
      console.warn('[UsageTracker] Failed to record AI call:', err.message);
    }
  }

  /**
   * Records a tool execution (name, duration, success)
   */
  public static recordToolExecution(
    toolName: string,
    durationMs: number,
    success: boolean,
    error?: string,
    messageId?: string
  ): void {
    try {
      const now = Date.now();
      const entry: AIUsageEntry = {
        id: crypto.randomUUID(),
        timestampMs: now,
        createdAt: new Date(now).toISOString(),
        provider: 'tool',
        model: toolName,
        purpose: 'tool_execution',
        toolName,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        isEstimated: false,
        durationMs: Math.max(0, Math.round(durationMs || 0)),
        status: success ? 'ok' : 'error',
        messageId,
        metadata: error ? { error } : undefined,
      };

      this.addEntry(entry);
    } catch (err: any) {
      console.warn('[UsageTracker] Failed to record tool execution:', err.message);
    }
  }

  /**
   * Records a Tavily search call with its credits
   */
  public static recordTavilyCall(
    query: string,
    credits: number,
    durationMs: number,
    success: boolean,
    error?: string
  ): void {
    try {
      const now = Date.now();
      const entry: AIUsageEntry = {
        id: crypto.randomUUID(),
        timestampMs: now,
        createdAt: new Date(now).toISOString(),
        provider: 'tavily',
        model: 'tavily-search',
        purpose: 'tavily_search',
        tavilyCredits: credits || 1,
        promptTokens: Math.ceil(query.length / 4),
        completionTokens: 0,
        totalTokens: Math.ceil(query.length / 4),
        isEstimated: true,
        durationMs: Math.max(0, Math.round(durationMs || 0)),
        status: success ? 'ok' : 'error',
        metadata: { query: query.slice(0, 100), error },
      };

      this.addEntry(entry);
    } catch (err: any) {
      console.warn('[UsageTracker] Failed to record Tavily call:', err.message);
    }
  }

  /**
   * Adds entry to memory and queues background Supabase persistence
   */
  private static addEntry(entry: AIUsageEntry): void {
    this.inMemoryLog.push(entry);
    if (this.inMemoryLog.length > this.MAX_MEMORY_ENTRIES) {
      this.inMemoryLog = this.inMemoryLog.slice(-this.MAX_MEMORY_ENTRIES);
    }

    // Background asynchronous database write (never blocking)
    queueMicrotask(() => {
      this.persistToSupabase(entry).catch(() => {
        // Silently catch database write failures
      });
    });
  }

  private static async persistToSupabase(entry: AIUsageEntry): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      await supabase.from('ai_usage_log').insert({
        id: entry.id,
        timestamp_ms: entry.timestampMs,
        provider: entry.provider,
        model: entry.model,
        purpose: entry.purpose,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        total_tokens: entry.totalTokens,
        is_estimated: entry.isEstimated,
        duration_ms: entry.durationMs,
        status: entry.status,
        message_id: entry.messageId || null,
        tool_name: entry.toolName || null,
        tavily_credits: entry.tavilyCredits || 0,
        metadata: entry.metadata || {},
        created_at: entry.createdAt,
      });
    } catch {
      // Ignored: Supabase write failed, in-memory log remains authoritative
    }
  }

  /**
   * Computes complete summary for owner-only analytics API
   */
  public static getSummary(): UsageSummaryResponse {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    // 1. Last minute aggregates
    let lastMinReqs = 0;
    let lastMinPrompt = 0;
    let lastMinComp = 0;
    let lastMinTotal = 0;

    // 2. Today aggregates
    let todayReqs = 0;
    let todayPrompt = 0;
    let todayComp = 0;
    let todayTotal = 0;
    let todayEstimated = 0;
    let todayCredits = 0;
    let today429s = 0;

    // 3. Overall 429s
    let total429s = 0;

    // 4. Monthly Tavily credits
    let tavilyCreditsThisMonth = 0;

    // 5. Purpose & Provider Breakdowns
    const byPurpose: Record<string, { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; errors: number }> = {};
    const byProvider: Record<string, Record<string, { requests: number; tokens: number; errors: number }>> = {};

    // 6. Sliding second & minute peak detectors
    const secondBuckets = new Map<number, { requests: number; tokens: number }>();
    const minuteBucketsAll = new Map<number, { requests: number; tokens: number }>();

    // 7. Last 30 minutes 1-minute buckets
    // Initialize 30 buckets for every minute
    const last30Minutes: MinuteBucket[] = [];
    for (let i = 29; i >= 0; i--) {
      const bucketTime = Math.floor((now - i * 60 * 1000) / 60000) * 60000;
      const d = new Date(bucketTime);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      last30Minutes.push({
        minute: `${hours}:${mins}`,
        timestampMs: bucketTime,
        requests: 0,
        tokens: 0,
        errors: 0,
      });
    }

    // 8. Last 14 days buckets
    const last14Days: DayBucket[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayTime = new Date(startOfTodayMs - i * 86400 * 1000);
      const dateStr = dayTime.toISOString().slice(5, 10); // MM-DD
      last14Days.push({
        date: dateStr,
        timestampMs: dayTime.getTime(),
        requests: 0,
        tokens: 0,
        credits: 0,
        errors: 0,
      });
    }

    // Process all in-memory entries
    for (const entry of this.inMemoryLog) {
      const isRateLimited = entry.status === 'rate_limited';
      const isError = entry.status === 'error';

      if (isRateLimited) {
        total429s++;
      }

      // Monthly credits
      if (entry.timestampMs >= startOfMonthMs && entry.tavilyCredits) {
        tavilyCreditsThisMonth += entry.tavilyCredits;
      }

      // Last minute
      if (entry.timestampMs >= oneMinuteAgo) {
        lastMinReqs++;
        lastMinPrompt += entry.promptTokens;
        lastMinComp += entry.completionTokens;
        lastMinTotal += entry.totalTokens;
      }

      // Today
      if (entry.timestampMs >= startOfTodayMs) {
        todayReqs++;
        todayPrompt += entry.promptTokens;
        todayComp += entry.completionTokens;
        todayTotal += entry.totalTokens;
        if (entry.isEstimated) todayEstimated += entry.totalTokens;
        if (entry.tavilyCredits) todayCredits += entry.tavilyCredits;
        if (isRateLimited) today429s++;
      }

      // Purpose breakdown
      if (!byPurpose[entry.purpose]) {
        byPurpose[entry.purpose] = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0 };
      }
      byPurpose[entry.purpose].requests++;
      byPurpose[entry.purpose].promptTokens += entry.promptTokens;
      byPurpose[entry.purpose].completionTokens += entry.completionTokens;
      byPurpose[entry.purpose].totalTokens += entry.totalTokens;
      if (isError || isRateLimited) byPurpose[entry.purpose].errors++;

      // Provider & model breakdown
      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = {};
      }
      if (!byProvider[entry.provider][entry.model]) {
        byProvider[entry.provider][entry.model] = { requests: 0, tokens: 0, errors: 0 };
      }
      byProvider[entry.provider][entry.model].requests++;
      byProvider[entry.provider][entry.model].tokens += entry.totalTokens;
      if (isError || isRateLimited) byProvider[entry.provider][entry.model].errors++;

      // Peak second (1000ms window)
      const secKey = Math.floor(entry.timestampMs / 1000) * 1000;
      const secData = secondBuckets.get(secKey) || { requests: 0, tokens: 0 };
      secData.requests++;
      secData.tokens += entry.totalTokens;
      secondBuckets.set(secKey, secData);

      // Peak minute (60,000ms window)
      const minKey = Math.floor(entry.timestampMs / 60000) * 60000;
      const minData = minuteBucketsAll.get(minKey) || { requests: 0, tokens: 0 };
      minData.requests++;
      minData.tokens += entry.totalTokens;
      minuteBucketsAll.set(minKey, minData);

      // 30 min bucket
      if (entry.timestampMs >= thirtyMinutesAgo) {
        const bucketIndex = last30Minutes.findIndex(
          (b) => entry.timestampMs >= b.timestampMs && entry.timestampMs < b.timestampMs + 60000
        );
        if (bucketIndex !== -1) {
          last30Minutes[bucketIndex].requests++;
          last30Minutes[bucketIndex].tokens += entry.totalTokens;
          if (isError || isRateLimited) last30Minutes[bucketIndex].errors++;
        }
      }

      // 14 day bucket
      const dayIndex = last14Days.findIndex(
        (d) => entry.timestampMs >= d.timestampMs && entry.timestampMs < d.timestampMs + 86400 * 1000
      );
      if (dayIndex !== -1) {
        last14Days[dayIndex].requests++;
        last14Days[dayIndex].tokens += entry.totalTokens;
        if (entry.tavilyCredits) last14Days[dayIndex].credits += entry.tavilyCredits;
        if (isError || isRateLimited) last14Days[dayIndex].errors++;
      }
    }

    // Find busiest second
    let busiestSecond = { timestampMs: now, requests: 0, tokens: 0 };
    for (const [ts, data] of secondBuckets.entries()) {
      if (data.requests > busiestSecond.requests || (data.requests === busiestSecond.requests && data.tokens > busiestSecond.tokens)) {
        busiestSecond = { timestampMs: ts, requests: data.requests, tokens: data.tokens };
      }
    }

    // Find busiest minute
    let busiestMinute = { timestampMs: now, requests: 0, tokens: 0 };
    for (const [ts, data] of minuteBucketsAll.entries()) {
      if (data.requests > busiestMinute.requests || (data.requests === busiestMinute.requests && data.tokens > busiestMinute.tokens)) {
        busiestMinute = { timestampMs: ts, requests: data.requests, tokens: data.tokens };
      }
    }

    // Most expensive messages (top 15 sorted by totalTokens desc)
    const expensiveCandidates = this.inMemoryLog
      .filter((e) => e.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 15)
      .map((e) => ({
        id: e.id,
        messageId: e.messageId,
        provider: e.provider,
        model: e.model,
        purpose: e.purpose,
        totalTokens: e.totalTokens,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        isEstimated: e.isEstimated,
        durationMs: e.durationMs,
        timestampMs: e.timestampMs,
        createdAt: e.createdAt,
      }));

    return {
      lastMinute: {
        requests: lastMinReqs,
        promptTokens: lastMinPrompt,
        completionTokens: lastMinComp,
        totalTokens: lastMinTotal,
      },
      busiestSecond,
      busiestMinute,
      last30Minutes,
      today: {
        requests: todayReqs,
        promptTokens: todayPrompt,
        completionTokens: todayComp,
        totalTokens: todayTotal,
        estimatedTokens: todayEstimated,
        tavilyCredits: todayCredits,
        rateLimit429Count: today429s,
      },
      last14Days,
      byPurpose,
      byProvider,
      rateLimit429Count: total429s,
      mostExpensiveMessages: expensiveCandidates,
      tavilyCreditsThisMonth,
      totalEntriesRecorded: this.inMemoryLog.length,
    };
  }
}
