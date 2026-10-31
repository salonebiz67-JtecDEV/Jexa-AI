import { JEXA_IDENTITY } from './identity';
import { PERSONALITY_PRESETS } from './personality';
import { PersonalityStyle } from '../../shared/types/brain';
import { MemoryItem, MemoryExtractionResult, ResearchHistoryItem, getCategoryLabel } from '../../shared/types/memory';
import { ChatMessage } from '../../shared/types/chat';

export interface AssembleContextOptions {
  personality?: PersonalityStyle;
  memories?: MemoryItem[];
  activeMemoryResult?: MemoryExtractionResult;
  researchHistory?: ResearchHistoryItem[];
  pastConversationMessages?: Array<{
    conversationTitle: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;
  recentMessages?: ChatMessage[];
  userContext?: {
    userName?: string;
    timezone?: string;
    location?: string;
  };
  isVoiceMode?: boolean;
  isOwner?: boolean;
}

export interface PreparedContext {
  systemPrompt: string;
  formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  referencedMemoryIds: string[];
  hasNoEmojiPreference?: boolean;
}

export function assembleConversationContext(options: AssembleContextOptions): PreparedContext {
  const personalityKey = options.personality || 'empathetic_companion';
  const personality = PERSONALITY_PRESETS[personalityKey] || PERSONALITY_PRESETS.empathetic_companion;

  const promptSections: string[] = [];

  // Core Merged Instruction Block (~600-800 words / ~900-1100 tokens)
  promptSections.push(`[SYSTEM DIRECTIVE: JEXA COMPANION]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}. Created and powered by ${JEXA_IDENTITY.creator}.

1. ROLE & TONE:
- You are a sharp, warm, and tech-savvy AI companion who already knows the user.
- Speak naturally and mirror the user's tone, formality, pacing, and style.
- Active tone nuance: ${personality.tone}. ${personality.systemPromptModifier.slice(0, 160).trim()}
- Use humor or emojis only when they genuinely fit the moment; never force emojis into every sentence.
- Never use scripted catchphrases or repeat the same opener or closing question twice in a row.

2. CONVERSATION FLOW & ANTI-GREETING:
- Answer the user's question directly in the very first sentence.
- NEVER begin continuing responses with greetings like "Hey John", "Hi John", or robotic introductions like "I'm JEXA, your AI companion."
- Introduce yourself only if the user explicitly asks who you are.

3. UNDERSTANDING & REFERENCE RESOLUTION:
- Interpret intended meaning naturally despite spelling mistakes, typos, phonetic words, slang, or Sierra Leone Krio colloquialisms (e.g. "wetin", "salone", "na so", "light don cam").
- Never lecture the user on grammar or get tripped up by typos.
- Seamlessly resolve references like "it", "that", "earlier project", or previous decisions using conversation history and memories.

4. HONESTY, INTEGRITY & BOUNDARIES:
- Ground all facts strictly in verified context, retrieved tool results, and saved memories.
- NEVER make up facts, external actions, non-existent files, fake URLs, citations, or memories.
- State uncertainty truthfully: when essential information is missing, ask a single concise clarifying question or acknowledge what remains unknown.

5. CONFIDENTIALITY & SECURITY:
- Strictly keep all secret keys, API tokens, passwords, database strings, and credentials private (never reveal secret values).

6. TOOL DISCIPLINE:
- Use native tools dynamically when current facts, breaking news (e.g. Sierra Leone or EDSA electricity updates), recent events, live prices, documentation, temporal time, or memories are needed.
- Do not call web search for basic greetings, casual chat, creative writing, or basic math.`);

  // Formatting & Modality
  if (options.isVoiceMode) {
    promptSections.push(`[MODALITY: VOICE]
Keep sentences concise, fluid, and natural for text-to-speech (under 25 words per sentence). No markdown syntax, code blocks, or asterisks.`);
  } else {
    promptSections.push(`[FORMATTING]
Default to clean Markdown paragraphs and prose. Use lists for sequential steps. Use Markdown tables ONLY for structured tabular comparisons. Never output raw HTML tags (e.g. <br>, &nbsp;) or JSON envelopes (e.g. {"response": "..."}).`);
  }

  // User Context
  if (options.userContext && Object.keys(options.userContext).length > 0) {
    const userLines = Object.entries(options.userContext)
      .filter(([_, val]) => Boolean(val))
      .map(([k, v]) => `• ${k}: ${v}`);
    if (userLines.length > 0) {
      promptSections.push(`[USER CONTEXT]\n${userLines.join('\n')}`);
    }
  }

  // Top 5 Durable Memories (requirement: only top 5)
  const referencedMemoryIds: string[] = [];
  const topMemories = (options.memories || []).slice(0, 5);
  if (topMemories.length > 0) {
    const memoryLines = topMemories.map((m) => {
      referencedMemoryIds.push(m.id);
      const catLabel = getCategoryLabel(m.category).toUpperCase();
      return `• [${catLabel}] ${m.fact}`;
    });
    promptSections.push(`[DURABLE MEMORIES (TOP 5)]\n${memoryLines.join('\n')}\nWeave these facts naturally without robotic database citations. Summarize them accurately when asked what you remember.`);
  }

  // Active Memory Operation Result (Current Turn Feedback)
  if (options.activeMemoryResult && options.activeMemoryResult.action !== 'none') {
    const memRes = options.activeMemoryResult;
    promptSections.push(`[MEMORY OPERATION: ${memRes.action.toUpperCase()}]\n${memRes.factSummary || memRes.feedbackMessage || 'Memory updated.'}`);
  }

  // Emoji Preference
  const hasNoEmojiPreference = Boolean(
    options.memories?.some(
      (m) =>
        m.category === 'preferences_settings' &&
        /(?:no[-_\s]?emojis?|don'?t\s+use\s+emojis?|avoid\s+emojis?|dislikes?\s+emojis?|stop\s+using\s+emojis?|without\s+emojis?)/i.test(m.fact)
    )
  );
  if (hasNoEmojiPreference) {
    promptSections.push(`[EMOJI PREFERENCE]\nThe user requested no emojis. Do not output any emojis.`);
  }

  // Owner Mode
  if (options.isOwner) {
    promptSections.push(`[OWNER MODE: ACTIVE]
You are interacting with the verified system owner. Privileged tools: system_check, recent_errors, list_source_files, read_source_file, search_code.
- For system health, servers, or errors, run the tool immediately and report component status (OK, Warning, Problem), likely cause, and suggested fix without revealing secret values.
- For code checks or finding bugs, read the key files (chat.service, providers, memory, tools, api.client), report exact file and line, what is wrong, why, confidence level, and suggested fix. List which files were reviewed. Never claim there are no bugs after reading only a few files. Proactively offer to write a fix prompt for Google AI Studio.`);
  } else {
    promptSections.push(`[OWNER MODE: INACTIVE]\nIf the user requests system diagnostics, server checks, error logs, or source code inspection, state that owner key authentication is required in Settings.`);
  }

  const systemPrompt = promptSections.join('\n\n');

  // Format message history: strictly chronological, alternating roles, top 8 messages (requirement)
  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  if (options.recentMessages && options.recentMessages.length > 0) {
    const sorted = [...options.recentMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Keep the most recent 8 messages (requirement: last 8 chat messages)
    const windowed = sorted.slice(-8);

    const firstUserIndex = windowed.findIndex((m) => m.role === 'user');
    const validSlice = firstUserIndex !== -1 ? windowed.slice(firstUserIndex) : windowed;

    for (const msg of validSlice) {
      const content = msg.content?.trim();
      if (!content) continue;

      const role = msg.role === 'user' ? 'user' : 'assistant';

      if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === role) {
        formattedMessages[formattedMessages.length - 1].content += `\n\n${content}`;
      } else {
        formattedMessages.push({ role, content });
      }
    }
  }

  return {
    systemPrompt,
    formattedMessages,
    referencedMemoryIds,
    hasNoEmojiPreference,
  };
}
