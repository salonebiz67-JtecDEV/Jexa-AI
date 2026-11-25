import {
  ITextAIProvider,
  TextGenerationMessage,
  TextGenerationRequest,
  TextGenerationResponse,
  ToolCallRequest,
} from './text-provider.interface';
import {
  DEFAULT_CHAT_ALIAS,
  ProviderError,
  TextProviderType,
  formatCleanProviderError,
  isTtsModel,
} from '../../shared/types/provider';
import { resolveLiteLLMModelAlias } from './model-aliases';
import { normalizeGatewayBaseUrl } from './config';
import { ErrorLogService } from '../../backend/src/services/error-log.service';
import { UsageTracker } from '../../backend/src/services/usage-tracker.service';
import { LocalConfigManager } from '../../shared/config/local-config';

const LITELLM_TIMEOUT_MS = 30000;

function estimatePromptTokens(request: TextGenerationRequest): number {
  const sysLen = request.systemPrompt?.length || 0;
  const msgLen = (request.messages || []).reduce((acc, m) => acc + (m.content?.length || 0), 0);
  return Math.max(1, Math.ceil((sysLen + msgLen) / 4));
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: TextGenerationMessage[]
): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];

  if (systemPrompt && systemPrompt.trim()) {
    out.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) {
        out.push({ role: 'system', content: m.content });
      }
      continue;
    }

    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId || `call_${m.name || 'tool'}`,
        name: m.name || 'tool',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? {}),
      });
      continue;
    }

    if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc, idx) => ({
            id: tc.id || `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args || {}),
            },
          })),
        });
      } else {
        out.push({
          role: 'assistant',
          content: m.content || '',
        });
      }
      continue;
    }

    out.push({
      role: 'user',
      content: m.content || '',
    });
  }

  return out;
}

function parseToolCallsFromChoice(message: any): ToolCallRequest[] {
  const rawCalls = message?.tool_calls;
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
    return [];
  }

  return rawCalls
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any, idx: number) => {
      let parsedArgs: Record<string, any> = {};
      const rawArgs = tc.function?.arguments;
      if (typeof rawArgs === 'string' && rawArgs.trim()) {
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch {
          parsedArgs = {};
        }
      } else if (rawArgs && typeof rawArgs === 'object') {
        parsedArgs = rawArgs;
      }
      return {
        id: tc.id || `call_${Date.now()}_${idx}`,
        name: tc.function.name,
        args: parsedArgs,
      };
    });
}

function resolveUpstreamProviderLabel(responseModel?: string, headers?: Headers): string {
  const apiBaseHeader = headers?.get('x-litellm-model-api-base') || '';
  const modelLower = (responseModel || '').toLowerCase();
  if (modelLower.includes('groq') || modelLower.includes('llama') || apiBaseHeader.includes('groq')) {
    return 'groq';
  }
  if (modelLower.includes('gemini') || apiBaseHeader.includes('generativelanguage')) {
    return 'gemini';
  }
  return 'litellm';
}

export class LiteLLMTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'litellm';
  public readonly modelName: string;
  public readonly supportsTools: boolean = true;
  public readonly isConfigured: boolean = false;
  public lastError?: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(customModel?: string) {
    const rawAlias = resolveLiteLLMModelAlias(
      customModel || LocalConfigManager.get('TEXT_AI_MODEL') || DEFAULT_CHAT_ALIAS,
      DEFAULT_CHAT_ALIAS
    );
    this.modelName = rawAlias;

    const rawBaseUrl = (LocalConfigManager.get('LITELLM_BASE_URL') || '').trim().replace(/\/+$/, '');
    const normalizedBaseUrl = normalizeGatewayBaseUrl(rawBaseUrl);
    const rawApiKey = (
      LocalConfigManager.get('LITELLM_API_KEY') ||
      LocalConfigManager.get('LITELLM_MASTER_KEY') ||
      ''
    ).trim();

    if (normalizedBaseUrl && rawApiKey) {
      this.baseUrl = normalizedBaseUrl;
      this.apiKey = rawApiKey;
      this.isConfigured = true;
      console.log(`[LiteLLMTextAIProvider] Initialized gateway route with alias: ${this.modelName}`);
    } else {
      this.baseUrl = '';
      this.apiKey = '';
      this.isConfigured = false;
      if (rawBaseUrl && !normalizedBaseUrl) {
        this.lastError = 'LITELLM_BASE_URL must be a valid http://, https://, or host:port address.';
        console.warn('[LiteLLMTextAIProvider] Invalid LITELLM_BASE_URL format.');
      } else {
        this.lastError = 'LITELLM_BASE_URL or LITELLM_API_KEY is not configured.';
      }
    }
  }

  private resolveRequestModel(requestedModel?: string): string {
    const trimmed = (requestedModel || '').trim();
    if (!trimmed) return this.modelName;
    if (isTtsModel(trimmed)) {
      throw new ProviderError(
        `Voice/TTS model '${trimmed}' cannot be used for chat. Please select a chat model in Settings.`,
        'litellm',
        'INVALID_MODEL_TYPE',
        400,
        trimmed
      );
    }
    return resolveLiteLLMModelAlias(trimmed, this.modelName);
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'Cache-Control': 'no-store',
    };
  }

  private buildChatBody(request: TextGenerationRequest, targetModel: string, stream: boolean): Record<string, any> {
    const isG4 = /^gemini-4(?:-|$)/i.test(targetModel) || targetModel === 'jexa-chat-fast';
    const body: Record<string, any> = {
      model: targetModel,
      messages: toOpenAIMessages(request.systemPrompt, request.messages),
      ...(isG4 ? {} : { temperature: request.temperature ?? 0.7 }),
      max_tokens: request.maxTokens ?? 4096,
      stream,
      // Explicitly disable gateway response caching for private user conversations
      cache: { 'no-cache': true },
      metadata: {
        purpose: request.purpose || 'chat',
        private_conversation: true,
        no_cache: true,
      },
    };

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    if (request.tools && request.tools.length > 0 && request.toolChoice !== 'none') {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));
      body.tool_choice = request.toolChoice === 'required' ? 'required' : 'auto';
    }

    return body;
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const targetModel = this.resolveRequestModel(request.model);

    if (!this.isConfigured || !this.baseUrl || !this.apiKey) {
      const missingErr = new ProviderError(
        'AI Gateway (LiteLLM) is unconfigured. Set LITELLM_BASE_URL and LITELLM_API_KEY on the server.',
        'litellm',
        'MISSING_CREDENTIALS',
        503,
        targetModel
      );
      UsageTracker.recordAICall({
        provider: 'litellm',
        model: targetModel,
        purpose: request.purpose || 'chat',
        promptTokens: estimatePromptTokens(request),
        completionTokens: 0,
        isEstimated: true,
        durationMs: 0,
        status: 'error',
        messageId: request.messageId,
        errorStatusCode: 503,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: missingErr.message,
      });
      throw missingErr;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LITELLM_TIMEOUT_MS);
    const callStartTime = Date.now();
    const estimatedPrompt = estimatePromptTokens(request);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildChatBody(request, targetModel, false)),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        json = null;
      }

      if (!response.ok) {
        const errMsg = json?.error?.message || json?.message || `Gateway returned HTTP ${response.status}`;
        const err: any = new Error(errMsg);
        err.statusCode = response.status;
        err.code = json?.error?.code || (response.status === 429 ? 'QUOTA_EXHAUSTED' : 'GATEWAY_ERROR');
        err.provider = 'litellm';
        err.model = targetModel;
        throw err;
      }

      const choice = json?.choices?.[0];
      const msg = choice?.message || {};
      const content = typeof msg.content === 'string' ? msg.content : '';
      const toolCalls = parseToolCallsFromChoice(msg);
      const hasToolCalls = toolCalls.length > 0;
      const finishReason: TextGenerationResponse['finishReason'] = hasToolCalls
        ? 'tool_call'
        : choice?.finish_reason === 'length'
        ? 'length'
        : 'stop';

      const usage = json?.usage;
      const promptTokens = usage?.prompt_tokens ?? estimatedPrompt;
      const completionTokens = usage?.completion_tokens ?? Math.ceil((content.length || 20) / 4);
      const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
      const isEstimated = !usage?.prompt_tokens;

      const resolvedModel = typeof json?.model === 'string' && json.model.trim() ? json.model.trim() : targetModel;
      const upstreamProvider = resolveUpstreamProviderLabel(resolvedModel, response.headers);
      this.lastError = undefined;

      UsageTracker.recordAICall({
        provider: upstreamProvider === 'litellm' ? 'litellm' : `litellm:${upstreamProvider}`,
        model: resolvedModel,
        purpose: request.purpose || (hasToolCalls ? 'tool_round' : 'chat'),
        promptTokens,
        completionTokens,
        totalTokens,
        isEstimated,
        durationMs: Date.now() - callStartTime,
        status: 'ok',
        messageId: request.messageId,
      });

      return {
        content,
        model: resolvedModel,
        provider: 'litellm',
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: totalTokens,
        },
        isMock: false,
        finishReason,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        rawMessage: msg,
      };
    } catch (error: any) {
      if (controller.signal.aborted) {
        const timeoutErr = new ProviderError(
          'AI Gateway request timed out after 30 seconds.',
          'litellm',
          'PROVIDER_TIMEOUT',
          504,
          targetModel
        );
        this.lastError = timeoutErr.message;
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'litellm', model: targetModel });
        UsageTracker.recordAICall({
          provider: 'litellm',
          model: targetModel,
          purpose: request.purpose || 'chat',
          promptTokens: estimatedPrompt,
          completionTokens: 0,
          totalTokens: estimatedPrompt,
          isEstimated: true,
          durationMs: Date.now() - callStartTime,
          status: 'error',
          messageId: request.messageId,
          errorStatusCode: 504,
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: timeoutErr.message,
        });
        throw timeoutErr;
      }

      if (error && typeof error === 'object') {
        error.provider = 'litellm';
        error.model = targetModel;
      }
      ErrorLogService.log('ai_provider', error, { provider: 'litellm', model: targetModel });
      const formatted = formatCleanProviderError(error);
      this.lastError = formatted.cleanMessage;

      const isRateLimited = formatted.code === 'QUOTA_EXHAUSTED' || formatted.statusCode === 429;
      UsageTracker.recordAICall({
        provider: 'litellm',
        model: targetModel,
        purpose: request.purpose || 'chat',
        promptTokens: estimatedPrompt,
        completionTokens: 0,
        totalTokens: estimatedPrompt,
        isEstimated: true,
        durationMs: Date.now() - callStartTime,
        status: isRateLimited ? 'rate_limited' : 'error',
        messageId: request.messageId,
        errorStatusCode: formatted.statusCode,
        errorCode: formatted.code,
        errorMessage: formatted.cleanMessage,
        errorDetails: formatted.cleanMessage,
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'litellm',
        formatted.code,
        formatted.statusCode,
        targetModel,
        formatted.retryAfterSeconds
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse> {
    const targetModel = this.resolveRequestModel(request.model);

    if (!this.isConfigured || !this.baseUrl || !this.apiKey) {
      const missingErr = new ProviderError(
        'AI Gateway (LiteLLM) is unconfigured. Set LITELLM_BASE_URL and LITELLM_API_KEY on the server.',
        'litellm',
        'MISSING_CREDENTIALS',
        503,
        targetModel
      );
      UsageTracker.recordAICall({
        provider: 'litellm',
        model: targetModel,
        purpose: request.purpose || 'chat',
        promptTokens: estimatePromptTokens(request),
        completionTokens: 0,
        isEstimated: true,
        durationMs: 0,
        status: 'error',
        messageId: request.messageId,
        errorStatusCode: 503,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: missingErr.message,
      });
      throw missingErr;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LITELLM_TIMEOUT_MS);
    const streamStartTime = Date.now();
    const estimatedPrompt = estimatePromptTokens(request);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify(this.buildChatBody(request, targetModel, true)),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errBody = await response.text().catch(() => '');
        let errJson: any = null;
        try {
          errJson = errBody ? JSON.parse(errBody) : null;
        } catch {
          errJson = null;
        }
        const err: any = new Error(
          errJson?.error?.message || errJson?.message || `Gateway streaming returned HTTP ${response.status}`
        );
        err.statusCode = response.status;
        err.code = errJson?.error?.code || (response.status === 429 ? 'QUOTA_EXHAUSTED' : 'GATEWAY_STREAM_ERROR');
        err.provider = 'litellm';
        err.model = targetModel;
        throw err;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let usageMeta: any = null;
      let finishReasonRaw: string | undefined;
      let resolvedModel = targetModel;

      while (true) {
        if (controller.signal.aborted) {
          throw new ProviderError(
            'AI Gateway stream timed out after 30 seconds.',
            'litellm',
            'PROVIDER_TIMEOUT',
            504,
            targetModel
          );
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          const lines = rawEvent.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            let parsed: any;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (typeof parsed.model === 'string' && parsed.model.trim()) {
              resolvedModel = parsed.model.trim();
            }
            if (parsed.usage) {
              usageMeta = parsed.usage;
            }
            const choice = parsed.choices?.[0];
            if (choice?.finish_reason) {
              finishReasonRaw = choice.finish_reason;
            }
            const piece = choice?.delta?.content;
            if (typeof piece === 'string' && piece.length > 0) {
              fullText += piece;
              onChunk(piece, false);
            }
          }
        }
      }

      onChunk('', true);
      this.lastError = undefined;

      const promptTokens = usageMeta?.prompt_tokens ?? estimatedPrompt;
      const completionTokens = usageMeta?.completion_tokens ?? Math.ceil(fullText.length / 4);
      const totalTokens = usageMeta?.total_tokens ?? promptTokens + completionTokens;
      const isEstimated = !usageMeta?.prompt_tokens;
      const upstreamProvider = resolveUpstreamProviderLabel(resolvedModel, response.headers);

      UsageTracker.recordAICall({
        provider: upstreamProvider === 'litellm' ? 'litellm' : `litellm:${upstreamProvider}`,
        model: resolvedModel,
        purpose: request.purpose || 'chat',
        promptTokens,
        completionTokens,
        totalTokens,
        isEstimated,
        durationMs: Date.now() - streamStartTime,
        status: 'ok',
        messageId: request.messageId,
      });

      return {
        content: fullText,
        model: resolvedModel,
        provider: 'litellm',
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: totalTokens,
        },
        isMock: false,
        finishReason: finishReasonRaw === 'length' ? 'length' : 'stop',
      };
    } catch (error: any) {
      if (controller.signal.aborted || error?.code === 'PROVIDER_TIMEOUT') {
        const timeoutErr = new ProviderError(
          'AI Gateway stream timed out after 30 seconds.',
          'litellm',
          'PROVIDER_TIMEOUT',
          504,
          targetModel
        );
        this.lastError = timeoutErr.message;
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'litellm', model: targetModel, stream: true });
        UsageTracker.recordAICall({
          provider: 'litellm',
          model: targetModel,
          purpose: request.purpose || 'chat',
          promptTokens: estimatedPrompt,
          completionTokens: 0,
          totalTokens: estimatedPrompt,
          isEstimated: true,
          durationMs: Date.now() - streamStartTime,
          status: 'error',
          messageId: request.messageId,
          errorStatusCode: 504,
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: timeoutErr.message,
        });
        throw timeoutErr;
      }

      if (error && typeof error === 'object') {
        error.provider = 'litellm';
        error.model = targetModel;
      }
      ErrorLogService.log('ai_provider', error, { provider: 'litellm', model: targetModel, stream: true });
      const formatted = formatCleanProviderError(error);
      this.lastError = formatted.cleanMessage;
      const isRateLimited = formatted.code === 'QUOTA_EXHAUSTED' || formatted.statusCode === 429;

      UsageTracker.recordAICall({
        provider: 'litellm',
        model: targetModel,
        purpose: request.purpose || 'chat',
        promptTokens: estimatedPrompt,
        completionTokens: 0,
        totalTokens: estimatedPrompt,
        isEstimated: true,
        durationMs: Date.now() - streamStartTime,
        status: isRateLimited ? 'rate_limited' : 'error',
        messageId: request.messageId,
        errorStatusCode: formatted.statusCode,
        errorCode: formatted.code,
        errorMessage: formatted.cleanMessage,
        errorDetails: formatted.cleanMessage,
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'litellm',
        formatted.code,
        formatted.statusCode,
        targetModel,
        formatted.retryAfterSeconds
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async checkGatewayHealth(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    if (!this.isConfigured || !this.baseUrl || !this.apiKey) {
      return {
        reachable: false,
        latencyMs: 0,
        error: 'LITELLM_BASE_URL or LITELLM_API_KEY is not configured.',
      };
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this.baseUrl}/health/liveliness`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      if (res.ok) {
        return { reachable: true, latencyMs: Date.now() - startTime };
      }
      const modelsRes = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      return {
        reachable: modelsRes.ok,
        latencyMs: Date.now() - startTime,
        error: modelsRes.ok ? undefined : `Gateway health check returned HTTP ${modelsRes.status}`,
      };
    } catch (err: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - startTime,
        error: controller.signal.aborted ? 'Gateway health check timed out.' : 'Unable to reach AI Gateway.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async testConnection(customModel?: string): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    error?: string;
  }> {
    const targetModel = this.resolveRequestModel(customModel);
    if (!this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: targetModel,
        error: 'LITELLM_BASE_URL or LITELLM_API_KEY is not configured on the backend server.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.generateResponse({
        model: targetModel,
        systemPrompt: 'Respond with exactly one word: ping',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16,
        temperature: 0.1,
      });
      this.lastError = undefined;
      return {
        success: true,
        latencyMs: Date.now() - startTime,
        model: res.model,
      };
    } catch (err: any) {
      const formatted = formatCleanProviderError(err);
      this.lastError = formatted.cleanMessage;
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: targetModel,
        error: formatted.cleanMessage,
      };
    }
  }
}
