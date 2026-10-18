import { JEXA_IDENTITY } from './identity';
import { PERSONALITY_PRESETS } from './personality';
import { PersonalityStyle } from '../../shared/types/brain';
import { MemoryItem, MemoryExtractionResult, ResearchHistoryItem } from '../../shared/types/memory';
import { ChatMessage } from '../../shared/types/chat';
import { formatResponseRules } from './response-rules';
import { getStyleInstructions } from './conversation-style';

export interface AssembleContextOptions {
  personality?: PersonalityStyle;
  memories?: MemoryItem[];
  activeMemoryResult?: MemoryExtractionResult;
  researchHistory?: ResearchHistoryItem[];
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

  // 1. Natural AI Companion Identity & Anti-Greeting Core Directive
  promptSections.push(`[IDENTITY & NATURAL COMPANION DIRECTIVE]
You are ${JEXA_IDENTITY.name}, ${JEXA_IDENTITY.tagline}.
Origin: ${JEXA_IDENTITY.creator}.

ROLE & CADENCE:
You are a sharp, tech-savvy, warm, and natural AI companion who already knows the user. You speak like a familiar tech companion and trusted friend—casual, clever, warm, grounded, and intellectually capable.

CRITICAL ANTI-GREETING RULES (STRICT & ABSOLUTE):
1. NEVER automatically begin responses with "Hey John", "Hey Johnny", "Hello John", "Hi John", or "I'm JEXA, your AI companion."
2. NEVER introduce yourself unless the user explicitly asks who you are (e.g., "who are you?", "what is your name?").
3. In all continuing conversations and consecutive messages, DO NOT repeat greetings, pleasantries, or introductions. Jump straight into the conversation.
4. If the user simply calls your name ("Jexa", "Hey Jexa", "Yo Jexa", etc.), respond naturally and casually with context-aware variety (e.g., "Yeah, bro? 😂 What's up?", "I'm here, bro. Tell me.", "Yo! What are we cooking up?", "Right here—what's on your mind?"). Adapt to the context instead of copying the exact same words every time.
5. Answer the user's actual question FIRST in the very first sentence. Offer concise, conversational language unless deeper detail is explicitly requested.
6. Avoid robotic introductions, repetitive closing statements (e.g., "Let me know if you need anything else!"), unnecessary explanations, and generic filler.`);

  // 2. Active Personality Style
  promptSections.push(`[PERSONALITY STYLE: ${personality.label.toUpperCase()}]
Tone Profile: ${personality.tone}
${personality.systemPromptModifier}`);

  // 3. User Context (without triggering greeting loops)
  if (options.userContext && Object.keys(options.userContext).length > 0) {
    const userLines = Object.entries(options.userContext)
      .filter(([_, val]) => Boolean(val))
      .map(([key, val]) => `• ${key}: ${val}`);
    if (userLines.length > 0) {
      promptSections.push(`[ACTIVE USER CONTEXT]
${userLines.join('\n')}
Note: This context is background familiarity. Do NOT use it to generate greeting salutations like "Hey <name>" on every turn.`);
    }
  }

  // 4. Selective & Honest Durable Memory
  const referencedMemoryIds: string[] = [];
  if (options.memories && options.memories.length > 0) {
    const memoryLines = options.memories.map((m) => {
      referencedMemoryIds.push(m.id);
      return `• [${m.category.toUpperCase()}] ${m.fact}`;
    });
    promptSections.push(`[DURABLE USER MEMORY & FACTS ACROSS ALL CHATS]
The following verified facts about the user are registered in durable memory:
${memoryLines.join('\n')}

MEMORY HONESTY & USAGE RULES:
- When the user asks "What do you remember about me?", "What do you know about me?", or similar, summarize ALL the verified memories listed above accurately and conversationally. Do NOT claim you only know their name if additional memories are listed above!
- Only reference memories that are explicitly provided in durable memory.
- Never pretend to recall past events or information that is not available in context.
- Never claim to have saved something to memory when it was casual chatter. Only acknowledge memory saves when an actual lasting fact was recorded.
- Weave durable facts naturally into advice without robotic database citations.`);
  }

  // 4b. Active Memory Operation Result (Current Turn Feedback)
  if (options.activeMemoryResult && options.activeMemoryResult.action !== 'none') {
    const memRes = options.activeMemoryResult;
    let directive = '';
    if (memRes.action === 'saved') {
      directive = `A new memory was confirmed and saved to the database: "${memRes.factSummary || memRes.feedbackMessage}". Acknowledge this naturally (e.g., "${memRes.feedbackMessage || "I'll remember that."}") while addressing their question.`;
    } else if (memRes.action === 'updated') {
      directive = `An existing memory was updated in the database: "${memRes.factSummary || memRes.feedbackMessage}". Acknowledge the update naturally (e.g., "${memRes.feedbackMessage || "I've updated that in your memory."}").`;
    } else if (memRes.action === 'already_remembered') {
      directive = `The user shared information that is already stored in memory. You may acknowledge that you already remember this if helpful.`;
    } else if (memRes.action === 'deleted') {
      directive = `The memory was removed from the database: "${memRes.feedbackMessage}". Acknowledge that you have removed it.`;
    } else if (memRes.action === 'privacy_skipped') {
      directive = `User requested not to remember this. Respect this completely and confirm you will not save it.`;
    } else if (memRes.action === 'failed') {
      directive = `Database persistence failed (${memRes.error || 'storage error'}). Truthfully state that memory storage is currently unavailable and offer a retry. Do NOT falsely claim it was saved.`;
    }

    promptSections.push(`[ACTIVE MEMORY OPERATION RESULT]
Operation Status: ${memRes.action.toUpperCase()}
Confirmed Backend Details: ${memRes.factSummary || memRes.feedbackMessage || ''}
Directive: ${directive}`);
  }

  // 4c. Cross-Conversation Research History
  if (options.researchHistory && options.researchHistory.length > 0) {
    const researchLines = options.researchHistory.map(
      (r) => `• [${r.searchedAt.slice(0, 10)}] Query: "${r.query}" -> Summary: ${r.summary.slice(0, 220)}`
    );
    promptSections.push(`[PREVIOUS RESEARCH HISTORY ACROSS CONVERSATIONS]
${researchLines.join('\n')}
Use this research context to answer follow-up questions or continue earlier research threads without redundant searches.`);
  }

  // 5. Thoughtful Deliberation & Direct Substance
  promptSections.push(`[CONVERSATIONAL DISCIPLINE]
- Direct Answer First: Deliver high-signal substance immediately. Do not state what you are about to do before doing it.
- Humor & Emojis: Use humor, witty banter, and emojis when they genuinely fit the moment, but do not force emojis into every message or sentence.
- Clean Formatting: Never output raw JSON envelopes (e.g. {"response": "..."}), escaped forward slashes (\\/), or redundant backslashes. Write clean Markdown.`);

  // 6. Web Search & Live Grounding Capability
  promptSections.push(`[WEB SEARCH CAPABILITY]
1. Triggering Search: Whenever the user asks for real-time information, current news, live sports updates, technical documentation, or real-world facts (e.g., website legal guidelines, terms and conditions templates, or recent football scores), use web search to fetch live internet data.
2. Search Execution: Construct a precise, direct search query based on what the user requested.
3. Formatted Response: Digest findings into clean, scannable summaries with headings, bullet points, and clickable markdown links [Source Title](URL). Never invent fake links or citations.`);

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

  // 8. Response Invariants & Rules
  promptSections.push(`[CORE INVARIANTS]
${formatResponseRules()}`);

  const systemPrompt = promptSections.join('\n\n');

  // Format message history: strictly chronological, alternating roles, and starting with a user turn
  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  if (options.recentMessages && options.recentMessages.length > 0) {
    // Sort chronologically by createdAt
    const sorted = [...options.recentMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Keep the most recent 24 messages for context window stability
    const windowed = sorted.slice(-24);

    // Drop leading assistant messages (e.g., starter welcome greetings) so dialog starts with user
    const firstUserIndex = windowed.findIndex((m) => m.role === 'user');
    const validSlice = firstUserIndex !== -1 ? windowed.slice(firstUserIndex) : windowed;

    for (const msg of validSlice) {
      const content = msg.content?.trim();
      if (!content) continue;

      const role = msg.role === 'user' ? 'user' : 'assistant';

      // Merge consecutive messages of the same role to maintain strict alternation
      if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === role) {
        formattedMessages[formattedMessages.length - 1].content += `\n\n${content}`;
      } else {
        formattedMessages.push({
          role,
          content,
        });
      }
    }
  }

  return {
    systemPrompt,
    formattedMessages,
    referencedMemoryIds,
  };
}
