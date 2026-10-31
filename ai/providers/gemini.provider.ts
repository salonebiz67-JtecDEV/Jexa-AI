import { GoogleGenAI } from '@google/genai';
import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType, ProviderError, formatCleanProviderError } from '../../shared/types/provider';
import { ErrorLogService } from '../../backend/src/services/error-log.service';

export class GeminiTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'gemini';
  public readonly modelName: string;
  public readonly supportsTools: boolean = true;
  private static supportsThinkingConfig: boolean = true;
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;
  public lastError?: string;

  constructor(customModel?: string) {
    let rawModel = (
      customModel ||
      process.env.TEXT_AI_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.8-flash'
    ).trim();

    if (rawModel.toLowerCase().includes('-tts') || rawModel.toLowerCase().endsWith('tts')) {
      console.warn(`[GeminiTextAIProvider] TTS model '${rawModel}' cannot be used as a text model. Reverting to 'gemini-3.8-flash'.`);
      rawModel = 'gemini-3.8-flash';
    }

    // Automatically alias deprecated models to modern gemini-3.8-flash
    if (rawModel === 'gemini-2.5-flash' || rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-pro') {
      rawModel = 'gemini-3.8-flash';
    }

    this.modelName = rawModel;

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.TEXT_AI_API_KEY;

    if (apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey });
        this.isConfigured = true;
        console.log(`[GeminiTextAIProvider] Initialized with model: ${this.modelName}`);
      } catch (err: any) {
        console.error('[GeminiTextAIProvider] Initialization error:', err);
        this.isConfigured = false;
        this.lastError = err.message;
      }
    }
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
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: m.name || 'tool',
                response: outputObj,
              },
            },
          ],
        });
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
        contents.push({
          role: 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    // Drop any leading model turns so conversation always starts with user turn
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    return contents;
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new ProviderError(
        'Gemini AI service is unconfigured. Set GEMINI_API_KEY on the server.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
    }

    const contents = this.formatGeminiContents(request.messages);

    const maxTokens = request.maxTokens ?? 4096;
    const config: any = {
      systemInstruction: request.systemPrompt,
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: maxTokens,
    };

    // Small thinking budget if supported so thinking can never use up the whole answer
    if (GeminiTextAIProvider.supportsThinkingConfig && maxTokens > 300) {
      config.thinkingConfig = {
        thinkingBudget: 256,
      };
    }

    if (request.tools && request.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: t.parameters.properties || {},
              required: t.parameters.required || [],
            },
          })),
        },
      ];
    }

    // 30 second timeout controller for this call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);
    config.abortSignal = controller.signal;

    let lastError: any = null;

    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model: this.modelName,
            contents,
            config,
          });

          const responseText = response.text || '';
          this.lastError = undefined;

          const candidateParts = response.candidates?.[0]?.content?.parts;

          // Extract native function calls
          let detectedCalls: any[] = [];
          if (response.functionCalls && response.functionCalls.length > 0) {
            detectedCalls = response.functionCalls.map((fc: any, idx: number) => ({
              id: `call_${Date.now()}_${idx}`,
              name: fc.name,
              args: fc.args || {},
            }));
          } else {
            const parts = candidateParts || [];
            const functionCallParts = parts.filter((p: any) => Boolean(p.functionCall));
            if (functionCallParts.length > 0) {
              detectedCalls = functionCallParts.map((p: any, idx: number) => ({
                id: `call_${Date.now()}_${idx}`,
                name: p.functionCall.name,
                args: p.functionCall.args || {},
              }));
            }
          }

          const hasToolCalls = detectedCalls.length > 0;

          return {
            content: responseText,
            model: this.modelName,
            provider: this.providerType,
            tokensUsed: {
              prompt: Math.ceil(request.systemPrompt.length / 4),
              completion: Math.ceil((responseText.length || 20) / 4),
              total: Math.ceil((request.systemPrompt.length + (responseText.length || 20)) / 4),
            },
            isMock: false,
            finishReason: hasToolCalls ? 'tool_call' : 'stop',
            toolCalls: hasToolCalls ? detectedCalls : undefined,
            rawModelParts: candidateParts,
          };
        } catch (error: any) {
          lastError = error;

          // If aborted by our 30 second timeout, stop immediately and report timeout
          if (controller.signal.aborted) {
            throw new ProviderError(
              'Gemini request timed out after 30 seconds.',
              'gemini',
              'PROVIDER_TIMEOUT',
              504,
              this.modelName
            );
          }

          const msg = String(error?.message || '');

          // Requirement 6: If API rejects thinkingConfig, retry once without it and stop sending it after that
          const isThinkingConfigRejection =
            config.thinkingConfig &&
            (/thinking[-_]?config|thinking[-_]?budget|thinking_process/i.test(msg) ||
              (msg.includes('INVALID_ARGUMENT') && /thinking/i.test(msg)));

          if (isThinkingConfigRejection) {
            console.warn('[GeminiTextAIProvider] API rejected thinkingConfig. Disabling thinkingConfig and retrying once...');
            GeminiTextAIProvider.supportsThinkingConfig = false;
            delete config.thinkingConfig;
            try {
              const retryResponse = await this.ai.models.generateContent({
                model: this.modelName,
                contents,
                config,
              });
              const retryText = retryResponse.text || '';
              return {
                content: retryText,
                model: this.modelName,
                provider: this.providerType,
                tokensUsed: {
                  prompt: Math.ceil(request.systemPrompt.length / 4),
                  completion: Math.ceil((retryText.length || 20) / 4),
                  total: Math.ceil((request.systemPrompt.length + (retryText.length || 20)) / 4),
                },
                isMock: false,
                finishReason: 'stop',
              };
            } catch (retryErr: any) {
              lastError = retryErr;
            }
            break;
          }

          if (attempt < 2 && (msg.includes('503') || msg.includes('429') || msg.includes('high demand') || msg.includes('RESOURCE_EXHAUSTED'))) {
            console.warn(`[GeminiTextAIProvider] Transient error on attempt ${attempt}, retrying in 600ms...`);
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break;
        }
      }

      console.error('[GeminiTextAIProvider] API call failed:', lastError);
      if (lastError && typeof lastError === 'object') {
        (lastError as any).provider = 'gemini';
        (lastError as any).model = this.modelName;
      }
      ErrorLogService.log('ai_provider', lastError, { provider: 'gemini', model: this.modelName });
      const formatted = formatCleanProviderError(lastError);
      this.lastError = formatted.cleanMessage;

      throw new ProviderError(
        formatted.cleanMessage,
        'gemini',
        formatted.code,
        formatted.statusCode,
        this.modelName,
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
    if (!this.ai || !this.isConfigured) {
      throw new ProviderError(
        'Gemini AI service is unconfigured. Set GEMINI_API_KEY.',
        'gemini',
        'MISSING_CREDENTIALS',
        400,
        this.modelName
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    try {
      const contents = this.formatGeminiContents(request.messages);

      const maxTokens = request.maxTokens ?? 4096;
      const config: any = {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal,
      };

      // Small thinking budget if supported so thinking can never use up the whole answer
      if (GeminiTextAIProvider.supportsThinkingConfig && maxTokens > 300) {
        config.thinkingConfig = {
          thinkingBudget: 256,
        };
      }

      let responseStream: any;
      try {
        responseStream = await this.ai.models.generateContentStream({
          model: this.modelName,
          contents,
          config,
        });
      } catch (streamInitErr: any) {
        if (controller.signal.aborted) {
          throw new ProviderError(
            'Gemini stream request timed out after 30 seconds.',
            'gemini',
            'PROVIDER_TIMEOUT',
            504,
            this.modelName
          );
        }
        const msg = String(streamInitErr?.message || '');
        if (
          config.thinkingConfig &&
          (/thinking[-_]?config|thinking[-_]?budget|thinking_process/i.test(msg) ||
            (msg.includes('INVALID_ARGUMENT') && /thinking/i.test(msg)))
        ) {
          console.warn('[GeminiTextAIProvider] Stream rejected thinkingConfig. Disabling thinkingConfig and retrying stream setup...');
          GeminiTextAIProvider.supportsThinkingConfig = false;
          delete config.thinkingConfig;
          responseStream = await this.ai.models.generateContentStream({
            model: this.modelName,
            contents,
            config,
          });
        } else {
          throw streamInitErr;
        }
      }

      let fullText = '';
      for await (const chunk of responseStream) {
        if (controller.signal.aborted) {
          throw new ProviderError(
            'Gemini stream request timed out after 30 seconds.',
            'gemini',
            'PROVIDER_TIMEOUT',
            504,
            this.modelName
          );
        }
        const piece = chunk.text || '';
        fullText += piece;
        onChunk(piece, false);
      }

      onChunk('', true);
      this.lastError = undefined;

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
    } catch (error: any) {
      if (controller.signal.aborted || error?.code === 'PROVIDER_TIMEOUT') {
        const timeoutErr = new ProviderError(
          'Gemini stream request timed out after 30 seconds.',
          'gemini',
          'PROVIDER_TIMEOUT',
          504,
          this.modelName
        );
        ErrorLogService.log('ai_provider', timeoutErr, { provider: 'gemini', model: this.modelName, stream: true });
        this.lastError = timeoutErr.message;
        throw timeoutErr;
      }
      console.error('[GeminiTextAIProvider] Streaming failed:', error);
      if (error && typeof error === 'object') {
        (error as any).provider = 'gemini';
        (error as any).model = this.modelName;
      }
      ErrorLogService.log('ai_provider', error, { provider: 'gemini', model: this.modelName, stream: true });
      const formatted = formatCleanProviderError(error);
      this.lastError = formatted.cleanMessage;
      throw new ProviderError(
        formatted.cleanMessage,
        'gemini',
        formatted.code,
        formatted.statusCode,
        this.modelName,
        formatted.retryAfterSeconds
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; model: string; error?: string }> {
    if (!this.ai || !this.isConfigured) {
      return {
        success: false,
        latencyMs: 0,
        model: this.modelName,
        error: 'GEMINI_API_KEY is not configured on the backend server.',
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
        model: this.modelName,
        error: formatted.cleanMessage,
      };
    }
  }
}
