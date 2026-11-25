import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse, ToolCallRequest } from './text-provider.interface';
import {
  TextProviderType,
  ProviderError,
  formatCleanProviderError,
  DEFAULT_CHAT_MODEL,
  isTtsModel,
} from '../../shared/types/provider';
import { ErrorLogService } from '../../backend/src/services/error-log.service';
import { UsageTracker } from '../../backend/src/services/usage-tracker.service';
import { LocalConfigManager } from '../../shared/config/local-config';

function sanitizeGeminiSchemaProperty(prop: any): Record<string, any> {
  if (!prop || typeof prop !== 'object') {
    return { type: 'string' };
  }

  const rawType = typeof prop.type === 'string' ? prop.type.toLowerCase() : 'string';
  const clean: Record<string, any> = {
    type: rawType,
  };

  if (typeof prop.description === 'string' && prop.description.trim()) {
    clean.description = prop.description.trim();
  }

  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    clean.enum = prop.enum.map((v: any) => String(v));
  }

  if (rawType === 'array') {
    clean.items = prop.items
      ? sanitizeGeminiSchemaProperty(prop.items)
      : { type: 'string' };
  } else if (rawType === 'object' && prop.properties && typeof prop.properties === 'object') {
    const nestedProps: Record<string, any> = {};
    for (const [k, v] of Object.entries(prop.properties)) {
      nestedProps[k] = sanitizeGeminiSchemaProperty(v);
    }
    clean.properties = nestedProps;
    if (Array.isArray(prop.required) && prop.required.length > 0) {
      clean.required = prop.required;
    }
  }

  return clean;
}

function sanitizeToolParametersForGemini(params: any): Record<string, any> {
  const props: Record<string, any> = {};
  if (params?.properties && typeof params.properties === 'object') {
    for (const [key, val] of Object.entries(params.properties)) {
      props[key] = sanitizeGeminiSchemaProperty(val);
    }
  }
  const result: Record<string, any> = {
    type: 'object',
    properties: props,
  };
  if (Array.isArray(params?.required) && params.required.length > 0) {
    result.required = params.required.filter((r: any) => typeof r === 'string' && r in props);
  }
  return result;
}

function extractDetectedCalls(response: any): {
  detectedCalls: ToolCallRequest[];
  candidateParts: any[] | undefined;
} {
  const candidateParts = response?.candidates?.[0]?.content?.parts;
  let detectedCalls: ToolCallRequest[] = [];

  if (Array.isArray(response?.functionCalls) && response.functionCalls.length > 0) {
    detectedCalls = response.functionCalls.map((fc: any, idx: number) => ({
      id: `call_${Date.now()}_${idx}`,
      name: fc.name,
      args: fc.args || {},
    }));
  } else if (Array.isArray(candidateParts)) {
    const functionCallParts = candidateParts.filter((p: any) => Boolean(p?.functionCall));
    if (functionCallParts.length > 0) {
      detectedCalls = functionCallParts.map((p: any, idx: number) => ({
        id: `call_${Date.now()}_${idx}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      }));
    }
  }

  return { detectedCalls, candidateParts };
}

function extractRawErrorDetail(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const parts: string[] = [];
  if (err.status || err.statusCode) {
    parts.push(`HTTP ${err.status || err.statusCode}`);
  }
  if (err.code) {
    parts.push(`Code: ${err.code}`);
  }
  if (err.message) {
    parts.push(String(err.message));
  }
  return parts.join(' | ') || String(err);
}

function estimatePromptTokens(request: TextGenerationRequest): number {
  const sysLen = request.systemPrompt?.length || 0;
  const msgLen = (request.messages || []).reduce((acc, m) => acc + (m.content?.length || 0), 0);
  return Math.max(1, Math.ceil((sysLen + msgLen) / 4));
}

function isGemini4Model(modelName: string): boolean {
  return /^gemini-4(?:-|$)/i.test((modelName || '').trim());
}

function isTransientGeminiError(err: any): boolean {
  const status = Number(err?.status || err?.statusCode || 0);
  const msg = String(err?.message || '');
  if (/exceeded your current quota|quota.*0|billing|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return false;
  }
  return (
    status === 503 ||
    status === 429 ||
    /\b503\b|high demand|overloaded|temporarily unavailable|UNAVAILABLE/i.test(msg) ||
    (/\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(msg) && !/current quota/i.test(msg))
  );
}

function waitJitteredBackoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const delayMs = 350 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class GeminiTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'gemini';
  public readonly modelName: string;
  public readonly supportsTools: boolean = true;
  private static supportsThinkingConfig: boolean = true;
  private ai: GoogleGenAI | null = null;
  private activeApiKey: string = '';
  public isConfigured: boolean = false;
  public lastError?: string;

  constructor(customModel?: string) {
    let rawModel = (
      customModel ||
      LocalConfigManager.get('TEXT_AI_MODEL') ||
      LocalConfigManager.get('GEMINI_MODEL') ||
      DEFAULT_CHAT_MODEL
    ).trim();

    if (isTtsModel(rawModel)) {
      console.warn(`[GeminiTextAIProvider] TTS model '${rawModel}' cannot be used as a chat model. Reverting to '${DEFAULT_CHAT_MODEL}'.`);
      rawModel = DEFAULT_CHAT_MODEL;
    }

    this.modelName = rawModel || DEFAULT_CHAT_MODEL;
    this.syncClientFromConfig(true);
  }

  private syncClientFromConfig(logOnInit = false): GoogleGenAI | null {
    const apiKey = (LocalConfigManager.getGeminiConfig().apiKey || '').trim();
    if (!apiKey) {
      this.ai = null;
      this.activeApiKey = '';
      this.isConfigured = false;
      return null;
    }

    if (this.ai && this.activeApiKey === apiKey) {
      this.isConfigured = true;
      return this.ai;
    }

    try {
      this.ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      this.activeApiKey = apiKey;
      this.isConfigured = true;
      this.lastError = undefined;
      if (logOnInit) {
        console.log(`[GeminiTextAIProvider] Initialized with model: ${this.modelName}`);
      }
      return this.ai;
    } catch (err: any) {
      console.error('[GeminiTextAIProvider] Initialization error:', err);
      this.ai = null;
      this.activeApiKey = '';
      this.isConfigured = false;
      this.lastError = err.message;
      return null;
    }
  }

  private resolveRequestModel(requestedModel?: string): string {
    const trimmed = (requestedModel || '').trim();
    if (!trimmed) return this.modelName;
    if (isTtsModel(trimmed)) {
      throw new ProviderError(
        `Voice/TTS model '${trimmed}' cannot be used for chat. Please select a Gemini chat model in Settings.`,
        'gemini',
        'INVALID_MODEL_TYPE',
        400,
        trimmed
      );
    }
    return trimmed;
  }

  private formatGeminiContents(messages: TextGenerationRequest['messages']): any[] {
    const contents: any[] = [];

    for (const m of messages) {
      if (m.role === 'tool') {
        let outputObj: any;
        try {
          outputObj = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        } catch {
          outputObj = { output: m.content };
        }
        if (!outputObj || typeof outputObj !== 'object' || Array.isArray(outputObj)) {
          outputObj = { output: outputObj };
        }

        const fnPart = {
          functionResponse: {
            name: m.name || 'tool',
            response: outputObj,
          },
        };

        // Merge consecutive tool responses into one user turn so multi-tool calls match Gemini's contract
        const prev = contents[contents.length - 1];
        if (
          prev &&
          prev.role === 'user' &&
          Array.isArray(prev.parts) &&
          prev.parts.some((p: any) => Boolean(p?.functionResponse))
        ) {
          prev.parts.push(fnPart);
        } else {
          contents.push({
            role: 'user',
            parts: [fnPart],
          });
        }
      } else if (m.role === 'assistant') {
        if (m.rawModelParts && Array.isArray(m.rawModelParts) && m.rawModelParts.length > 0) {
          contents.push({
            role: 'model',
            parts: m.rawModelParts,
          });
          continue;
        }

        const parts: any[] = [];
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args || {},
              },
            });
          }
        }
        if (m.content) {
          parts.push({ text: m.content });
        }
        if (parts.length === 0) {
          parts.push({ text: '' });
        }
        contents.push({
          role: 'model',
          parts,
        });
      } else {
        const textPart = { text: m.content || '' };
        const prev = contents[contents.length - 1];
        if (
          prev &&
          prev.role === 'user' &&
          Array.isArray(prev.parts) &&
          prev.parts.every((p: any) => typeof p?.text === 'string')
        ) {
          prev.parts.push(textPart);
        } else {
          contents.push({
            role: 'user',
            parts: [textPart],
          });
        }
      }
    }

    // Drop any leading model turns so conversation always starts with a user turn
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    return contents;
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const aiClient = this.syncClientFromConfig();
    if (!aiClient || !this.isConfigured) {
      const missingErr = new ProviderError(
        'Gemini AI service is unconfigured. Set GEMINI_API_KEY in Variables or environment settings.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
      UsageTracker.recordAICall({
        provider: 'gemini',
        model: this.resolveRequestModel(request.model),
        purpose: request.purpose || 'chat',
        promptTokens: estimatePromptTokens(request),
        completionTokens: 0,
        isEstimated: true,
        durationMs: 0,
        status: 'error',
        messageId: request.messageId,
        errorStatusCode: 400,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: missingErr.message,
      });
      throw missingErr;
    }

    const targetModel = this.resolveRequestModel(request.model);
    const contents = this.formatGeminiContents(request.messages);

    const maxTokens = request.maxTokens ?? 4096;
    const isG4 = isGemini4Model(targetModel);
    const config: any = {
      systemInstruction: request.systemPrompt,
      maxOutputTokens: maxTokens,
    };

    // Gemini 4 models do not accept deprecated sampling parameters (temperature) or thinkingBudget
    if (!isG4) {
      config.temperature = request.temperature ?? 0.7;
      if (GeminiTextAIProvider.supportsThinkingConfig && maxTokens > 300) {
        config.thinkingConfig = {
          thinkingBudget: 256,
        };
      }
    }

    if (request.tools && request.tools.length > 0 && request.toolChoice !== 'none') {
      config.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeToolParametersForGemini(t.parameters),
          })),
        },
      ];
      if (request.toolChoice === 'required') {
        config.toolConfig = {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
          },
        };
      }
    }

    // 30 second timeout controller for this call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);
    config.abortSignal = controller.signal;

    const callStartTime = Date.now();
    let lastError: any = null;
    const estimatedPrompt = estimatePromptTokens(request);

    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await aiClient.models.generateContent({
            model: targetModel,
            contents,
            config,
          });

          const responseText = response.text || '';
          this.lastError = undefined;

          const { detectedCalls, candidateParts } = extractDetectedCalls(response);
          const hasToolCalls = detectedCalls.length > 0;
          const rawFinishReason = response.candidates?.[0]?.finishReason;
          const finishReason: TextGenerationResponse['finishReason'] = hasToolCalls
            ? 'tool_call'
            : rawFinishReason === 'MAX_TOKENS'
            ? 'length'
            : 'stop';

          const usageMeta = (response as any).usageMetadata;
          const promptTokens = usageMeta?.promptTokenCount ?? estimatedPrompt;
          const completionTokens = usageMeta?.candidatesTokenCount ?? Math.ceil((responseText.length || 20) / 4);
          const totalTokens = usageMeta?.totalTokenCount ?? (promptTokens + completionTokens);
          const isEstimated = !usageMeta?.promptTokenCount;

          UsageTracker.recordAICall({
            provider: 'gemini',
            model: targetModel,
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
            content: responseText,
            model: targetModel,
            provider: this.providerType,
            tokensUsed: {
              prompt: promptTokens,
              completion: completionTokens,
              total: totalTokens,
            },
            isMock: false,
            finishReason,
            toolCalls: hasToolCalls ? detectedCalls : undefined,
            rawModelParts: candidateParts,
          };
        } catch (error: any) {
          lastError = error;

          if (controller.signal.aborted) {
            const timeoutErr = new ProviderError(
              'Gemini request timed out after 30 seconds.',
              'gemini',
              'PROVIDER_TIMEOUT',
              504,
              targetModel
            );
            lastError = timeoutErr;
            break;
          }

          const msg = String(error?.message || '');

          const isThinkingConfigRejection =
            config.thinkingConfig &&
            (/thinking[-_]?config|thinking[-_]?budget|thinking_process/i.test(msg) ||
              (msg.includes('INVALID_ARGUMENT') && /thinking/i.test(msg)));

          if (isThinkingConfigRejection) {
            console.warn('[GeminiTextAIProvider] API rejected thinkingConfig. Disabling thinkingConfig and retrying once...');
            GeminiTextAIProvider.supportsThinkingConfig = false;
            delete config.thinkingConfig;
            try {
              const retryResponse = await aiClient.models.generateContent({
                model: targetModel,
                contents,
                config,
              });
              const retryText = retryResponse.text || '';
              this.lastError = undefined;
              const { detectedCalls: retryCalls, candidateParts: retryParts } = extractDetectedCalls(retryResponse);
              const retryHasTools = retryCalls.length > 0;
              const retryRawFinish = retryResponse.candidates?.[0]?.finishReason;
              const retryFinish: TextGenerationResponse['finishReason'] = retryHasTools
                ? 'tool_call'
                : retryRawFinish === 'MAX_TOKENS'
                ? 'length'
                : 'stop';

              const retryUsage = (retryResponse as any).usageMetadata;
              const promptTok = retryUsage?.promptTokenCount ?? estimatedPrompt;
              const compTok = retryUsage?.candidatesTokenCount ?? Math.ceil((retryText.length || 20) / 4);
              const totalTok = retryUsage?.totalTokenCount ?? (promptTok + compTok);

              UsageTracker.recordAICall({
                provider: 'gemini',
                model: targetModel,
                purpose: request.purpose || (retryHasTools ? 'tool_round' : 'chat'),
                promptTokens: promptTok,
                completionTokens: compTok,
                totalTokens: totalTok,
                isEstimated: !retryUsage?.promptTokenCount,
                durationMs: Date.now() - callStartTime,
                status: 'ok',
                messageId: request.messageId,
              });

              return {
                content: retryText,
                model: targetModel,
                provider: this.providerType,
                tokensUsed: {
                  prompt: promptTok,
                  completion: compTok,
                  total: totalTok,
                },
                isMock: false,
                finishReason: retryFinish,
                toolCalls: retryHasTools ? retryCalls : undefined,
                rawModelParts: retryParts,
              };
            } catch (retryErr: any) {
              lastError = retryErr;
            }
            break;
          }

          if (attempt < 2 && isTransientGeminiError(error)) {
            await waitJitteredBackoff(attempt, controller.signal);
            if (!controller.signal.aborted) {
              continue;
            }
          }
          break;
        }
      }

      if (lastError && typeof lastError === 'object') {
        (lastError as any).provider = 'gemini';
        (lastError as any).model = targetModel;
      }
      ErrorLogService.log('ai_provider', lastError, { provider: 'gemini', model: targetModel });
      const formatted = formatCleanProviderError(lastError);
      const rawDetail = extractRawErrorDetail(lastError);
      this.lastError = formatted.cleanMessage;

      const isRateLimited = formatted.code === 'QUOTA_EXHAUSTED' || formatted.statusCode === 429;
      UsageTracker.recordAICall({
        provider: 'gemini',
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
        errorDetails: rawDetail,
        metadata: { error: formatted.cleanMessage, code: formatted.code, statusCode: formatted.statusCode },
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'gemini',
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
    const aiClient = this.syncClientFromConfig();
    if (!aiClient || !this.isConfigured) {
      const missingErr = new ProviderError(
        'Gemini AI service is unconfigured. Set GEMINI_API_KEY.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
      UsageTracker.recordAICall({
        provider: 'gemini',
        model: this.resolveRequestModel(request.model),
        purpose: request.purpose || 'chat',
        promptTokens: estimatePromptTokens(request),
        completionTokens: 0,
        isEstimated: true,
        durationMs: 0,
        status: 'error',
        messageId: request.messageId,
        errorStatusCode: 400,
        errorCode: 'MISSING_CREDENTIALS',
        errorMessage: missingErr.message,
      });
      throw missingErr;
    }

    const targetModel = this.resolveRequestModel(request.model);
    const estimatedPrompt = estimatePromptTokens(request);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    const streamStartTime = Date.now();

    try {
      const contents = this.formatGeminiContents(request.messages);

      const maxTokens = request.maxTokens ?? 4096;
      const isG4 = isGemini4Model(targetModel);
      const config: any = {
        systemInstruction: request.systemPrompt,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      };

      if (!isG4) {
        config.temperature = request.temperature ?? 0.7;
        if (GeminiTextAIProvider.supportsThinkingConfig && maxTokens > 300) {
          config.thinkingConfig = {
            thinkingBudget: 256,
          };
        }
      }

      let responseStream: any;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          responseStream = await aiClient.models.generateContentStream({
            model: targetModel,
            contents,
            config,
          });
          break;
        } catch (streamInitErr: any) {
          if (controller.signal.aborted) {
            throw new ProviderError(
              'Gemini stream request timed out after 30 seconds.',
              'gemini',
              'PROVIDER_TIMEOUT',
              504,
              targetModel
            );
          }
          const msg = String(streamInitErr?.message || '');
          if (
            config.thinkingConfig &&
            (/thinking[-_]?config|thinking[-_]?budget|thinking_process/i.test(msg) ||
              (msg.includes('INVALID_ARGUMENT') && /thinking/i.test(msg)))
          ) {
            GeminiTextAIProvider.supportsThinkingConfig = false;
            delete config.thinkingConfig;
            responseStream = await aiClient.models.generateContentStream({
              model: targetModel,
              contents,
              config,
            });
            break;
          }
          if (attempt < 2 && isTransientGeminiError(streamInitErr)) {
            await waitJitteredBackoff(attempt, controller.signal);
            if (!controller.signal.aborted) {
              continue;
            }
          }
          throw streamInitErr;
        }
      }

      let fullText = '';
      let usageMeta: any = null;
      let rawFinishReason: string | undefined;

      for await (const chunk of responseStream) {
        if (controller.signal.aborted) {
          throw new ProviderError(
            'Gemini stream request timed out after 30 seconds.',
            'gemini',
            'PROVIDER_TIMEOUT',
            504,
            targetModel
          );
        }
        if ((chunk as any)?.usageMetadata) {
          usageMeta = (chunk as any).usageMetadata;
        }
        if ((chunk as any)?.candidates?.[0]?.finishReason) {
          rawFinishReason = (chunk as any).candidates[0].finishReason;
        }
        const piece = chunk.text || '';
        fullText += piece;
        onChunk(piece, false);
      }

      onChunk('', true);
      this.lastError = undefined;

      const promptTokens = usageMeta?.promptTokenCount ?? estimatedPrompt;
      const completionTokens = usageMeta?.candidatesTokenCount ?? Math.ceil(fullText.length / 4);
      const totalTokens = usageMeta?.totalTokenCount ?? (promptTokens + completionTokens);
      const isEstimated = !usageMeta?.promptTokenCount;

      UsageTracker.recordAICall({
        provider: 'gemini',
        model: targetModel,
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
        model: targetModel,
        provider: this.providerType,
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: totalTokens,
        },
        isMock: false,
        finishReason: rawFinishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      };
    } catch (error: any) {
      if (controller.signal.aborted || error?.code === 'PROVIDER_TIMEOUT') {
        const timeoutErr = new ProviderError(
          'Gemini stream request timed out after 30 seconds.',
          'gemini',
          'PROVIDER_TIMEOUT',
          504,
          targetModel
        );
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'gemini', model: targetModel, stream: true });
        this.lastError = timeoutErr.message;
        UsageTracker.recordAICall({
          provider: 'gemini',
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
          errorDetails: timeoutErr.message,
          metadata: { timeout: true },
        });
        throw timeoutErr;
      }

      if (error && typeof error === 'object') {
        (error as any).provider = 'gemini';
        (error as any).model = targetModel;
      }
      ErrorLogService.log('ai_provider', error, { provider: 'gemini', model: targetModel, stream: true });
      const formatted = formatCleanProviderError(error);
      const rawDetail = extractRawErrorDetail(error);
      this.lastError = formatted.cleanMessage;

      const isRateLimited = formatted.code === 'QUOTA_EXHAUSTED' || formatted.statusCode === 429;
      UsageTracker.recordAICall({
        provider: 'gemini',
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
        errorDetails: rawDetail,
        metadata: { error: formatted.cleanMessage, code: formatted.code, statusCode: formatted.statusCode },
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'gemini',
        formatted.code,
        formatted.statusCode,
        targetModel,
        formatted.retryAfterSeconds
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async testConnection(customModel?: string): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    const targetModel = this.resolveRequestModel(customModel);
    const aiClient = this.syncClientFromConfig();

    if (!aiClient || !this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: targetModel,
        error: 'GEMINI_API_KEY is not configured.',
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
