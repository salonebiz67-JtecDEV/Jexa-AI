import { GoogleGenAI } from '@google/genai';
import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType } from '../../shared/types/provider';

export class GeminiTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'gemini';
  public readonly modelName = 'gemini-3.8-flash';
  private ai: GoogleGenAI | null = null;
  public readonly isConfigured: boolean = false;

  constructor() {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.TEXT_AI_API_KEY;

    if (apiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey });
        this.isConfigured = true;
      } catch (err) {
        console.error('[GeminiTextAIProvider] Initialization error:', err);
        this.isConfigured = false;
      }
    }
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new Error('JEXA AI service is unconfigured. Set GEMINI_API_KEY or AI_API_KEY on the server.');
    }

    try {
      // Map chat messages to Gemini content format
      // Note: role must be 'user' or 'model'
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
      throw new Error(error.message || 'Failed to generate response from Gemini API.');
    }
  }

  public async streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse> {
    if (!this.ai || !this.isConfigured) {
      throw new Error('JEXA AI service is unconfigured. Set GEMINI_API_KEY or AI_API_KEY on the server.');
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
      throw new Error(error.message || 'Failed to stream response from Gemini API.');
    }
  }
}
