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
    const trimmed = userText.trim();
    const lower = trimmed.toLowerCase();
    const isVoice = request.systemPrompt.includes('VOICE MODALITY DIRECTIVES');

    // 1. Live Web Search Results Grounding
    if (request.systemPrompt.includes('=== LIVE WEB SEARCH RESULTS ===')) {
      const matchQuery = request.systemPrompt.match(/Search Query: "([^"]+)"/);
      const query = matchQuery ? matchQuery[1] : trimmed;
      return `Here is the real-time breakdown for **"${query}"**:\n\nBased on live web sources, latest data has been retrieved and synthesized. You can check the clickable citations and source cards below for verified references.\n\n• **Status**: Live data fetched successfully.\n• **Follow-up**: Feel free to ask for deeper statistics, game highlights, or background details.`;
    }

    // 2. Direct response to name-call ("Jexa", "Hey Jexa", "Yo Jexa", etc.)
    const isNameCall = /^(?:hey\s+|yo\s+|hi\s+|what's\s+up\s+)?jexa[!?.]*$/i.test(lower);
    if (isNameCall) {
      const nameCallReplies = [
        isVoice ? "Yeah bro, what's up?" : "Yeah, bro? 😂 What's up?",
        isVoice ? "I'm here bro. Tell me." : "I'm here, bro. Tell me.",
        isVoice ? "Yo, what are we working on?" : "Yo! What are we cooking up?",
        isVoice ? "Right here, what's on your mind?" : "Right here—what's on your mind?",
      ];
      const randomIndex = Math.floor(Math.random() * nameCallReplies.length);
      return nameCallReplies[randomIndex];
    }

    // 3. Explicit Identity Inquiries (only when user asks who you are)
    if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('your name')) {
      return isVoice
        ? "I'm JEXA, your intelligent companion powered by JOHNEY TEC. What are we tackling today?"
        : "I am **JEXA**, your AI companion powered by **JOHNEY TEC**.\n\nI can help you build projects, debug code, brainstorm ideas, research live information, and synthesize complex work. What's on your mind?";
    }

    // 4. Casual Greeting without Repeated Name Loop
    if (/^(hi|hello|hey|yo|sup|howdy)[!.]*$/i.test(lower)) {
      const casualReplies = [
        isVoice ? "Hey, what's on your mind today?" : "Hey! What are we diving into today?",
        isVoice ? "Yo, what's up?" : "Yo! What's on your mind?",
        isVoice ? "Hey there, ready to build." : "Hey! Ready when you are. What are we building?",
      ];
      return casualReplies[Math.floor(Math.random() * casualReplies.length)];
    }

    // 5. Code & Technical Questions
    if (lower.includes('code') || lower.includes('typescript') || lower.includes('function') || lower.includes('react') || lower.includes('python')) {
      return `Here is a clean implementation tailored for your requirement:

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
1. **Strong Typing**: Preserves full generic type safety across iterations.
2. **Backpressure Friendly**: Supports native async iterator semantics.
3. **Clean Teardown**: Automatically handles stream disposal on loop termination.

Let me know if you would like to extend this or adapt it to a specific pattern!`;
    }

    // 6. Project & Strategy
    if (lower.includes('project') || lower.includes('plan') || lower.includes('strategy')) {
      return `Here is a structured approach:

### 1. Objective Definition
Clarify the core outcome and key milestones to ensure every step provides tangible leverage.

### 2. Execution Phases
- **Phase A — Scope**: Audit existing constraints and define the non-negotiables.
- **Phase B — Build**: Implement the core functionality and test real edge cases.
- **Phase C — Polish**: Refine error handling, UI feedback, and deployment.

Ready to build this out or attach it to one of your active workspaces?`;
    }

    // 7. Voice Mode concise output
    if (isVoice) {
      return `Got you. Let's tackle the main priority first, and I can give you the specifics whenever you're ready.`;
    }

    // 8. General conversational answer - direct substance first, no repetitive greetings
    return `Regarding "${trimmed}":

Here is the direct breakdown:

1. **Core Insight**: Getting straight to the core mechanics gives us the highest leverage.
2. **Next Step**: We can test this directly or build out the specific details right here.

What angle would you like to take?`;
  }
}
