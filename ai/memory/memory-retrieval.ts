import { MemoryItem, MemorySearchResult } from '../../shared/types/memory';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'if', 'then',
  'else', 'when', 'up', 'down', 'in', 'out', 'to', 'for', 'of', 'with', 'about',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'their',
  'what', 'how', 'why', 'can', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'tell', 'know', 'anything', 'something', 'everything', 'please', 'me', 'us'
]);

// Meta-memory inquiry patterns where the user is explicitly asking to inspect what is remembered
const META_MEMORY_PATTERNS = [
  /what\s+(do\s+you|did\s+you)\s+remember\s+(about\s+me|about\s+us|about\s+my)?/i,
  /what\s+do\s+you\s+know\s+about\s+me/i,
  /tell\s+me\s+what\s+you\s+remember/i,
  /do\s+you\s+remember\s+(me|anything\s+about\s+me|who\s+i\s+am)/i,
  /list\s+(all\s+)?(my\s+)?memories/i,
  /what\s+have\s+i\s+told\s+you/i,
  /what\s+(information|facts|notes)\s+do\s+you\s+have\s+(on|about)\s+me/i,
  /what\s+are\s+my\s+(preferences|goals|details|facts)/i,
  /what\s+is\s+in\s+my\s+memory/i,
  /who\s+am\s+i\s+(to\s+you)?/i,
  /check\s+(my\s+)?(saved\s+)?memories/i,
];

// Semantic concept and category mappings for high-relevance intent matching
const CONCEPT_EXPANSIONS: Record<string, { terms: string[]; category?: string }> = {
  relationship: {
    terms: ['wife', 'husband', 'partner', 'spouse', 'son', 'daughter', 'kid', 'child', 'children', 'brother', 'sister', 'mother', 'father', 'mom', 'dad', 'friend', 'pet', 'dog', 'cat', 'family'],
    category: 'relationship',
  },
  location: {
    terms: ['live', 'living', 'lives', 'based', 'moved', 'home', 'city', 'country', 'state', 'town', 'location', 'freetown', 'london', 'york'],
    category: 'user_fact',
  },
  identity: {
    terms: ['name', 'called', 'nickname', 'call', 'who', 'user'],
    category: 'user_fact',
  },
  career: {
    terms: ['work', 'job', 'profession', 'career', 'company', 'startup', 'engineer', 'developer', 'founder', 'ceo', 'role'],
    category: 'user_fact',
  },
  technical: {
    terms: ['stack', 'technology', 'tech', 'languages', 'code', 'coding', 'typescript', 'python', 'react', 'node', 'postgres', 'database', 'backend', 'frontend'],
    category: 'user_fact',
  },
  goal: {
    terms: ['goal', 'goals', 'aim', 'plan', 'plans', 'working', 'building', 'launching', 'project', 'projects', 'target', 'objective'],
    category: 'goal',
  },
  preference: {
    terms: ['prefer', 'preference', 'preferences', 'favorite', 'favourite', 'like', 'likes', 'dislike', 'style', 'format', 'vibe', 'habit'],
    category: 'preference',
  },
};

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(?:ing|tion|ed|es|s)$/, '');
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function isMetaMemoryQuery(query: string): boolean {
  const trimmed = query.trim();
  return META_MEMORY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function searchRelevantMemories(
  query: string,
  memories: MemoryItem[],
  maxResults: number = 8,
  minConfidence: number = 0.4
): MemorySearchResult[] {
  if (!memories || memories.length === 0) return [];

  // Filter valid memories
  const validMemories = memories.filter((m) => m && m.fact && m.confidence >= minConfidence);
  if (validMemories.length === 0) return [];

  // 1. META-MEMORY QUERY: When the user asks "What do you remember about me?" or equivalent
  // Return all durable facts across all past conversations, ordered by recency and confidence
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

  // 2. CONTEXTUAL SEARCH: Score memories by keyword overlap, synonym expansion, and category relevance
  const queryKeywords = extractKeywords(query);
  const normalizedQueryWords = queryKeywords.map(normalizeWord).filter(Boolean);

  // Check which concept clusters match the query
  const queryLower = query.toLowerCase();
  const activeConcepts = Object.entries(CONCEPT_EXPANSIONS).filter(([_, config]) => {
    return config.terms.some((term) => queryLower.includes(term));
  });

  const scored: MemorySearchResult[] = [];

  for (const item of validMemories) {
    const factLower = item.fact.toLowerCase();
    const factKeywords = extractKeywords(item.fact);
    const normalizedFactWords = factKeywords.map(normalizeWord).filter(Boolean);

    let overlapCount = 0;

    // Exact word or substring matches
    for (const qWord of queryKeywords) {
      if (factLower.includes(qWord)) {
        overlapCount += 1.5;
      } else if (factKeywords.some((fWord) => fWord.includes(qWord) || qWord.includes(fWord))) {
        overlapCount += 1.0;
      }
    }

    // Stemmed word matches
    for (const nqWord of normalizedQueryWords) {
      if (normalizedFactWords.some((nfWord) => nfWord === nqWord || nfWord.startsWith(nqWord) || nqWord.startsWith(nfWord))) {
        overlapCount += 0.8;
      }
    }

    // Concept cluster boost
    let conceptBoost = 0;
    for (const [_, config] of activeConcepts) {
      const termMatchInFact = config.terms.some((term) => factLower.includes(term));
      const categoryMatch = config.category && item.category === config.category;
      if (termMatchInFact || categoryMatch) {
        conceptBoost += 0.35;
      }
    }

    // Category direct name in query boost
    let categoryBoost = 0;
    if (queryLower.includes(item.category.replace('_', ' '))) {
      categoryBoost += 0.25;
    }

    const keywordScore = queryKeywords.length > 0 ? overlapCount / (queryKeywords.length * 1.5) : 0;
    const finalScore = Math.min(1.0, keywordScore + conceptBoost + categoryBoost + (item.confidence * 0.15));

    if (finalScore >= 0.12) {
      scored.push({
        item,
        relevanceScore: finalScore,
      });
    }
  }

  // If we found relevant scored memories, return them ranked by relevance
  if (scored.length > 0) {
    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  // Fallback: If no strong keyword overlap, return the most recently reinforced memories with high confidence
  return validMemories
    .sort((a, b) => new Date(b.lastReinforcedAt || b.createdAt).getTime() - new Date(a.lastReinforcedAt || a.createdAt).getTime())
    .slice(0, Math.min(maxResults, 4))
    .map((item) => ({ item, relevanceScore: 0.3 }));
}

