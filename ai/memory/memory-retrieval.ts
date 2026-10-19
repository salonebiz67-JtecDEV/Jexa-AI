import { MemoryItem, MemorySearchResult } from '../../shared/types/memory';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'if', 'then',
  'else', 'when', 'up', 'down', 'in', 'out', 'to', 'for', 'of', 'with', 'about',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'their',
  'what', 'how', 'why', 'can', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'tell', 'know', 'anything', 'something', 'everything', 'please', 'me', 'us',
  'bro', 'yeah', 'yes', 'no', 'okay', 'ok', 'hey', 'hi', 'yo', 'sup'
]);

// Slang, phonetic abbreviations, and Krio/creole terms mapped to standard search tokens
const SLANG_AND_PHONETIC_MAP: Record<string, string> = {
  wat: 'what',
  wats: 'what',
  wanna: 'want',
  gonna: 'going',
  gotta: 'got',
  u: 'you',
  ur: 'your',
  r: 'are',
  knw: 'know',
  kno: 'know',
  rember: 'remember',
  rmbr: 'remember',
  fav: 'favorite',
  favrite: 'favorite',
  projek: 'project',
  proyect: 'project',
  progect: 'project',
  wrk: 'work',
  wok: 'work',
  liv: 'live',
  livin: 'live',
  sistr: 'sister',
  sista: 'sister',
  broda: 'brother',
  brthr: 'brother',
  nam: 'name',
  lanch: 'launch',
  bday: 'birthday',
  tech: 'technology',
  stak: 'stack',
  fretown: 'freetown',
  salone: 'sierra leone',
  wetin: 'what',
  wettin: 'what',
  na: 'is',
};

// Meta-memory inquiry patterns where the user asks what is remembered, including slang & typos
const META_MEMORY_PATTERNS = [
  /(?:what|wat|wats)\s+(?:do\s+you|do\s+u|did\s+you|did\s+u|u|you)\s+(?:remember|rember|rmbr|know|knw|kno)\s*(about\s+me|about\s+us|about\s+my)?/i,
  /(?:what|wat)\s+do\s+(?:you|u)\s+(?:know|knw|kno)\s+about\s+me/i,
  /tell\s+me\s+(?:what|wat)\s+(?:you|u)\s+(?:remember|rember|know|knw)/i,
  /do\s+(?:you|u)\s+(?:remember|rember)\s+(me|anything\s+about\s+me|who\s+i\s+am)/i,
  /list\s+(all\s+)?(my\s+)?memories/i,
  /(?:what|wat)\s+have\s+i\s+told\s+(?:you|u)/i,
  /(?:what|wat)\s+(information|facts|notes)\s+do\s+(?:you|u)\s+have\s+(on|about)\s+me/i,
  /(?:what|wat)\s+are\s+my\s+(preferences|goals|details|facts)/i,
  /(?:what|wat)\s+is\s+in\s+my\s+memory/i,
  /who\s+am\s+i\s+(to\s+(?:you|u))?/i,
  /check\s+(my\s+)?(saved\s+)?memories/i,
  /(?:wetin|wettin)\s+(?:you|u)\s+(?:know|kno|member|remember)/i,
];

// Semantic concept expansions mapped to the 5 connected memory categories
const CONCEPT_EXPANSIONS: Record<string, { terms: string[]; category?: string }> = {
  relationships: {
    terms: ['wife', 'husband', 'partner', 'spouse', 'son', 'daughter', 'kid', 'child', 'children', 'brother', 'sister', 'sista', 'broda', 'mother', 'father', 'mom', 'dad', 'friend', 'pet', 'dog', 'cat', 'family', 'birthday', 'anniversary'],
    category: 'relationships_dates',
  },
  location: {
    terms: ['live', 'living', 'lives', 'based', 'moved', 'home', 'city', 'country', 'state', 'town', 'location', 'freetown', 'bo city', 'makeni', 'london', 'york', 'residence'],
    category: 'user_profile',
  },
  identity: {
    terms: ['name', 'called', 'nickname', 'call', 'who', 'user', 'preferred name'],
    category: 'user_profile',
  },
  career: {
    terms: ['work', 'job', 'profession', 'career', 'company', 'startup', 'engineer', 'developer', 'founder', 'architect', 'ceo', 'role'],
    category: 'user_profile',
  },
  technical: {
    terms: ['stack', 'technology', 'tech', 'languages', 'code', 'coding', 'typescript', 'python', 'react', 'node', 'postgres', 'database', 'backend', 'frontend', 'tailwind'],
    category: 'preferences_settings',
  },
  goal: {
    terms: ['goal', 'goals', 'aim', 'plan', 'plans', 'working', 'building', 'launching', 'project', 'projects', 'target', 'objective', 'progress', 'milestone'],
    category: 'projects_goals',
  },
  preference: {
    terms: ['prefer', 'preference', 'preferences', 'favorite', 'favourite', 'like', 'likes', 'dislike', 'style', 'format', 'vibe', 'habit', 'workflow'],
    category: 'preferences_settings',
  },
  insights: {
    terms: ['habit', 'pattern', 'tend to', 'struggle', 'workflow', 'tendency', 'insight'],
    category: 'conversation_insights',
  },
};

/**
 * Fuzzy word matching allowing small edit distances (typos/slang) for words >= 4 characters
 */
function isTypoMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 2) return false;
  if (a.length <= 3 || b.length <= 3) return a === b;

  const maxDist = a.length > 5 ? 2 : 1;
  const n = a.length;
  const m = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) d[i] = [i];
  for (let j = 0; j <= m; j++) d[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m] <= maxDist;
}

function normalizeWord(word: string): string {
  const clean = word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(?:ing|tion|ed|es|s)$/, '');
  return SLANG_AND_PHONETIC_MAP[clean] || clean;
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const resolved: string[] = [];
  for (const token of tokens) {
    resolved.push(token);
    const mapped = SLANG_AND_PHONETIC_MAP[token];
    if (mapped && mapped !== token) {
      resolved.push(mapped);
    }
  }
  return Array.from(new Set(resolved));
}

export function isMetaMemoryQuery(query: string): boolean {
  const trimmed = query.trim();
  return META_MEMORY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export interface SearchContextOptions {
  recentDialogue?: string;
}

export function searchRelevantMemories(
  query: string,
  memories: MemoryItem[],
  maxResults: number = 8,
  minConfidence: number = 0.4,
  context?: SearchContextOptions
): MemorySearchResult[] {
  if (!memories || memories.length === 0) return [];

  // Filter valid memories
  const validMemories = memories.filter((m) => m && m.fact && m.confidence >= minConfidence);
  if (validMemories.length === 0) return [];

  // 1. META-MEMORY QUERY: When user asks "What do you remember about me?" or equivalent
  if (isMetaMemoryQuery(query)) {
    return validMemories
      .sort((a, b) => {
        const timeDiff = new Date(b.lastReinforcedAt || b.createdAt).getTime() - new Date(a.lastReinforcedAt || a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.confidence || 0.8) - (a.confidence || 0.8);
      })
      .slice(0, Math.max(maxResults, 12))
      .map((item) => ({ item, relevanceScore: 1.0 }));
  }

  // 2. CONTEXTUAL QUERY ENRICHMENT:
  // If the query contains pronouns (it, that, this, her, him, the project) or is very brief,
  // incorporate keywords from recent dialogue to maintain contextual continuity
  const queryKeywords = extractKeywords(query);
  const normalizedQueryWords = queryKeywords.map(normalizeWord).filter(Boolean);

  let contextualKeywords: string[] = [];
  const hasPronounOrFollowUp =
    /\b(it|that|this|she|he|her|him|they|them|the project|that project|the app|the goal|earlier|discussed)\b/i.test(query);

  if ((hasPronounOrFollowUp || queryKeywords.length <= 2) && context?.recentDialogue) {
    contextualKeywords = extractKeywords(context.recentDialogue).slice(0, 6);
  }

  const queryLower = query.toLowerCase();
  const activeConcepts = Object.entries(CONCEPT_EXPANSIONS).filter(([_, config]) => {
    return config.terms.some((term) => queryLower.includes(term) || queryKeywords.some((qk) => isTypoMatch(qk, term)));
  });

  const scored: MemorySearchResult[] = [];

  for (const item of validMemories) {
    const factLower = item.fact.toLowerCase();
    const factKeywords = extractKeywords(item.fact);
    const normalizedFactWords = factKeywords.map(normalizeWord).filter(Boolean);

    let overlapCount = 0;

    // Exact and typo matches with query keywords
    for (const qWord of queryKeywords) {
      if (factLower.includes(qWord)) {
        overlapCount += 1.5;
      } else if (factKeywords.some((fWord) => fWord === qWord || isTypoMatch(qWord, fWord))) {
        overlapCount += 1.2;
      }
    }

    // Stemmed word matches
    for (const nqWord of normalizedQueryWords) {
      if (normalizedFactWords.some((nfWord) => nfWord === nqWord || nfWord.startsWith(nqWord) || nqWord.startsWith(nfWord) || isTypoMatch(nqWord, nfWord))) {
        overlapCount += 0.8;
      }
    }

    // Contextual dialogue keywords boost for follow-ups
    for (const cWord of contextualKeywords) {
      if (factLower.includes(cWord) || factKeywords.some((fWord) => fWord === cWord || isTypoMatch(cWord, fWord))) {
        overlapCount += 0.6;
      }
    }

    // Concept cluster boost
    let conceptBoost = 0;
    for (const [_, config] of activeConcepts) {
      const termMatchInFact = config.terms.some((term) => factLower.includes(term) || factKeywords.some((fk) => isTypoMatch(fk, term)));
      const categoryMatch = config.category && (item.category === config.category || item.category.startsWith(config.category.slice(0, 5)));
      if (termMatchInFact || categoryMatch) {
        conceptBoost += 0.4;
      }
    }

    // Category direct name in query boost
    let categoryBoost = 0;
    const catClean = item.category.replace(/_/g, ' ');
    if (queryLower.includes(catClean) || catClean.split(' ').some((cw) => queryLower.includes(cw))) {
      categoryBoost += 0.25;
    }

    const totalKeywordsCount = Math.max(1, queryKeywords.length + (contextualKeywords.length > 0 ? 1 : 0));
    const keywordScore = overlapCount / (totalKeywordsCount * 1.4);
    const finalScore = Math.min(1.0, keywordScore + conceptBoost + categoryBoost + ((item.confidence || 0.8) * 0.15));

    if (finalScore >= 0.12) {
      scored.push({
        item,
        relevanceScore: finalScore,
      });
    }
  }

  // If relevant scored memories found, return sorted by score
  if (scored.length > 0) {
    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  // Fallback: If no strong keyword overlap, return the most recently reinforced memories
  return validMemories
    .sort((a, b) => new Date(b.lastReinforcedAt || b.createdAt).getTime() - new Date(a.lastReinforcedAt || a.createdAt).getTime())
    .slice(0, Math.min(maxResults, 4))
    .map((item) => ({ item, relevanceScore: 0.3 }));
}
