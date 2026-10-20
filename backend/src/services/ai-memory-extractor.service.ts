import { MemoryItem, MemoryCategory, MemoryType, normalizeCategory } from '../../../shared/types/memory';
import { ITextAIProvider } from '../../../ai/providers/text-provider.interface';

export interface ExtractedMemoryCandidate {
  category: MemoryCategory;
  fact: string;
  memoryType?: MemoryType;
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
  /(?:password\s*(?:is|:)|api[_\s]?key\s*(?:is|:)|secret\s*(?:is|:)|bearer\s+[a-z0-9_\-\.]+|sk[-_][a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|BEGIN\s+PRIVATE\s+KEY|auth(?:entication)?\s+code\s*(?:is|:)|2fa\s*(?:is|:)|otp\s*(?:is|:))/i;

// Regex to detect sensitive financial or private medical data that should never be stored automatically
const SENSITIVE_PRIVATE_DATA_PATTERN =
  /(?:credit\s*card\s*(?:is|number|#)?\s*(?:is|:)?\s*\d{4}|\b(?:\d{4}[-\s]?){3}\d{4}\b|cvv\s*(?:is|:)?\s*\d{3,4}|bank\s*account\s*(?:#|number)?\s*(?:is|:)|routing\s*number\s*(?:is|:)|ssn\s*(?:is|:)|social\s*security\s*number|medical\s+record|prescription\s+dosage|diagnosed\s+with\s+(?:hiv|cancer|schizophrenia|bipolar)|psychotherapy\s+session|clinical\s+diagnosis)/i;

const PRIVACY_PATTERN =
  /(?:don'?t|do\s+not|never)\s+(?:remember|save|store)\s+(?:this|that|my)?|(?:off\s+the\s+record|keep\s+this\s+private|do\s+not\s+save\s+to\s+memory|don'?t\s+save\s+to\s+memory)/i;

const FORGET_PATTERN =
  /(?:please\s+)?(?:forget|delete|remove|clear)\s+(?:my|the\s+memory\s+of|the\s+fact\s+that|that|about)?\s*(.+)/i;

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

    // 2. PRIVACY & SENSITIVE DATA PROTECTION: Never automatically store sensitive financial or private medical data
    if (SENSITIVE_PRIVATE_DATA_PATTERN.test(trimmed)) {
      return {
        action: 'privacy_skipped',
        candidates: [],
        feedbackMessage: 'For your privacy and security, financial details and private medical records are not stored in memory.',
      };
    }

    // 3. PRIVACY DIRECTIVE: User asked not to remember
    if (PRIVACY_PATTERN.test(trimmed)) {
      return {
        action: 'privacy_skipped',
        candidates: [],
        feedbackMessage: 'Understood. I will not save this to memory.',
      };
    }

    // 4. FORGET DIRECTIVE: User asked to remove a memory
    const forgetMatch = trimmed.match(FORGET_PATTERN);
    if (forgetMatch && forgetMatch[1]) {
      const subject = forgetMatch[1].trim().toLowerCase().replace(/[.?!]+$/, '').replace(/^(?:my|the|about)\s+/i, '');
      const subjectWords = subject.split(/\s+/).filter((w) => w.length > 2 && !['project', 'memory', 'detail', 'fact', 'that'].includes(w));
      const match = existingMemories.find(
        (m) => {
          const factLower = m.fact.toLowerCase();
          if (factLower.includes(subject)) return true;
          if (subjectWords.length > 0 && subjectWords.filter((w) => factLower.includes(w)).length >= Math.min(2, subjectWords.length)) {
            return true;
          }
          return false;
        }
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

    // 5. Filter out pure casual pleasantries without substantive content
    if (CASUAL_TRIVIAL_PATTERN.test(trimmed) && trimmed.length < 35 && !/remember|name|live|work|prefer|goal/i.test(trimmed)) {
      return { action: 'none', candidates: [] };
    }

    // 5b. Fast deduplication check: If user repeats information already recorded without changes
    const nameMatch = trimmed.match(/(?:my\s+(?:preferred\s+)?name\s+is|call\s+me)\s+([A-Za-z]+)/i);
    if (nameMatch && nameMatch[1] && !/update|change|different|not\s+|instead/i.test(trimmed)) {
      const name = nameMatch[1].toLowerCase();
      const existingNameMem = existingMemories.find(
        (m) => m.category === 'user_profile' && m.fact.toLowerCase().includes(name)
      );
      if (existingNameMem) {
        return {
          action: 'already_remembered',
          candidates: [],
          feedbackMessage: `I already have noted that your name is ${nameMatch[1]}.`,
        };
      }
    }

    // 6. Try AI-Powered Extraction if provider is available
    if (provider && typeof provider.generateResponse === 'function') {
      try {
        const memorySummaryList = existingMemories
          .slice(0, 20)
          .map((m) => `[ID: ${m.id}] [Category: ${m.category}] [Type: ${m.memoryType || 'confirmed_fact'}] ${m.fact}`)
          .join('\n');

        const extractionSystemPrompt = `You are the memory analysis engine for JEXA AI.
Your task is to analyze whether the user's latest statement contains meaningful, durable information that should be remembered, updated, or removed in their long-term personal memory across all future conversations.

EXISTING USER MEMORIES:
${memorySummaryList || '(No memories recorded yet)'}

FIVE CONNECTED MEMORY CATEGORIES:
1. "user_profile": Identity, background, preferred name, residence/location, profession, company, career role, spoken languages.
2. "preferences_settings": Lasting preferences, working style, favorite tools, coding stack, communication tone, interface settings.
3. "relationships_dates": Family, friends, colleagues, pets, birthdays, anniversaries, important recurring dates.
4. "projects_goals": Active projects, products being built, milestones, ambitions, targets, ongoing project progress.
5. "conversation_insights": High-level recurring habits, observed patterns, thinking tendencies, derived observations (mark as memoryType: "insight").

RULES:
1. AUTOMATIC EXTRACTION:
   - Identify useful, meaningful, long-term information automatically without requiring the user to say "remember this".
   - Understand the meaning and context of the entire message rather than relying only on keywords.
   - Do NOT store transient small talk, momentary requests ("what is the weather today"), or speculative guesses.
2. DEDUPLICATION & UPDATES:
   - If the fact or core information is ALREADY covered in existing memories (even if phrased slightly differently, e.g. "My preferred name is Alex" when an existing memory already mentions their name is Alex), return action: "already_remembered". Do NOT mark as "updated" or "saved" unless the information has actually changed or contains new facts.
   - If the new statement UPDATES, CHANGES, or SUPERSEDES an existing memory with new/different values (e.g. user changed their name, moved to a different city, or switched jobs), return action: "updated" and set updatesMemoryId to that memory's ID.
   - If it is genuinely new information, return action: "saved".
3. FACT VS INSIGHT:
   - "confirmed_fact": Direct user statements, confirmed personal details, explicit instructions.
   - "insight": AI-derived behavioral tendencies or higher-level patterns.
4. IMPERFECT ENGLISH, SLANG & CONTEXTUAL REASONING:
   - Accurately interpret imperfect English, typos (e.g. 'sistr', 'projek', 'bday', 'nam'), phonetic spellings, contractions ('wanna', 'gonna'), and colloquial slang (e.g. 'bro', Krio 'me sista', 'na', 'wok', 'salone').
   - Focus on intended meaning and factual substance. Resolve pronouns or references using recent dialogue context if provided.

OUTPUT FORMAT: Return STRICT JSON only (no markdown, no backticks, no extra prose):
{
  "action": "saved" | "updated" | "already_remembered" | "none",
  "category": "user_profile" | "preferences_settings" | "relationships_dates" | "projects_goals" | "conversation_insights",
  "memoryType": "confirmed_fact" | "insight",
  "fact": "concise factual declarative statement in 3rd person (e.g. User lives in Freetown, Sierra Leone)",
  "confidence": 0.95,
  "updatesMemoryId": "string-uuid-or-null",
  "feedbackMessage": "Natural concise confirmation phrase (e.g. I'll remember that you live in Freetown.)"
}`;

        const promptContent = `User Message: "${trimmed}"${recentDialogue ? `\nRecent Context: "${recentDialogue}"` : ''}`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI extraction timeout')), 5000)
        );

        const aiResponse = await Promise.race([
          provider.generateResponse({
            systemPrompt: extractionSystemPrompt,
            messages: [{ role: 'user', content: promptContent }],
            temperature: 0.1,
            maxTokens: 300,
          }),
          timeoutPromise,
        ]);

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
              const validCat = normalizeCategory(parsed.category || 'user_profile');
              const validMemType: MemoryType = parsed.memoryType === 'insight' ? 'insight' : 'confirmed_fact';

              return {
                action: parsed.action === 'updated' ? 'updated' : 'saved',
                candidates: [
                  {
                    category: validCat,
                    fact: cleanFact,
                    memoryType: validMemType,
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
              category: normalizeCategory(matchedMemory.category),
              fact: updatedFact,
              memoryType: 'confirmed_fact',
              confidence: 0.96,
              updatesMemoryId: matchedMemory.id,
            },
          ],
          feedbackMessage: `I've updated that in your memory.`,
        };
      }

      return {
        action: 'saved',
        candidates: [{ category: 'user_profile', fact: updatedFact, memoryType: 'confirmed_fact', confidence: 0.95 }],
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
                category: normalizeCategory(existing.category || 'user_profile'),
                fact: cleanFact,
                memoryType: 'confirmed_fact',
                confidence: 0.96,
                updatesMemoryId: existing.id,
              },
            ],
            feedbackMessage: `I've updated that note in your memory.`,
          };
        }
        return {
          action: 'saved',
          candidates: [{ category: 'user_profile', fact: cleanFact, memoryType: 'confirmed_fact', confidence: 0.96 }],
          feedbackMessage: `I'll remember that.`,
        };
      }
    }

    // 3. Category: User Profile (Name / Identity / Location / Career) - with slang & typo tolerance
    const nameMatch = trimmed.match(
      /(?:(?:my|me|mi)\s+(?:name|nam|preffered\s+name|preferred\s+name)\s+(?:is|na|b|called)?|i'm\s+called|call\s+me|am\s+called)\s+([a-zA-Z0-9_\- ]+?)(?:\.|$|,|!|\s+and)/i
    );
    if (nameMatch && nameMatch[1]?.trim()) {
      const name = nameMatch[1].trim().replace(/[.?!]+$/, '');
      const fact = `User's preferred name is ${name}.`;
      const existing = existingMemories.find((m) => m.fact.includes("preferred name is"));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'user_profile', fact, memoryType: 'confirmed_fact', confidence: 0.98, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your name in memory to ${name}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'user_profile', fact, memoryType: 'confirmed_fact', confidence: 0.98 }],
        feedbackMessage: `I'll remember that your preferred name is ${name}.`,
      };
    }

    const locMatch = trimmed.match(
      /(?:(?:i|a|me)\s+(?:live|liv|living|based|base|moved|de)\s+(?:in|at|na)|reside\s+in)\s+([a-zA-Z0-9_\- ,]+?)(?:\.|$|!|\s+and)/i
    );
    if (locMatch && locMatch[1]?.trim()) {
      const loc = locMatch[1].trim().replace(/[.?!]+$/, '');
      const fact = `User lives in ${loc}.`;
      const existing = existingMemories.find((m) => m.fact.includes('User lives in'));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'user_profile', fact, memoryType: 'confirmed_fact', confidence: 0.95, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your location in memory to ${loc}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'user_profile', fact, memoryType: 'confirmed_fact', confidence: 0.95 }],
        feedbackMessage: `I'll remember that you live in ${loc}.`,
      };
    }

    const careerMatch = trimmed.match(
      /(?:(?:i|a|me)\s+(?:work|wok|am|a|m)\s+(?:as|like)?|my\s+job\s+is)\s+([a-zA-Z0-9_\- ]+?)\s+(?:at|for|na|wit)\s+([a-zA-Z0-9_\- ]+)/i
    );
    if (careerMatch && careerMatch[1]?.trim() && careerMatch[2]?.trim()) {
      const role = careerMatch[1].trim();
      const company = careerMatch[2].trim().replace(/[.?!]+$/, '');
      const fact = `User works as ${role} at ${company}.`;
      return {
        action: 'saved',
        candidates: [{ category: 'user_profile', fact, memoryType: 'confirmed_fact', confidence: 0.95 }],
        feedbackMessage: `I'll remember that you work as ${role} at ${company}.`,
      };
    }

    // 4. Category: Relationships & Important Dates - with slang & typo tolerance
    const relMatch = trimmed.match(
      /(?:(?:my|me|mi)\s+(wife|husband|partner|son|daughter|kid|child|brother|broda|sister|sista|sistr|mother|father|mom|dad|friend|dog|cat|pet))\s+(?:is|is\s+named|called|na)\s+([a-zA-Z0-9_\- ]+)/i
    );
    if (relMatch && relMatch[1] && relMatch[2]?.trim()) {
      let rel = relMatch[1].toLowerCase();
      if (rel === 'sistr' || rel === 'sista') rel = 'sister';
      if (rel === 'broda') rel = 'brother';
      const person = relMatch[2].trim().replace(/[.?!]+$/, '');
      const fact = `User's ${rel} is ${person}.`;
      const existing = existingMemories.find((m) => m.fact.includes(`User's ${rel} is`));
      if (existing) {
        if (existing.fact === fact) return { action: 'already_remembered', candidates: [] };
        return {
          action: 'updated',
          candidates: [{ category: 'relationships_dates', fact, memoryType: 'confirmed_fact', confidence: 0.95, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your ${rel}'s name in memory to ${person}.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'relationships_dates', fact, memoryType: 'confirmed_fact', confidence: 0.95 }],
        feedbackMessage: `I'll remember that your ${rel} is ${person}.`,
      };
    }

    const dateMatch = trimmed.match(
      /(?:(?:my|her|his|our)\s+(?:birthday|bday|anniversary)\s+is|born\s+on)\s+([a-zA-Z0-9_\- ,]+?)(?:\.|$|!)/i
    );
    if (dateMatch && dateMatch[1]?.trim()) {
      const dateStr = dateMatch[1].trim().replace(/[.?!]+$/, '');
      const fact = `Important date: "${trimmed.slice(0, 140)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'relationships_dates', fact, memoryType: 'confirmed_fact', confidence: 0.95 }],
        feedbackMessage: `I've saved that date to your memory.`,
      };
    }

    // 5. Category: Preferences & Settings
    if (/(?:my stack is|our stack is|we build with|i build with|i code in|my primary stack is)/i.test(lower) && trimmed.length >= 12) {
      const fact = `Technical stack & tooling: "${trimmed.slice(0, 160)}".`;
      const existing = existingMemories.find((m) => m.fact.includes('Technical stack'));
      if (existing) {
        return {
          action: 'updated',
          candidates: [{ category: 'preferences_settings', fact, memoryType: 'confirmed_fact', confidence: 0.93, updatesMemoryId: existing.id }],
          feedbackMessage: `I've updated your technical stack in memory.`,
        };
      }
      return {
        action: 'saved',
        candidates: [{ category: 'preferences_settings', fact, memoryType: 'confirmed_fact', confidence: 0.93 }],
        feedbackMessage: `I've saved your technical stack to memory.`,
      };
    }

    if (/(?:i prefer|my preference is|my favorite|my favourite)/i.test(lower) && !/(?:eating|today|right now)/i.test(lower)) {
      const fact = `User preference: "${trimmed.slice(0, 140)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'preferences_settings', fact, memoryType: 'confirmed_fact', confidence: 0.90 }],
        feedbackMessage: `I've noted your preference.`,
      };
    }

    // 6. Category: Projects & Goals
    if (/(?:my goal is|our goal is|i am working on|i'm working on|we plan to launch|we launched|project progress|deadline is)/i.test(lower) && trimmed.length >= 14) {
      const fact = `User goal / project progress: "${trimmed.slice(0, 160)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'projects_goals', fact, memoryType: 'confirmed_fact', confidence: 0.92 }],
        feedbackMessage: `I've saved your project goal & progress to memory.`,
      };
    }

    // 7. Category: Conversation Insights (Recurring patterns, self-described tendencies)
    if (/(?:i tend to|my habit is|i usually struggle with|my workflow usually)/i.test(lower) && trimmed.length >= 20) {
      const fact = `Observed insight: User noted that "${trimmed.slice(0, 150)}".`;
      return {
        action: 'saved',
        candidates: [{ category: 'conversation_insights', fact, memoryType: 'insight', confidence: 0.88 }],
        feedbackMessage: `I've noted that pattern in your workflow.`,
      };
    }

    return { action: 'none', candidates: [] };
  }
}
