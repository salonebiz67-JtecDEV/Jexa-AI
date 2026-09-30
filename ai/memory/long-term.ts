import { MemoryItem, MemoryCategory } from '../../shared/types/memory';

export interface FormattedLongTermMemory {
  totalCount: number;
  byCategory: Record<MemoryCategory, MemoryItem[]>;
  summaryText: string;
}

export function formatLongTermMemories(memories: MemoryItem[]): FormattedLongTermMemory {
  const byCategory: Record<MemoryCategory, MemoryItem[]> = {
    user_fact: [],
    preference: [],
    goal: [],
    relationship: [],
    milestone: [],
    interest: [],
  };

  for (const item of memories) {
    if (byCategory[item.category]) {
      byCategory[item.category].push(item);
    } else {
      byCategory.user_fact.push(item);
    }
  }

  const lines = memories.map((m) => `• [${m.category}] ${m.fact}`);
  return {
    totalCount: memories.length,
    byCategory,
    summaryText: lines.join('\n'),
  };
}
