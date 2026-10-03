import { GoogleGenAI } from '@google/genai';
import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType, ProviderError } from '../../shared/types/provider';

export class GeminiTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'gemini';
  public readonly modelName: string;
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;
  public lastError?: string;

  constructor(customModel?: string) {
    this.modelName = (
      customModel ||
      process.env.TEXT_AI_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.8-flash'
    ).trim();

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

    try {
      const contents = request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1024,
        },
      });

      const responseText = response.text || '';

      return {
        content: responseText,
        model: this.modelName,
        provider: this.providerType,
        tokensUsed: {
          prompt: Math.ceil(request.systemPrompt.length / 4),
          completion: Math.ceil(responseText.length / 4),
          total: Math.ceil((request.systemPrompt.length + responseText.length) / 4),
        },
        isMock: false,
        finishReason: 'stop',
      };
    } catch (error: any) {
      console.error('[GeminiTextAIProvider] API call failed:', error);
      this.lastError = error.message;

      const errMsg = error.message || '';
      let code = 'PROVIDER_ERROR';
      let statusCode = 500;

      if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('API key')) {
        code = 'AUTHENTICATION_ERROR';
        statusCode = 403;
      } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        code = 'RATE_LIMITED';
        statusCode = 429;
      } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
        code = 'PROVIDER_UNAVAILABLE';
        statusCode = 503;
      } else if (errMsg.includes('not found') || errMsg.includes('404')) {
        code = 'MODEL_NOT_FOUND';
        statusCode = 404;
      }

      throw new ProviderError(
        `Gemini API error: ${errMsg}`,
        'gemini',
        code,
        statusCode,
        this.modelName
      );
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

    try {
      const contents = request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const responseStream = await this.ai.models.generateContentStream({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1024,
        },
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const piece = chunk.text || '';
        fullText += piece;
        onChunk(piece, false);
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
    } catch (error: any) {
      console.error('[GeminiTextAIProvider] Streaming failed:', error);
      this.lastError = error.message;
      throw new ProviderError(
        `Gemini stream error: ${error.message || 'Stream generation failed'}`,
        'gemini',
        'PROVIDER_STREAM_ERROR',
        500,
        this.modelName
      );
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
