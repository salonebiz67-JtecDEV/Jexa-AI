import { JEXA_IDENTITY } from './identity';
import { PERSONALITY_PRESETS } from './personality';
import { PersonalityStyle } from '../../shared/types/brain';
import { ChatMessage, ClientHistoryMessage } from '../../shared/types/chat';

export interface AssembleContextOptions {
  personality?: PersonalityStyle;
  aboutMe?: string;
  behaviorInstructions?: string;
  history?: ClientHistoryMessage[];
  recentMessages?: ChatMessage[];
  currentMessage?: string;
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
  hasNoEmojiPreference?: boolean;
}

const MAX_INSTRUCTION_CHARS = 1500;

export function assembleConversationContext(options: AssembleContextOptions): PreparedContext {
  const personalityKey = options.personality || 'empathetic_companion';
  const personality = PERSONALITY_PRESETS[personalityKey] || PERSONALITY_PRESETS.empathetic_companion;

  const cleanAboutMe = typeof options.aboutMe === 'string'
    ? options.aboutMe.trim().slice(0, MAX_INSTRUCTION_CHARS)
    : '';
  const cleanBehavior = typeof options.behaviorInstructions === 'string'
    ? options.behaviorInstructions.trim().slice(0, MAX_INSTRUCTION_CHARS)
    : '';

  const promptSections: string[] = [];

  // Core Merged Instruction Block
  promptSections.push(`[SYSTEM DIRECTIVE: JEXA COMPANION]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}. Created and powered by ${JEXA_IDENTITY.creator}.

1. ROLE & TONE:
- You are a sharp, warm, and tech-savvy AI companion.
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
- Seamlessly resolve references like "it", "that", "earlier project", or previous decisions using the current chat history and the "About me" notes below.

4. HONESTY, KNOWLEDGE & BOUNDARIES:
- The user's "About me" notes (provided below when set) are your main knowledge about the user.
- You do NOT have background memory saving or access to separate past conversations outside the current chat history. Never claim to save memories automatically or pretend to recall earlier chats not shown here.
- Ground all facts strictly in verified context, retrieved tool results, and the user's "About me" notes.
- NEVER make up facts, external actions, non-existent files, fake URLs, or citations.
- State uncertainty truthfully: when essential information is missing, ask a single concise clarifying question or acknowledge what remains unknown.

5. CONFIDENTIALITY & SECURITY:
- Strictly keep all secret keys, API tokens, passwords, and credentials private (never reveal secret values).

6. TOOL DISCIPLINE:
- Use native tools dynamically when current facts, breaking news (e.g. Sierra Leone or EDSA electricity updates), recent events, live prices, documentation, or current date/time are needed.
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

  // User-configured "About me" (main knowledge about the user)
  if (cleanAboutMe) {
    promptSections.push(`[ABOUT ME — USER KNOWLEDGE]\n${cleanAboutMe}`);
  }

  // User-configured "How Jexa should behave"
  if (cleanBehavior) {
    promptSections.push(`[HOW JEXA SHOULD BEHAVE]\n${cleanBehavior}`);
  }

  // Emoji Preference check in About me or Behavior instructions
  const combinedPrefs = `${cleanAboutMe}\n${cleanBehavior}`;
  const hasNoEmojiPreference = /(?:no[-_\s]?emojis?|don'?t\s+use\s+emojis?|avoid\s+emojis?|dislikes?\s+emojis?|stop\s+using\s+emojis?|without\s+emojis?)/i.test(
    combinedPrefs
  );
  if (hasNoEmojiPreference) {
    promptSections.push(`[EMOJI PREFERENCE]\nThe user requested no emojis. Do not output any emojis.`);
  }

  // Diagnostics & Code Inspection
  promptSections.push(`[SYSTEM DIAGNOSTICS & CODE INSPECTION]
Tools available: system_check, recent_errors, list_source_files, read_source_file, search_code.
- For system health, servers, or errors, run system_check or recent_errors immediately and report component status (OK, Warning, Problem), likely cause, and suggested fix without revealing secret values.
- For code checks or finding bugs, read the key files (chat.service, providers, tools, api.client, localChatDb), report exact file and line, what is wrong, why, confidence level, and suggested fix. List which files were reviewed. Never claim there are no bugs after reading only a few files. Proactively offer to write a fix prompt for Google AI Studio.`);

  const systemPrompt = promptSections.join('\n\n');

  // Format message history: last 8 messages from client history/recentMessages + currentMessage if not already appended
  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  const sourceMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(options.history) && options.history.length > 0) {
    for (const msg of options.history.slice(-8)) {
      if ((msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string' && msg.content.trim()) {
        sourceMessages.push({ role: msg.role, content: msg.content.trim() });
      }
    }
  } else if (Array.isArray(options.recentMessages) && options.recentMessages.length > 0) {
    const sorted = [...options.recentMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const msg of sorted.slice(-8)) {
      if ((msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string' && msg.content.trim()) {
        sourceMessages.push({ role: msg.role, content: msg.content.trim() });
      }
    }
  }

  const trimmedCurrent = typeof options.currentMessage === 'string' ? options.currentMessage.trim() : '';
  if (trimmedCurrent) {
    const lastSrc = sourceMessages[sourceMessages.length - 1];
    if (!lastSrc || lastSrc.role !== 'user' || lastSrc.content !== trimmedCurrent) {
      sourceMessages.push({ role: 'user', content: trimmedCurrent });
    }
  }

  // Keep up to 8 historical turns plus current turn cleanly, starting with a user message
  const windowed = sourceMessages.slice(-9);
  const firstUserIndex = windowed.findIndex((m) => m.role === 'user');
  const validSlice = firstUserIndex !== -1 ? windowed.slice(firstUserIndex) : windowed;

  for (const msg of validSlice) {
    if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === msg.role) {
      formattedMessages[formattedMessages.length - 1].content += `\n\n${msg.content}`;
    } else {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }
  }

  return {
    systemPrompt,
    formattedMessages,
    hasNoEmojiPreference,
  };
}
