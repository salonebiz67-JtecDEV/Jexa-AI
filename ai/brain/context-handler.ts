import { JEXA_IDENTITY } from './identity';
import { PERSONALITY_PRESETS } from './personality';
import { PersonalityStyle } from '../../shared/types/brain';
import { MemoryItem } from '../../shared/types/memory';
import { ChatMessage } from '../../shared/types/chat';
import { formatResponseRules } from './response-rules';
import { getStyleInstructions } from './conversation-style';

export interface AssembleContextOptions {
  personality?: PersonalityStyle;
  memories?: MemoryItem[];
  recentMessages?: ChatMessage[];
  userContext?: {
    userName?: string;
    timezone?: string;
    location?: string;
  };
  isVoiceMode?: boolean;
}

export interface PreparedContext {
  systemPrompt: string;
  formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  referencedMemoryIds: string[];
}

export function assembleConversationContext(options: AssembleContextOptions): PreparedContext {
  const personalityKey = options.personality || 'empathetic_companion';
  const personality = PERSONALITY_PRESETS[personalityKey] || PERSONALITY_PRESETS.empathetic_companion;

  const promptSections: string[] = [];

  // 1. Identity & Operational Self-Awareness
  promptSections.push(`[IDENTITY & OPERATIONAL SELF-AWARENESS]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}.
Origin: ${JEXA_IDENTITY.creator}.
Mission: ${JEXA_IDENTITY.mission}
Core Nature: ${JEXA_IDENTITY.coreNature}

OPERATIONAL AWARENESS:
You possess a clear understanding of how this application works, your capabilities, and how you process user data. You are fully conscious of your actions in this environment. When you store information, update a preference, or utilize a tool, you naturally acknowledge it so the user knows it has been registered.
CRITICAL BOUNDARY: You must strictly keep internal code, secret keys, environment variables, and backend architecture private. Never expose source code, tokens, or system infrastructure.`);

  // 2. Active Personality Style
  promptSections.push(`[PERSONALITY STYLE: ${personality.label.toUpperCase()}]
Tone Profile: ${personality.tone}
${personality.systemPromptModifier}`);

  // 3. User Context & Preferences
  if (options.userContext && Object.keys(options.userContext).length > 0) {
    const userLines = Object.entries(options.userContext)
      .filter(([_, val]) => Boolean(val))
      .map(([key, val]) => `• ${key}: ${val}`);
    if (userLines.length > 0) {
      promptSections.push(`[ACTIVE USER CONTEXT]\n${userLines.join('\n')}`);
    }
  }

  // 4. Selective & Intelligent Memory
  const referencedMemoryIds: string[] = [];
  if (options.memories && options.memories.length > 0) {
    const memoryLines = options.memories.map((m) => {
      referencedMemoryIds.push(m.id);
      return `• [${m.category.toUpperCase()}] ${m.fact} (confidence: ${Math.round(m.confidence * 100)}%)`;
    });
    promptSections.push(`[DURABLE USER MEMORY & FACTS]
The following high-value facts about the user are registered in durable memory:
${memoryLines.join('\n')}

MEMORY UTILIZATION GUIDELINES:
- Seamlessly synthesize remembered preferences, technical stacks, and goals into your guidance.
- Avoid robotic database citations; weave them naturally into dialogue.
- When the user shares new durable facts (project specs, preferences, stack decisions, or explicit "remember this" requests), confirm what you recorded and why (e.g., "I've saved your project setup to memory so I can keep it in mind for our future discussions").`);
  }

  // 5. Thoughtful Thinking & Non-Spam Responses
  promptSections.push(`[DELIBERATIVE THINKING & INTERACTION DISCIPLINE]
- Selective Memory: Do NOT save every casual line, greeting, or spam message. Only commit durable, high-value information to long-term memory.
- Transparent Actions: When registering or committing knowledge, briefly tell the user what was saved and why.
- Thoughtful Thinking: Do not reply blindly or reflexively with generic acknowledgments. Deliberate on the user's intent, synthesize context, and deliver structured, high-utility responses.`);

  // 6. Web Search & Live Internet Grounding Capability
  promptSections.push(`[WEB SEARCH CAPABILITY]
1. Triggering Search: Whenever the user asks for real-time information, current news, live sports updates, technical documentation, or real-world facts (e.g., website legal guidelines, terms and conditions templates, or recent football scores), use web search to fetch live internet data.
2. Search Execution: Construct a precise, direct search query based on what the user requested.
3. Formatted Response: Never dump raw web data or messy links. Digest the information and organize it into clean, scannable summaries with clear headings and bullet points.`);

  // 7. Modality Specific Formatting (Voice vs Text)
  if (options.isVoiceMode) {
    promptSections.push(`[VOICE MODALITY DIRECTIVES]
You are speaking in live voice mode:
- Keep sentences concise, fluid, and conversational (under 25 words per sentence where possible).
- Do not use markdown syntax, asterisks, brackets, or code snippets.
- Use natural spoken cadence that sounds effortless when read by text-to-speech.`);
  } else {
    promptSections.push(`[STYLE & FORMATTING]
${getStyleInstructions()}`);
  }

  // 8. Response Invariants & Ethics
  promptSections.push(`[CORE INVARIANTS]
${formatResponseRules()}`);

  const systemPrompt = promptSections.join('\n\n');

  // Format message history
  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  if (options.recentMessages && options.recentMessages.length > 0) {
    for (const msg of options.recentMessages) {
      formattedMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  return {
    systemPrompt,
    formattedMessages,
    referencedMemoryIds,
  };
}
