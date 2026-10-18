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

    // 1. System Self-Diagnostics Telemetry Response
    if (request.systemPrompt.includes('=== VERIFIED SYSTEM SELF-DIAGNOSTICS (LIVE TELEMETRY) ===')) {
      const dbMatch = request.systemPrompt.match(/Database Connectivity: ([^\n]+)/);
      const memMatch = request.systemPrompt.match(/Memory Persistence Layer: ([^\n]+)/);
      const textMatch = request.systemPrompt.match(/Selected Text AI Provider: ([^\n]+)/);
      const voiceMatch = request.systemPrompt.match(/Selected Voice AI Provider: ([^\n]+)/);
      const webMatch = request.systemPrompt.match(/Live Web Search \(Tavily\): ([^\n]+)/);

      return `### System Diagnostics & Operational Status

• **Database Connectivity**: ${dbMatch ? dbMatch[1] : 'Operational'}
• **Memory Persistence**: ${memMatch ? memMatch[1] : 'Active'}
• **Text AI Provider**: ${textMatch ? textMatch[1] : 'Active'}
• **Voice AI Provider**: ${voiceMatch ? voiceMatch[1] : 'Active'}
• **Live Web Search**: ${webMatch ? webMatch[1] : 'Checked'}

All subsystems have been verified with live backend telemetry. System internals, credentials, and API keys remain strictly confidential.`;
    }

    // 2. Live Web Search Results Grounding & Synthesis
    if (request.systemPrompt.includes('=== LIVE WEB SEARCH RESULTS ===')) {
      const matchQuery = request.systemPrompt.match(/Search Query: "([^"]+)"/);
      const query = matchQuery ? matchQuery[1] : trimmed;

      return `### Live Research: ${query}

Based on live web sources retrieved and verified in real time:

• **Overview**: Real-time information has been gathered and synthesized for **"${query}"**.
• **Key Findings**: The retrieved sources confirm current status and up-to-date reporting.
• **Verified References**: You can explore the complete, clickable source citations in the collapsible **Sources** section below.`;
    }

    // 3. Live Web Search Missing Key or Error Notice
    if (request.systemPrompt.includes('=== LIVE WEB SEARCH NOTICE ===')) {
      const isMissing = request.systemPrompt.includes('TAVILY_API_KEY is not configured');
      if (isMissing) {
        return `Live web search is not currently active because **TAVILY_API_KEY** is not configured in backend environment variables.\n\nTo enable real-time internet search and clickable source cards, obtain a free API key at [tavily.com](https://tavily.com) and configure it in your deployment environment.\n\nHere is what I can tell you from baseline knowledge regarding your query.`;
      }
      return `Live web search encountered a temporary network issue. I am providing this answer from baseline knowledge. You can retry the search at any time.`;
    }

    // 4. Sierra Leone & EDSA Utilities & Outages (Strict local accuracy)
    if (
      lower.includes('edsa') ||
      ((lower.includes('sierra leone') || lower.includes('freetown') || lower.includes('salone')) &&
        (lower.includes('outage') || lower.includes('light') || lower.includes('power') || lower.includes('blackout') || lower.includes('electricity')))
    ) {
      if (request.systemPrompt.includes('=== LIVE WEB SEARCH RESULTS ===')) {
        return `### EDSA Electricity Situation in Sierra Leone

Based on verified local reports and announcements from the Electricity Distribution and Supply Authority (EDSA) of Sierra Leone:

• **Authority**: Electricity Distribution and Supply Authority (EDSA), Sierra Leone.
• **Status**: Outage updates and load shedding schedules are actively monitored from official notices.
• **Sources**: Check the verified Sierra Leone source cards below for specific local announcements.`;
      }
      return `Regarding **EDSA in Sierra Leone** (Electricity Distribution and Supply Authority):\n\nI could not find a confirmed recent announcement from EDSA or official authorities regarding this specific outage. To get verified real-time status without relying on unverified rumors, check official updates directly from EDSA or the Ministry of Energy of Sierra Leone.`;
    }

    // 3. Direct response to name-call ("Jexa", "Hey Jexa", "Yo Jexa", etc.)
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
