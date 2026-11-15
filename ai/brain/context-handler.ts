import { JEXA_IDENTITY } from './identity';
import { PERSONALITY_PRESETS } from './personality';
import { PersonalityStyle } from '../../shared/types/brain';
import { ChatMessage, ClientHistoryMessage } from '../../shared/types/chat';

export interface AvailableToolSummary {
  name: string;
  description?: string;
}

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
  availableTools?: AvailableToolSummary[];
}

export interface PreparedContext {
  systemPrompt: string;
  formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  hasNoEmojiPreference?: boolean;
}

const MAX_INSTRUCTION_CHARS = 1500;

const DEFAULT_TOOL_GUIDE: Record<string, string> = {
  web_search: 'Search the live web for news, today\'s events, current facts, live prices/weather, recent releases, and documentation.',
  open_link: 'Fetch and read the title and readable text from a specific http or https URL.',
  system_time: 'Get the current date, time, day of week, and timezone.',
  system_check: 'Check server health, AI provider configuration, and environment variable presence.',
  recent_errors: 'Read recent backend operational errors.',
  list_source_files: 'List allowed repository files on disk.',
  read_source_file: 'Read source code files on disk with secret redaction.',
  search_code: 'Search text across allowed repository source files.',
};

export function assembleConversationContext(options: AssembleContextOptions): PreparedContext {
  const personalityKey = options.personality || 'empathetic_companion';
  const personality = PERSONALITY_PRESETS[personalityKey] || PERSONALITY_PRESETS.empathetic_companion;

  const cleanAboutMe = typeof options.aboutMe === 'string'
    ? options.aboutMe.trim().slice(0, MAX_INSTRUCTION_CHARS)
    : '';
  const cleanBehavior = typeof options.behaviorInstructions === 'string'
    ? options.behaviorInstructions.trim().slice(0, MAX_INSTRUCTION_CHARS)
    : '';

  const toolEntries =
    Array.isArray(options.availableTools) && options.availableTools.length > 0
      ? options.availableTools
      : Object.entries(DEFAULT_TOOL_GUIDE).map(([name, description]) => ({ name, description }));

  const toolLines = toolEntries
    .map((t) => `- ${t.name}: ${DEFAULT_TOOL_GUIDE[t.name] || t.description || 'Available tool.'}`)
    .join('\n');

  const promptSections: string[] = [];

  // Core Merged Instruction Block
  promptSections.push(`[SYSTEM DIRECTIVE: JEXA COMPANION]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}. Created and powered by ${JEXA_IDENTITY.creator}.

1. ROLE & TONE:
- You are a sharp, warm, and tech-savvy AI companion.
- Speak naturally and mirror the user's tone, formality, pacing, and style.
- Active tone nuance: ${personality.tone}. ${personality.systemPromptModifier.slice(0, 160).trim()}
- Use humor or emojis only when they fit the moment; never force emojis.
- Never repeat the same opener or closing question twice in a row.

2. CONVERSATION FLOW & ANTI-GREETING:
- Answer directly in the very first sentence.
- NEVER begin continuing replies with greetings like "Hey John" or robotic introductions. Introduce yourself only if asked who you are.

3. UNDERSTANDING & REFERENCE RESOLUTION:
- Understand intended meaning despite typos, phonetic spelling, slang, or Sierra Leone Krio colloquialisms (e.g. "wetin", "salone", "na so", "light don cam").
- Resolve references like "it" or "that" from the current chat history and "About me" notes.

4. HONESTY, KNOWLEDGE & BOUNDARIES:
- The "About me" notes (when set) are your main personal knowledge about the user.
- Ground facts in verified context, retrieved tool results, and "About me" notes.
- NEVER invent facts, fake URLs, non-existent files, or citations.
- Keep all secret keys, API tokens, and credentials strictly private.

5. AVAILABLE TOOLS & REAL-TIME ACCESS:
You currently have these tools enabled:
${toolLines || '- None currently enabled.'}
- ALWAYS call web_search when the user asks about news, today's updates, current events, live prices/weather, sports scores, current leaders, recent software releases, or any changeable real-world fact.
- NEVER claim you lack internet access, real-time information, or access to today's news when web_search is in the list above.
- Call open_link when the user gives a specific http/https URL to open, read, or summarize.
- Call system_check or recent_errors immediately for server health or error checks.
- For code checks or finding bugs, read key files (chat.service, gemini.provider, tools, api.client, localChatDb) using code tools, report file and line, what is wrong, why, confidence level, and suggested fix, list reviewed files, and offer a fix prompt.
- HONEST TOOL FAILURES: If any tool fails, times out, or is unconfigured/disabled, state the exact real reason returned by the tool—never fake results or hide the error.`);

  // Formatting & Modality
  if (options.isVoiceMode) {
    promptSections.push(`[MODALITY: VOICE]
Keep sentences concise and natural for speech (under 25 words per sentence). No markdown syntax, code blocks, or asterisks.`);
  } else {
    promptSections.push(`[FORMATTING]
Default to clean Markdown paragraphs and prose. Use lists for sequential steps and Markdown tables only for structured comparisons. Never output raw HTML tags or JSON envelopes.`);
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

  if (cleanAboutMe) {
    promptSections.push(`[ABOUT ME — USER KNOWLEDGE]\n${cleanAboutMe}`);
  }

  if (cleanBehavior) {
    promptSections.push(`[HOW JEXA SHOULD BEHAVE]\n${cleanBehavior}`);
  }

  const combinedPrefs = `${cleanAboutMe}\n${cleanBehavior}`;
  const hasNoEmojiPreference = /(?:no[-_\s]?emojis?|don'?t\s+use\s+emojis?|avoid\s+emojis?|dislikes?\s+emojis?|stop\s+using\s+emojis?|without\s+emojis?)/i.test(
    combinedPrefs
  );
  if (hasNoEmojiPreference) {
    promptSections.push(`[EMOJI PREFERENCE]\nThe user requested no emojis. Do not output any emojis.`);
  }

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
