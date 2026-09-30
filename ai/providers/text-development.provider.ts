import { ITextAIProvider, TextGenerationRequest, TextGenerationResponse } from './text-provider.interface';
import { TextProviderType } from '../../shared/types/provider';

export class DevelopmentTextAIProvider implements ITextAIProvider {
  public readonly providerType: TextProviderType = 'development_mock';
  public readonly isConfigured: boolean = true;
  public readonly modelName: string = 'jexa-foundation-v1';

  public async generateResponse(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const responseText = this.craftCompanionResponse(lastUserMessage, request);

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
  }

  public async streamResponse(
    request: TextGenerationRequest,
    onChunk: (chunk: string, isLast: boolean) => void
  ): Promise<TextGenerationResponse> {
    const fullResponse = await this.generateResponse(request);
    const words = fullResponse.content.split(' ');

    for (let i = 0; i < words.length; i++) {
      const isLast = i === words.length - 1;
      const chunk = (i === 0 ? '' : ' ') + words[i];
      onChunk(chunk, isLast);
      await new Promise((resolve) => setTimeout(resolve, 18));
    }

    return fullResponse;
  }

  private craftCompanionResponse(userText: string, request: TextGenerationRequest): string {
    const lower = userText.toLowerCase().trim();
    const isVoice = request.systemPrompt.includes('VOICE MODALITY DIRECTIVES');

    if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('your name')) {
      return isVoice
        ? "I'm JEXA, your intelligent assistant powered by JOHNEY TEC. How can I help you today?"
        : "I am **JEXA**, your personal AI assistant powered by **JOHNEY TEC**.\n\nI can help you brainstorm concepts, organize projects, analyze ideas, generate creative writing, manage tasks, and synthesize complex information. What are you working on today?";
    }

    if (lower.includes('code') || lower.includes('typescript') || lower.includes('function') || lower.includes('react') || lower.includes('python')) {
      return `Here is a clean, modern implementation tailored for your requirement:

\`\`\`typescript
// Utility function for processing async streams
export async function streamData<T>(
  generator: AsyncIterable<T>,
  onData: (chunk: T) => void
): Promise<void> {
  for await (const chunk of generator) {
    onData(chunk);
  }
}
\`\`\`

### Key Points:
1. **Strong Typing**: Fully preserves generic type safety across iterations.
2. **Backpressure Friendly**: Supports native async iterator semantics.
3. **Clean Teardown**: Automatically handles stream disposal on loop termination.

Let me know if you would like me to extend this or adapt it to your specific use case!`;
    }

    if (lower.includes('project') || lower.includes('plan') || lower.includes('strategy')) {
      return `Here is a structured approach to tackle this:

### 1. Objective Definition
Clarify the core outcome and key milestones to ensure every step provides tangible leverage.

### 2. Execution Phases
- **Phase A — Discovery & Scope**: Audit existing constraints and define the non-negotiables.
- **Phase B — Prototyping**: Build a high-fidelity proof of concept to validate assumptions.
- **Phase C — Polish & Delivery**: Refine edge cases, optimize performance, and launch.

### 3. Next High-Leverage Move
Would you like me to create this inside your **Projects** workspace so we can attach reference files and track progress?`;
    }

    if (lower.includes('schedule') || lower.includes('remind') || lower.includes('routine')) {
      return `I've prepared this schedule recommendation for you:

• **Daily Morning Briefing** (8:00 AM) — Overview of priorities and scheduled tasks.
• **Deep Work Block** (10:00 AM – 1:00 PM) — Uninterrupted focus on primary deliverables.
• **Afternoon Review** (4:30 PM) — Quick recap of completed action items and tomorrow's roadmap.

You can also view and toggle this anytime in the **Schedule** section in the sidebar.`;
    }

    if (isVoice) {
      return `I hear you. Regarding "${userText.slice(0, 35)}...", here is what I recommend: let's focus on the key priority first, and I can draft the specifics whenever you're ready.`;
    }

    return `I understand. Regarding:

> *${userText}*

Here are a few thoughtful perspectives and immediate suggestions:

1. **Clarity First**: Breaking down the main objectives helps avoid unnecessary friction early on.
2. **Iterative Progress**: Starting with a focused first draft gives us immediate material to refine.
3. **Actionable Next Step**: We can save this note to one of your active **Projects** or continue developing the idea right here.

How would you like to proceed?`;
  }
}
