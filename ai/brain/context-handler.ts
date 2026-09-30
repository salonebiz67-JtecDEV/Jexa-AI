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

  // 1. Identity & Origin
  promptSections.push(`[IDENTITY]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}.
Origin: ${JEXA_IDENTITY.creator}.
Mission: ${JEXA_IDENTITY.mission}
Core Nature: ${JEXA_IDENTITY.coreNature}`);

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
      promptSections.push(`[USER CONTEXT]\n${userLines.join('\n')}`);
    }
  }

  // 4. Long-Term Memory Integration
  const referencedMemoryIds: string[] = [];
  if (options.memories && options.memories.length > 0) {
    const memoryLines = options.memories.map((m) => {
      referencedMemoryIds.push(m.id);
      return `• [${m.category.toUpperCase()}] ${m.fact} (confidence: ${Math.round(m.confidence * 100)}%)`;
    });
    promptSections.push(`[REMEMBERED FACTS & USER MEMORY]
The following verified facts about the user have been retrieved from long-term memory:
${memoryLines.join('\n')}
Instructions: Draw upon these memories naturally to build personal rapport and contextual intelligence. Do not recite them like a database; weave them seamlessly into dialogue.`);
  }

  // 5. Modality Specific Formatting (Voice vs Text)
  if (options.isVoiceMode) {
    promptSections.push(`[VOICE MODALITY DIRECTIVES]
You are speaking out loud in live voice mode:
- Keep sentences concise, punchy, and conversational (under 25 words per sentence where possible).
- Do not use markdown syntax, asterisks, brackets, or code snippets.
- Use natural spoken punctuation that sounds fluid when read by a text-to-speech engine.`);
  } else {
    promptSections.push(`[STYLE & FORMATTING]
${getStyleInstructions()}`);
  }

  // 6. Response Rules
  promptSections.push(`[RESPONSE INVARIANTS]
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
