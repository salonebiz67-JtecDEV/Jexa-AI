import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType, ProviderError } from '../../shared/types/provider';

export class GroqTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'groq';
  public readonly modelName: string;
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

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new ProviderError(
        'Groq AI service is unconfigured. Please set GROQ_API_KEY in your Render environment variables.',
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
    messages: Array<{ role: string; content: string }>,
    request: TextGenerationRequest
  ): Promise<TextGenerationResponse> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

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

      if (response.status === 404 || groqCode === 'model_not_found') {
        throw new ProviderError(
          `Groq model '${model}' not found on Groq Cloud. Please configure GROQ_TEXT_MODEL.`,
          'groq',
          'MODEL_NOT_FOUND',
          404,
          model
        );
      } else if (response.status === 401) {
        throw new ProviderError(
          'Invalid Groq API key. Check GROQ_API_KEY in your Render environment variables.',
          'groq',
          'AUTHENTICATION_ERROR',
          401,
          model
        );
      } else if (response.status === 429) {
        throw new ProviderError(
          'Groq API rate limit reached. Please wait a moment or try another provider.',
          'groq',
          'RATE_LIMITED',
          429,
          model
        );
      } else {
        throw new ProviderError(
          `Groq API error (${response.status}): ${groqMsg}`,
          'groq',
          'PROVIDER_ERROR',
          response.status,
          model
        );
      }
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';

    return {
      content,
      model,
      provider: this.providerType,
      tokensUsed: {
        prompt: data.usage?.prompt_tokens ?? Math.ceil(request.systemPrompt.length / 4),
        completion: data.usage?.completion_tokens ?? Math.ceil(content.length / 4),
        total: data.usage?.total_tokens ?? Math.ceil((request.systemPrompt.length + content.length) / 4),
      },
      isMock: false,
      finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: any;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = null;
      }
      const groqCode = parsedError?.error?.code;
      const groqMsg = parsedError?.error?.message || errorText;

      if (response.status === 404 || groqCode === 'model_not_found') {
        throw new ProviderError(
          `Groq model '${this.modelName}' not found. Update GROQ_TEXT_MODEL.`,
          'groq',
          'MODEL_NOT_FOUND',
          404,
          this.modelName
        );
      }
      throw new ProviderError(
        `Groq streaming error (${response.status}): ${groqMsg}`,
        'groq',
        'PROVIDER_STREAM_ERROR',
        response.status,
        this.modelName
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError('No response body returned from Groq stream.', 'groq', 'EMPTY_STREAM', 500);
    }

    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
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
