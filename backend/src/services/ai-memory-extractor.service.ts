import { MemoryItem, MemoryCategory } from '../../../shared/types/memory';
import { ITextAIProvider } from '../../../ai/providers/text-provider.interface';

export interface ExtractedMemoryCandidate {
  category: MemoryCategory;
  fact: string;
  confidence: number;
  updatesMemoryId?: string;
}

export interface AIMemoryExtractionDecision {
  action: 'saved' | 'updated' | 'deleted' | 'already_remembered' | 'privacy_skipped' | 'none';
  candidates: ExtractedMemoryCandidate[];
  deleteMemoryId?: string;
  feedbackMessage?: string;
  reason?: string;
}

// Regex to detect sensitive credentials that should NEVER be stored as memory
const SENSITIVE_SECRETS_PATTERN =
  /(?:password\s*(?:is|:)|api[_\s]?key\s*(?:is|:)|secret\s*(?:is|:)|bearer\s+[a-z0-9_\-\.]+|sk[-_][a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,})/i;

const PRIVACY_PATTERN =
  /(?:don'?t|do\s+not|never)\s+(?:remember|save|store)\s+(?:this|that|my)?|(?:off\s+the\s+record|keep\s+this\s+private|do\s+not\s+save\s+to\s+memory|don'?t\s+save\s+to\s+memory)/i;

const FORGET_PATTERN =
  /(?:forget|delete|remove|clear)\s+(?:my|the\s+memory\s+of|the\s+fact\s+that|that|about)\s+(.+)/i;

const CASUAL_TRIVIAL_PATTERN =
  /^(?:hi|hello|hey|yo|howdy|good\s+(?:morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|ok|okay|cool|nice|thanks|thank\s+you|bye|see\s+ya|haha|lol|tell\s+me\s+a\s+joke|what\s+time\s+is\s+it)\b/i;

export class AIMemoryExtractor {
  /**
   * Evaluates a user message against existing memories using the active AI Provider
   * with robust heuristic fallback.
   */
  public static async analyze(
    userMessage: string,
    existingMemories: MemoryItem[],
    provider?: ITextAIProvider,
    recentDialogue?: string
  ): Promise<AIMemoryExtractionDecision> {
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed.length < 3) {
      return { action: 'none', candidates: [] };
    }

    // 1. SAFETY: Never store sensitive secrets or credentials in memory
    if (SENSITIVE_SECRETS_PATTERN.test(trimmed)) {
      return {
        action: 'privacy_skipped',
        candidates: [],
        feedbackMessage: 'For your security, passwords, API keys, and sensitive credentials are never stored in memory.',
      };
    }

    // 2. PRIVACY DIRECTIVE: User asked not to remember
    if (PRIVACY_PATTERN.test(trimmed)) {
      return {
        action: 'privacy_skipped',
        candidates: [],
        feedbackMessage: 'Understood. I will not save this to memory.',
      };
    }

    // 3. FORGET DIRECTIVE: User asked to remove a memory
    const forgetMatch = trimmed.match(FORGET_PATTERN);
    if (forgetMatch && forgetMatch[1]) {
      const subject = forgetMatch[1].trim().toLowerCase().replace(/[.?!]+$/, '');
      const match = existingMemories.find(
        (m) =>
          m.fact.toLowerCase().includes(subject) ||
          subject.split(' ').every((w) => m.fact.toLowerCase().includes(w))
      );
      if (match) {
        return {
          action: 'deleted',
          candidates: [],
          deleteMemoryId: match.id,
          feedbackMessage: `I have removed "${match.fact}" from your memory.`,
        };
      }
    }

    // 4. Filter out pure casual pleasantries without substantive content
    if (CASUAL_TRIVIAL_PATTERN.test(trimmed) && trimmed.length < 35 && !/remember|name|live|work|prefer|goal/i.test(trimmed)) {
      return { action: 'none', candidates: [] };
    }

    // 5. Try AI-Powered Extraction if provider is available
    if (provider && typeof provider.generateResponse === 'function') {
      try {
        const memorySummaryList = existingMemories
          .slice(0, 20)
          .map((m) => `[ID: ${m.id}] [Category: ${m.category}] ${m.fact}`)
          .join('\n');

        const extractionSystemPrompt = `You are the memory analysis engine for JEXA AI.
Your task is to analyze whether the user's latest statement contains meaningful, durable information that should be remembered, updated, or removed in their long-term memory across all future conversations.

EXISTING USER MEMORIES:
${memorySummaryList || '(No memories recorded yet)'}

RULES:
1. WHAT TO EXTRACT:
   - Meaningful personal background (identity, preferred name, family/relationships, pets, location, career, job, company).
   - Enduring preferences (favorite tools, communication style, tech stacks, workflow habits).
   - Goals & Projects (what the user is building, launching, studying, or aiming to achieve).
   - Life events, milestones, health/allergies, concerns, and important personal decisions.
   - Explicit instructions like "remember this", "save this", "update my...", "this is important".
2. WHAT NOT TO EXTRACT:
   - Transient small talk, greetings, momentary requests (e.g. "what is the weather today", "search for EDSA").
   - Speculative guesses or trivial banter.
3. DEDUPLICATION & UPDATES:
   - If the fact is ALREADY stored in identical or equivalent form in existing memories, return action: "already_remembered".
   - If the new statement UPDATES or SUPERSEDES an existing memory (e.g. user moved to a new city, changed job, or changed tech stack), return action: "updated" and set updatesMemoryId to that memory's ID.
   - If it is genuinely new, return action: "saved".
4. CATEGORIES:
   - "user_fact" | "preference" | "goal" | "relationship" | "milestone" | "interest"

OUTPUT FORMAT: Return STRICT JSON only (no markdown, no backticks, no extra prose):
{
  "action": "saved" | "updated" | "already_remembered" | "none",
  "category": "user_fact" | "preference" | "goal" | "relationship" | "milestone" | "interest",
  "fact": "concise factual declarative statement in 3rd person (e.g. User lives in Freetown, Sierra Leone)",
  "confidence": 0.95,
  "updatesMemoryId": "string-uuid-or-null",
  "feedbackMessage": "Natural concise confirmation phrase (e.g. I'll remember that you live in Freetown.)"
}`;

        const promptContent = `User Message: "${trimmed}"${recentDialogue ? `\nRecent Context: "${recentDialogue}"` : ''}`;

        const aiResponse = await provider.generateResponse({
          systemPrompt: extractionSystemPrompt,
          messages: [{ role: 'user', content: promptContent }],
          temperature: 0.1,
          maxTokens: 300,
        });

        const rawContent = (aiResponse.content || '').trim();
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && parsed.action && parsed.action !== 'none') {
            if (parsed.action === 'already_remembered') {
              return { action: 'already_remembered', candidates: [], feedbackMessage: parsed.feedbackMessage };
            }

            if (parsed.fact && typeof parsed.fact === 'string' && parsed.fact.trim().length > 3) {
              const cleanFact = parsed.fact.trim().slice(0, 240);
              const validCat: MemoryCategory = [
                'user_fact',
                'preference',
                'goal',
                'relationship',
                'milestone',
                'interest',
              ].includes(parsed.category)
                ? parsed.category
                : 'user_fact';

              return {
                action: parsed.action === 'updated' ? 'updated' : 'saved',
                candidates: [
                  {
                    category: validCat,
                    fact: cleanFact,
                    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.90,
                    updatesMemoryId: parsed.updatesMemoryId || undefined,
                  },
                ],
                feedbackMessage: parsed.feedbackMessage || `I'll remember that.`,
              };
            }
          }
        }
      } catch (err: any) {
        console.warn('[AIMemoryExtractor] AI extraction warning, falling back to heuristic engine:', err.message);
      }
    }

    // 6. Fast Heuristic Engine Fallback
    return this.fallbackHeuristicExtraction(trimmed, existingMemories);
  }

  private static fallbackHeuristicExtraction(
    trimmed: string,
    existingMemories: MemoryItem[]
  ): AIMemoryExtractionDecision {
    const lower = trimmed.toLowerCase();

    // 1. Explicit memory update instructions (Priority)
    const updateMatch = trimmed.match(
      /(?:update\s+what\s+you\s+remember(?:\s+about\s+me)?|update\s+(?:that|my|the)\s+memory|change\s+what\s+you\s+remember)[;:]?\s*(.+)/i
    );
    if (updateMatch && updateMatch[1]?.trim()) {
      const updateBody = updateMatch[1]
        .trim()
        .replace(/^[;:\-\s]+/, '')
        .replace(/^that\s+/i, '')
        .replace(/[.?!]+$/, '');

      // Determine subject keywords to locate the existing memory to supersede
      const updateKeywords = updateBody
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['have', 'with', 'from', 'this', 'that', 'about'].includes(w));

      const matchedMemory = existingMemories.find((m) => {
        const factLower = m.fact.toLowerCase();
        return updateKeywords.some((kw) => factLower.includes(kw));
      });

      const updatedFact = `User update: "${updateBody.slice(0, 200)}".`;
      if (matchedMemory) {
        return {
          action: 'updated',
          candidates: [
            {
              category: matchedMemory.category,
              fact: updatedFact,
              confidence: 0.96,
              updatesMemoryId: matchedMemory.id,
            },
          ],
          feedbackMessage: `I've updated that in your memory.`,
        };
      }

      return {
        action: 'saved',
        candidates: [{ category: 'user_fact', fact: updatedFact, confidence: 0.95 }],
        feedbackMessage: `I've saved your update to memory.`,
      };
    }

    // 2. Explicit remember & save instructions (Priority)
    const explicitMatch = trimmed.match(
      /(?:(?:please\s+)?(?:remember\s+(?:this|that|the\s+following)?|save\s+(?:this\s+information|this\s+info|this\s+detail|this\s+to\s+memory|this)?|this\s+is\s+important(?:[;:,]\s*remember(?:\s+that)?)?|i\s+want\s+you\s+to\s+remember(?:\s+that)?|don't\s+forget(?:\s+that)?|keep\s+in\s+mind(?:\s+that)?|note\s+(?:this|that)?))[;:]?\s*(.+)/i
    );
    if (explicitMatch && explicitMatch[1]?.trim()) {
      const factBody = explicitMatch[1]
        .trim()
        .replace(/^[;:\-\s]+/, '')
        .replace(/^(?:that|is\s+that)\s+/i, '')
        .replace(/[.?!]+$/, '');

      if (factBody.length >= 2) {
        const cleanFact = `User note: "${factBody.slice(0, 200)}".`;
        const existing = existingMemories.find((m) =>
          m.fact.toLowerCase().includes(factBody.toLowerCase().slice(0, 25))
        );
        if (existing) {
          return {
            action: 'updated',
            candidates: [
              {
                category: existing.category || 'user_fact',
                fact: cleanFact,
                confidence: 0.96,
                updatesMemoryId: existing.id,
              },
            ],
            feedbackMessage: `I've updated that note in your memory.`,
          };
        }
        return {
          action: 'saved',
          candidates: [{ category: 'user_fact', fact: cleanFact, confidence: 0.96 }],
          feedbackMessage: `I'll remember that.`,
        };
      }
    }

    // Name / Identity
    const nameMatch = trimmed.match(/(?:my name is|i'm called|call me|my preferred name is)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and)/i);
    if (nameMatch && nameMatch[1]?.trim()) {
      const name = nameMatch[1].trim().replace(/[.?!]+$/, '');
      const fact = `User's preferred name is ${name}.`;
      const existing = existingMemories.find((m) => m.category === 'user_fact' && m.fact.includes("preferred name is"));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'user_fact', fact, confidence: 0.98, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your name in memory to ${name}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'user_fact', fact, confidence: 0.98 }],
        feedbackMessage: `I'll remember that your preferred name is ${name}.`,
      };
    }

    // Location / Residence
    const locMatch = trimmed.match(/(?:i live in|i am based in|i'm based in|i moved to)\s+([a-zA-Z0-9_\- ,]+?)(?:\.|$|!|\s+and)/i);
    if (locMatch && locMatch[1]?.trim()) {
      const loc = locMatch[1].trim().replace(/[.?!]+$/, '');
      const fact = `User lives in ${loc}.`;
      const existing = existingMemories.find((m) => m.category === 'user_fact' && m.fact.includes('User lives in'));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'user_fact', fact, confidence: 0.95, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your location in memory to ${loc}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'user_fact', fact, confidence: 0.95 }],
        feedbackMessage: `I'll remember that you live in ${loc}.`,
      };
    }

    // Relationships & Family
    const relMatch = trimmed.match(/(?:my\s+(wife|husband|partner|son|daughter|kid|child|brother|sister|mother|father|mom|dad|friend|dog|cat|pet))\s+(?:is|is\s+named|called)\s+([a-zA-Z0-9_\- ]+)/i);
    if (relMatch && relMatch[1] && relMatch[2]?.trim()) {
      const rel = relMatch[1].toLowerCase();
      const person = relMatch[2].trim().replace(/[.?!]+$/, '');
      const fact = `User's ${rel} is ${person}.`;
      const existing = existingMemories.find((m) => m.category === 'relationship' && m.fact.includes(`User's ${rel} is`));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'relationship', fact, confidence: 0.95, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your ${rel}'s name in memory to ${person}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'relationship', fact, confidence: 0.95 }],
        feedbackMessage: `I'll remember that your ${rel} is ${person}.`,
      };
    }

    // Technical Stack
    if (/(?:my stack is|our stack is|we build with|i build with|i code in|my primary stack is)/i.test(lower) && trimmed.length >= 12) {
      const fact = `Technical stack & tooling: "${trimmed.slice(0, 160)}".`;
      const existing = existingMemories.find((m) => m.category === 'user_fact' && m.fact.includes('Technical stack'));
      if (existing) {
        return {
          action: 'updated',
          candidates: [{ category: 'user_fact', fact, confidence: 0.93, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your technical stack in memory.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'user_fact', fact, confidence: 0.93 }],
        feedbackMessage: `I've saved your technical stack to memory.`,
      };
    }

    // Goals & Projects
    if (/(?:my goal is|our goal is|i am working on|i'm working on|we plan to launch)/i.test(lower) && trimmed.length >= 14) {
      const fact = `User goal / project: "${trimmed.slice(0, 160)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'goal', fact, confidence: 0.92 }],
        feedbackMessage: `I've saved your project goal to memory.`,
      };
    }

    // Preferences
    if (/(?:i prefer|my preference is|my favorite|my favourite)/i.test(lower) && !/(?:eating|today|right now)/i.test(lower)) {
      const fact = `User preference: "${trimmed.slice(0, 140)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'preference', fact, confidence: 0.90 }],
        feedbackMessage: `I've noted your preference.`,
      };
    }

    return { action: 'none', candidates: [] };
  }
}
