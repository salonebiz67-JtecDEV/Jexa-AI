import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType, ProviderError, formatCleanProviderError } from '../../shared/types/provider';
import { ErrorLogService } from '../../backend/src/services/error-log.service';

export class GroqTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'groq';
  public readonly modelName: string;
  public readonly supportsTools: boolean = true;
  private readonly apiKey: string;
  public readonly isConfigured: boolean;
  public lastError?: string;

  constructor(customModel?: string) {
    this.apiKey = (process.env.GROQ_API_KEY || '').trim();
    // Prioritize GROQ_TEXT_MODEL, then GROQ_MODEL, fallback to standard production model
    this.modelName = (
      customModel ||
      process.env.GROQ_TEXT_MODEL ||
      process.env.GROQ_MODEL ||
      'llama-3.3-70b-versatile'
    ).trim();
    this.isConfigured = Boolean(this.apiKey);

    if (this.isConfigured) {
      console.log(`[GroqTextAIProvider] Initialized with model: ${this.modelName}`);
    } else {
      console.warn('[GroqTextAIProvider] GROQ_API_KEY is not set. Groq provider will not be available until configured.');
    }
  }

  private formatGroqMessages(request: TextGenerationRequest): Array<Record<string, any>> {
    const messages: Array<Record<string, any>> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const m of request.messages) {
      if (m.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: m.toolCallId || 'call_0',
          name: m.name,
          content: m.content,
        });
      } else if (m.role === 'assistant' && m.rawMessage) {
        messages.push(m.rawMessage);
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
            },
          })),
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    return messages;
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new ProviderError(
        'Groq AI service is unconfigured. Please set GROQ_API_KEY in your Render environment variables.',
        'groq',
        'MISSING_CREDENTIALS',
        400
      );
    }

    const messages = this.formatGroqMessages(request);

    try {
      return await this.executeChatCompletion(this.modelName, messages, request);
    } catch (primaryErr: any) {
      this.lastError = primaryErr.message;

      // Handle 404 model_not_found with resilient automatic fallback through active Groq models
      if (
        primaryErr.statusCode === 404 ||
        primaryErr.code === 'MODEL_NOT_FOUND' ||
        (primaryErr.message && primaryErr.message.includes('model_not_found'))
      ) {
        const candidateFallbacks = [
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'llama-3.1-70b-versatile',
          'mixtral-8x7b-32768',
        ].filter((m) => m !== this.modelName);

        for (const candidate of candidateFallbacks) {
          console.warn(`[GroqTextAIProvider] Model '${this.modelName}' returned 404. Attempting fallback to '${candidate}'...`);
          try {
            const fallbackRes = await this.executeChatCompletion(candidate, messages, request);
            fallbackRes.model = `${candidate} (auto-fallback)`;
            console.log(`[GroqTextAIProvider] Successfully recovered using Groq model '${candidate}'.`);
            return fallbackRes;
          } catch (candErr: any) {
            console.warn(`[GroqTextAIProvider] Fallback candidate '${candidate}' failed:`, candErr.message);
          }
        }

        throw new ProviderError(
          `Groq model '${this.modelName}' was not found. Please set GROQ_TEXT_MODEL to a supported Groq model.`,
          'groq',
          'MODEL_NOT_FOUND',
          404,
          this.modelName
        );
      }

      throw primaryErr;
    }
  }

  private async executeChatCompletion(
    model: string,
    messages: Array<Record<string, any>>,
    request: TextGenerationRequest
  ): Promise<TextGenerationResponse> {
    const payloadBody: any = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (model.toLowerCase().includes('gpt-oss')) {
      payloadBody.reasoning_effort = 'low';
    }

    if (request.tools && request.tools.length > 0) {
      payloadBody.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: t.parameters.properties || {},
            required: t.parameters.required || [],
          },
        },
      }));
      payloadBody.tool_choice = request.toolChoice || 'auto';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payloadBody),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      if (controller.signal.aborted) {
        const timeoutErr = new ProviderError(
          'Groq request timed out after 30 seconds.',
          'groq',
          'PROVIDER_TIMEOUT',
          504,
          model
        );
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'groq', model, timeout: true });
        this.lastError = timeoutErr.message;
        throw timeoutErr;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: any;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = null;
      }

      const groqCode = parsedError?.error?.code || parsedError?.error?.type;
      const groqMsg = parsedError?.error?.message || errorText;

      const retryAfterHeader = response.headers.get('retry-after');
      let retryAfterSeconds: number | undefined;
      if (retryAfterHeader) {
        const parsed = parseFloat(retryAfterHeader);
        if (!isNaN(parsed)) retryAfterSeconds = parsed;
      }

      ErrorLogService.log('ai_provider', `Groq error (${response.status}): ${groqMsg}`, {
        provider: 'groq',
        model,
        statusCode: response.status,
        code: groqCode,
        raw: parsedError || errorText,
      });

      const formatted = formatCleanProviderError({
        message: groqMsg,
        statusCode: response.status,
        code: groqCode || (response.status === 404 ? 'MODEL_NOT_FOUND' : response.status === 401 ? 'AUTHENTICATION_ERROR' : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR'),
        provider: 'groq',
        model,
        retryAfterSeconds,
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'groq',
        formatted.code,
        formatted.statusCode,
        model,
        formatted.retryAfterSeconds
      );
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';

    // Extract tool calls
    let detectedCalls: any[] = [];
    if (choice?.message?.tool_calls && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
      detectedCalls = choice.message.tool_calls.map((tc: any) => {
        let parsedArgs: any = {};
        try {
          parsedArgs = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
        } catch {
          parsedArgs = {};
        }
        return {
          id: tc.id || `call_${Date.now()}`,
          name: tc.function?.name || '',
          args: parsedArgs,
        };
      });
    }

    const hasToolCalls = detectedCalls.length > 0;

    return {
      content,
      model,
      provider: this.providerType,
      tokensUsed: {
        prompt: data.usage?.prompt_tokens ?? Math.ceil(request.systemPrompt.length / 4),
        completion: data.usage?.completion_tokens ?? Math.ceil((content.length || 20) / 4),
        total: data.usage?.total_tokens ?? Math.ceil((request.systemPrompt.length + (content.length || 20)) / 4),
      },
      isMock: false,
      finishReason: hasToolCalls ? 'tool_call' : (choice?.finish_reason === 'length' ? 'length' : 'stop'),
      toolCalls: hasToolCalls ? detectedCalls : undefined,
      rawMessage: choice?.message,
    };
  }

  public async streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new ProviderError(
        'Groq AI service is unconfigured. Please set GROQ_API_KEY.',
        'groq',
        'MISSING_CREDENTIALS',
        400
      );
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const isGptOss = this.modelName.toLowerCase().includes('gpt-oss');
    const streamPayload: any = {
      model: this.modelName,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };
    if (isGptOss) {
      streamPayload.reasoning_effort = 'low';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(streamPayload),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        const timeoutErr = new ProviderError(
          'Groq stream request timed out after 30 seconds.',
          'groq',
          'PROVIDER_TIMEOUT',
          504,
          this.modelName
        );
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'groq', model: this.modelName, stream: true, timeout: true });
        this.lastError = timeoutErr.message;
        throw timeoutErr;
      }
      throw fetchErr;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorText = await response.text();
      let parsedError: any;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = null;
      }
      const groqCode = parsedError?.error?.code;
      const groqMsg = parsedError?.error?.message || errorText;

      const retryAfterHeader = response.headers.get('retry-after');
      let retryAfterSeconds: number | undefined;
      if (retryAfterHeader) {
        const parsed = parseFloat(retryAfterHeader);
        if (!isNaN(parsed)) retryAfterSeconds = parsed;
      }

      ErrorLogService.log('ai_provider', `Groq stream error (${response.status}): ${groqMsg}`, {
        provider: 'groq',
        model: this.modelName,
        statusCode: response.status,
        code: groqCode,
        raw: parsedError || errorText,
      });

      const formatted = formatCleanProviderError({
        message: groqMsg,
        statusCode: response.status,
        code: groqCode || (response.status === 404 ? 'MODEL_NOT_FOUND' : response.status === 401 ? 'AUTHENTICATION_ERROR' : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_STREAM_ERROR'),
        provider: 'groq',
        model: this.modelName,
        retryAfterSeconds,
      });

      throw new ProviderError(
        formatted.cleanMessage,
        'groq',
        formatted.code,
        formatted.statusCode,
        this.modelName,
        formatted.retryAfterSeconds
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      throw new ProviderError('No response body returned from Groq stream.', 'groq', 'EMPTY_STREAM', 500);
    }

    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        if (controller.signal.aborted) {
          throw new ProviderError(
            'Groq stream request timed out after 30 seconds.',
            'groq',
            'PROVIDER_TIMEOUT',
            504,
            this.modelName
          );
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onChunk(delta, false);
            }
          } catch {
            // ignore non-json keep-alives
          }
        }
      }
    } catch (readErr: any) {
      if (controller.signal.aborted || readErr?.code === 'PROVIDER_TIMEOUT') {
        const timeoutErr = new ProviderError(
          'Groq stream request timed out after 30 seconds.',
          'groq',
          'PROVIDER_TIMEOUT',
          504,
          this.modelName
        );
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'groq', model: this.modelName, stream: true });
        this.lastError = timeoutErr.message;
        throw timeoutErr;
      }
      throw readErr;
    } finally {
      clearTimeout(timeoutId);
    }

    onChunk('', true);

    return {
      content: fullText,
      model: this.modelName,
      provider: this.providerType,
      tokensUsed: {
        prompt: Math.ceil(request.systemPrompt.length / 4),
        completion: Math.ceil(fullText.length / 4),
        total: Math.ceil((request.systemPrompt.length + fullText.length) / 4),
      },
      isMock: false,
      finishReason: 'stop',
    };
  }

  // Safe minimal test connection (does not invoke full user prompt)
  public async testConnection(): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    if (!this.isConfigured || !this.apiKey) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        error: 'GROQ_API_KEY is not configured on the backend server.',
      };
    }

    const startTime = Date.now();
    try {
      const res = await this.generateResponse({
        systemPrompt: 'Respond with exactly one word: ping',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
        temperature: 0.1,
      });

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        model: res.model,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        model: this.modelName,
        error: err.message,
      };
    }
  }
}
