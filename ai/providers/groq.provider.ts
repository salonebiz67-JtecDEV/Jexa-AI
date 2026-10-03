import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType } from '../../shared/types/provider';

export class GroqTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'groq';
  public readonly modelName: string;
  private readonly apiKey: string;
  public readonly isConfigured: boolean;

  constructor(customModel?: string) {
    this.apiKey = (process.env.GROQ_API_KEY || '').trim();
    this.modelName = customModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    this.isConfigured = Boolean(this.apiKey);

    if (this.isConfigured) {
      console.log(`[GroqTextAIProvider] Initialized with model: ${this.modelName}`);
    } else {
      console.warn('[GroqTextAIProvider] GROQ_API_KEY is not set. Groq provider will not be available until configured.');
    }
  }

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new Error('Groq AI service is unconfigured. Please set GROQ_API_KEY in your environment variables.');
    }

    try {
      const messages: Array<{ role: string; content: string }> = [];

      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      for (const m of request.messages) {
        messages.push({
          role: m.role,
          content: m.content,
        });
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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';

      return {
        content,
        model: this.modelName,
        provider: this.providerType,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens ?? Math.ceil(request.systemPrompt.length / 4),
          completion: data.usage?.completion_tokens ?? Math.ceil(content.length / 4),
          total: data.usage?.total_tokens ?? Math.ceil((request.systemPrompt.length + content.length) / 4),
        },
        isMock: false,
        finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
      };
    } catch (error: any) {
      console.error('[GroqTextAIProvider] API call failed:', error);
      throw new Error(error.message || 'Failed to generate response from Groq API.');
    }
  }

  public async streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse> {
    if (!this.isConfigured || !this.apiKey) {
      throw new Error('Groq AI service is unconfigured. Please set GROQ_API_KEY in your environment variables.');
    }

    try {
      const messages: Array<{ role: string; content: string }> = [];

      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      for (const m of request.messages) {
        messages.push({
          role: m.role,
          content: m.content,
        });
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
        throw new Error(`Groq API stream error (${response.status}): ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body returned from Groq API stream.');
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
          if (dataStr === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onChunk(delta, false);
            }
          } catch {
            // ignore non-json keep-alive comments
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
    } catch (error: any) {
      console.error('[GroqTextAIProvider] Streaming failed:', error);
      throw new Error(error.message || 'Failed to stream response from Groq API.');
    }
  }
}
