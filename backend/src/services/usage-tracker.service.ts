import crypto from 'node:crypto';
import { ErrorLogService } from './error-log.service';

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
  errorStatusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string;
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
  errorStatusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string;
  metadata?: Record<string, any>;
}

export interface MinuteBucket {
  minute: string;
  timestampMs: number;
  requests: number;
  succeeded: number;
  failed: number;
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

export interface UsageCallEntryView {
  id: string;
  messageId?: string;
  provider: string;
  model: string;
  purpose: UsagePurpose;
  status: UsageStatus;
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

export interface ModelUsageBreakdown {
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

export interface UsageSummaryResponse {
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
  last14Days: DayBucket[];
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
  byProvider: Record<string, Record<string, { requests: number; tokens: number; errors: number }>>;
  byModel: ModelUsageBreakdown[];
  rateLimit429Count: number;
  mostExpensiveMessages: UsageCallEntryView[];
  recentCalls: UsageCallEntryView[];
  failedCalls: UsageCallEntryView[];
  tavilyCreditsThisMonth: number;
  totalEntriesRecorded: number;
}

function scrubErrorText(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return ErrorLogService.scrubSecrets(trimmed).slice(0, 2000);
}

function toEntryView(e: AIUsageEntry): UsageCallEntryView {
  return {
    id: e.id,
    messageId: e.messageId,
    provider: e.provider,
    model: e.model,
    purpose: e.purpose,
    status: e.status,
    totalTokens: e.totalTokens,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    isEstimated: e.isEstimated,
    durationMs: e.durationMs,
    timestampMs: e.timestampMs,
    createdAt: e.createdAt,
    errorStatusCode: e.errorStatusCode,
    errorCode: e.errorCode,
    errorMessage: e.errorMessage,
    errorDetails: e.errorDetails,
  };
}

export class UsageTracker {
  private static readonly MAX_MEMORY_ENTRIES = 2000;
  private static readonly serverStartedAtMs = Date.now();
  private static readonly serverStartedAt = new Date(UsageTracker.serverStartedAtMs).toISOString();
  private static inMemoryLog: AIUsageEntry[] = [];

  /**
   * Records an AI invocation in-memory.
   * NEVER throws and never blocks the event loop.
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
      const errorMessage = scrubErrorText(
        params.errorMessage || (typeof params.metadata?.error === 'string' ? params.metadata.error : undefined)
      );
      const errorDetails = scrubErrorText(params.errorDetails);

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
        errorStatusCode: params.errorStatusCode,
        errorCode: params.errorCode,
        errorMessage,
        errorDetails,
        metadata: params.metadata ? ErrorLogService.scrubObject(params.metadata) : undefined,
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
      const cleanError = scrubErrorText(error);
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
        errorMessage: cleanError,
        metadata: cleanError ? { error: cleanError } : undefined,
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
      const cleanError = scrubErrorText(error);
      const entry: AIUsageEntry = {
        id: crypto.randomUUID(),
        timestampMs: now,
        createdAt: new Date(now).toISOString(),
        provider: 'tavily',
        model: 'tavily-search',
        purpose: 'tavily_search',
        tavilyCredits: credits || 0,
        promptTokens: Math.ceil(query.length / 4),
        completionTokens: 0,
        totalTokens: Math.ceil(query.length / 4),
        isEstimated: true,
        durationMs: Math.max(0, Math.round(durationMs || 0)),
        status: success ? 'ok' : 'error',
        errorMessage: cleanError,
        metadata: { query: query.slice(0, 100), error: cleanError },
      };

      this.addEntry(entry);
    } catch (err: any) {
      console.warn('[UsageTracker] Failed to record Tavily call:', err.message);
    }
  }

  /**
   * Adds entry to in-memory circular buffer
   */
  private static addEntry(entry: AIUsageEntry): void {
    this.inMemoryLog.push(entry);
    if (this.inMemoryLog.length > this.MAX_MEMORY_ENTRIES) {
      this.inMemoryLog = this.inMemoryLog.slice(-this.MAX_MEMORY_ENTRIES);
    }
  }

  /**
   * Computes honest analytics summary since server start
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

    // 1. Last minute aggregates (AI + Tavily calls)
    let lastMinReqs = 0;
    let lastMinSucceeded = 0;
    let lastMinFailed = 0;
    let lastMin429 = 0;
    let lastMinPrompt = 0;
    let lastMinComp = 0;
    let lastMinTotal = 0;
    let lastMinEstimated = 0;

    // 2. Today aggregates
    let todayReqs = 0;
    let todaySucceeded = 0;
    let todayFailed = 0;
    let todayPrompt = 0;
    let todayComp = 0;
    let todayTotal = 0;
    let todayEstimated = 0;
    let todayCredits = 0;
    let today429s = 0;

    // 3. Overall since server start
    let overallReqs = 0;
    let overallSucceeded = 0;
    let overallFailed = 0;
    let overallPrompt = 0;
    let overallComp = 0;
    let overallTotal = 0;
    let overallEstimated = 0;
    let total429s = 0;

    // 4. Monthly Tavily credits
    let tavilyCreditsThisMonth = 0;

    // 5. Purpose & Provider & Model Breakdowns
    const byPurpose: UsageSummaryResponse['byPurpose'] = {};
    const byProvider: Record<string, Record<string, { requests: number; tokens: number; errors: number }>> = {};
    const modelMap = new Map<string, ModelUsageBreakdown>();

    // 6. Sliding second & minute peak detectors
    const secondBuckets = new Map<number, { requests: number; tokens: number }>();
    const minuteBucketsAll = new Map<number, { requests: number; tokens: number }>();

    // 7. Last 30 minutes 1-minute buckets
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
        succeeded: 0,
        failed: 0,
        tokens: 0,
        errors: 0,
      });
    }

    // 8. Last 14 days buckets
    const last14Days: DayBucket[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayTime = new Date(startOfTodayMs - i * 86400 * 1000);
      const dateStr = dayTime.toISOString().slice(5, 10);
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
      const isFailed = entry.status === 'error' || isRateLimited;
      const isSucceeded = entry.status === 'ok';
      const isAiCall = entry.purpose !== 'tool_execution' && entry.purpose !== 'tavily_search';

      // Purpose breakdown (includes AI + tool_execution + tavily_search)
      if (!byPurpose[entry.purpose]) {
        byPurpose[entry.purpose] = {
          requests: 0,
          succeeded: 0,
          failed: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedTokens: 0,
          errors: 0,
        };
      }
      byPurpose[entry.purpose].requests++;
      if (isSucceeded) byPurpose[entry.purpose].succeeded++;
      if (isFailed) {
        byPurpose[entry.purpose].failed++;
        byPurpose[entry.purpose].errors++;
      }
      byPurpose[entry.purpose].promptTokens += entry.promptTokens;
      byPurpose[entry.purpose].completionTokens += entry.completionTokens;
      byPurpose[entry.purpose].totalTokens += entry.totalTokens;
      if (entry.isEstimated) byPurpose[entry.purpose].estimatedTokens += entry.totalTokens;

      // Monthly Tavily credits
      if (entry.timestampMs >= startOfMonthMs && entry.tavilyCredits) {
        tavilyCreditsThisMonth += entry.tavilyCredits;
      }
      if (entry.timestampMs >= startOfTodayMs && entry.tavilyCredits) {
        todayCredits += entry.tavilyCredits;
      }

      // Skip tool_execution from AI request/token totals so counts reflect real AI calls honestly
      if (!isAiCall) {
        continue;
      }

      overallReqs++;
      if (isSucceeded) overallSucceeded++;
      if (isFailed) overallFailed++;
      if (isRateLimited) total429s++;
      overallPrompt += entry.promptTokens;
      overallComp += entry.completionTokens;
      overallTotal += entry.totalTokens;
      if (entry.isEstimated) overallEstimated += entry.totalTokens;

      // Last minute
      if (entry.timestampMs >= oneMinuteAgo) {
        lastMinReqs++;
        if (isSucceeded) lastMinSucceeded++;
        if (isFailed) lastMinFailed++;
        if (isRateLimited) lastMin429++;
        lastMinPrompt += entry.promptTokens;
        lastMinComp += entry.completionTokens;
        lastMinTotal += entry.totalTokens;
        if (entry.isEstimated) lastMinEstimated += entry.totalTokens;
      }

      // Today
      if (entry.timestampMs >= startOfTodayMs) {
        todayReqs++;
        if (isSucceeded) todaySucceeded++;
        if (isFailed) todayFailed++;
        todayPrompt += entry.promptTokens;
        todayComp += entry.completionTokens;
        todayTotal += entry.totalTokens;
        if (entry.isEstimated) todayEstimated += entry.totalTokens;
        if (isRateLimited) today429s++;
      }

      // Provider & model breakdown
      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = {};
      }
      if (!byProvider[entry.provider][entry.model]) {
        byProvider[entry.provider][entry.model] = { requests: 0, tokens: 0, errors: 0 };
      }
      byProvider[entry.provider][entry.model].requests++;
      byProvider[entry.provider][entry.model].tokens += entry.totalTokens;
      if (isFailed) byProvider[entry.provider][entry.model].errors++;

      // Structured per-model breakdown (used for honest per-model quota meters)
      let mStats = modelMap.get(entry.model);
      if (!mStats) {
        mStats = {
          model: entry.model,
          provider: entry.provider,
          lastMinute: { requests: 0, succeeded: 0, failed: 0, tokens: 0, estimatedTokens: 0 },
          today: { requests: 0, succeeded: 0, failed: 0, rateLimited: 0, tokens: 0, estimatedTokens: 0 },
          total: { requests: 0, succeeded: 0, failed: 0, rateLimited: 0, tokens: 0, estimatedTokens: 0 },
        };
        modelMap.set(entry.model, mStats);
      }
      mStats.total.requests++;
      if (isSucceeded) mStats.total.succeeded++;
      if (isFailed) mStats.total.failed++;
      if (isRateLimited) mStats.total.rateLimited++;
      mStats.total.tokens += entry.totalTokens;
      if (entry.isEstimated) mStats.total.estimatedTokens += entry.totalTokens;

      if (entry.timestampMs >= oneMinuteAgo) {
        mStats.lastMinute.requests++;
        if (isSucceeded) mStats.lastMinute.succeeded++;
        if (isFailed) mStats.lastMinute.failed++;
        mStats.lastMinute.tokens += entry.totalTokens;
        if (entry.isEstimated) mStats.lastMinute.estimatedTokens += entry.totalTokens;
      }

      if (entry.timestampMs >= startOfTodayMs) {
        mStats.today.requests++;
        if (isSucceeded) mStats.today.succeeded++;
        if (isFailed) mStats.today.failed++;
        if (isRateLimited) mStats.today.rateLimited++;
        mStats.today.tokens += entry.totalTokens;
        if (entry.isEstimated) mStats.today.estimatedTokens += entry.totalTokens;
      }

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
          if (isSucceeded) last30Minutes[bucketIndex].succeeded++;
          if (isFailed) {
            last30Minutes[bucketIndex].failed++;
            last30Minutes[bucketIndex].errors++;
          }
          last30Minutes[bucketIndex].tokens += entry.totalTokens;
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
        if (isFailed) last14Days[dayIndex].errors++;
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

    const aiOnlyEntries = this.inMemoryLog.filter((e) => e.purpose !== 'tool_execution');

    const expensiveCandidates = aiOnlyEntries
      .filter((e) => e.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 15)
      .map(toEntryView);

    const recentCalls = aiOnlyEntries
      .slice(-40)
      .reverse()
      .map(toEntryView);

    const failedCalls = this.inMemoryLog
      .filter((e) => e.status === 'error' || e.status === 'rate_limited')
      .slice(-40)
      .reverse()
      .map(toEntryView);

    const byModel = Array.from(modelMap.values()).sort((a, b) => b.total.requests - a.total.requests);

    return {
      serverStartedAtMs: this.serverStartedAtMs,
      serverStartedAt: this.serverStartedAt,
      lastMinute: {
        requests: lastMinReqs,
        succeededRequests: lastMinSucceeded,
        failedRequests: lastMinFailed,
        rateLimit429Count: lastMin429,
        promptTokens: lastMinPrompt,
        completionTokens: lastMinComp,
        totalTokens: lastMinTotal,
        estimatedTokens: lastMinEstimated,
      },
      busiestSecond,
      busiestMinute,
      last30Minutes,
      today: {
        requests: todayReqs,
        succeededRequests: todaySucceeded,
        failedRequests: todayFailed,
        promptTokens: todayPrompt,
        completionTokens: todayComp,
        totalTokens: todayTotal,
        estimatedTokens: todayEstimated,
        tavilyCredits: todayCredits,
        rateLimit429Count: today429s,
      },
      overall: {
        requests: overallReqs,
        succeededRequests: overallSucceeded,
        failedRequests: overallFailed,
        promptTokens: overallPrompt,
        completionTokens: overallComp,
        totalTokens: overallTotal,
        estimatedTokens: overallEstimated,
        rateLimit429Count: total429s,
      },
      last14Days,
      byPurpose,
      byProvider,
      byModel,
      rateLimit429Count: total429s,
      mostExpensiveMessages: expensiveCandidates,
      recentCalls,
      failedCalls,
      tavilyCreditsThisMonth,
      totalEntriesRecorded: this.inMemoryLog.length,
    };
  }
}
