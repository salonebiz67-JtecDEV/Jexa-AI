import { MemoryItem, MemorySearchResult } from '../../shared/types/memory';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'if', 'then',
  'else', 'when', 'up', 'down', 'in', 'out', 'to', 'for', 'of', 'with', 'about',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'their',
  'what', 'how', 'why', 'can', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function searchRelevantMemories(
  query: string,
  memories: MemoryItem[],
  maxResults: number = 5,
  minConfidence: number = 0.5
): MemorySearchResult[] {
  if (memories.length === 0) return [];

  const queryKeywords = extractKeywords(query);
  if (queryKeywords.length === 0) {
    // Return most recently reinforced memories with high confidence
    return memories
      .filter((m) => m.confidence >= minConfidence)
      .sort((a, b) => new Date(b.lastReinforcedAt).getTime() - new Date(a.lastReinforcedAt).getTime())
      .slice(0, maxResults)
      .map((item) => ({ item, relevanceScore: 0.5 }));
  }

  const scored: MemorySearchResult[] = [];

  for (const item of memories) {
    if (item.confidence < minConfidence) continue;

    const factKeywords = extractKeywords(item.fact);
    let overlapCount = 0;

    for (const qWord of queryKeywords) {
      if (factKeywords.some((fWord) => fWord.includes(qWord) || qWord.includes(fWord))) {
        overlapCount++;
      }
    }

    // Boost score if category matches
    let categoryBoost = 0;
    if (query.toLowerCase().includes(item.category.replace('_', ' '))) {
      categoryBoost = 0.2;
    }

    const keywordScore = queryKeywords.length > 0 ? overlapCount / queryKeywords.length : 0;
    const finalScore = Math.min(1, keywordScore + categoryBoost + (item.confidence * 0.2));

    if (finalScore > 0.15) {
      scored.push({
        item,
        relevanceScore: finalScore,
      });
    }
  }

  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);
}
