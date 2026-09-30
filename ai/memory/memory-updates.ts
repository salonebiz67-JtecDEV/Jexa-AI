import { MemoryItem } from '../../shared/types/memory';

export function shouldReinforceMemory(existing: MemoryItem, newText: string): boolean {
  const existingWords = existing.fact.toLowerCase().split(/\s+/);
  const newWords = newText.toLowerCase().split(/\s+/);
  const overlap = existingWords.filter((w) => newWords.includes(w)).length;
  return overlap >= 3;
}

export function deduplicateMemories(memories: MemoryItem[]): MemoryItem[] {
  const seenFacts = new Set<string>();
  const result: MemoryItem[] = [];

  for (const m of memories) {
    const normalized = m.fact.toLowerCase().trim();
    if (!seenFacts.has(normalized)) {
      seenFacts.add(normalized);
      result.push(m);
    }
  }

  return result;
}
