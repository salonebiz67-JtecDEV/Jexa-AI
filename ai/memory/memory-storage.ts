import { MemoryItem, MemoryCreateInput } from '../../shared/types/memory';

export interface IMemoryStorage {
  getAll(userId?: string): Promise<MemoryItem[]>;
  getById(id: string): Promise<MemoryItem | null>;
  create(input: MemoryCreateInput, userId?: string): Promise<MemoryItem>;
  delete(id: string): Promise<boolean>;
  reinforce(id: string): Promise<MemoryItem | null>;
  search(query: string, userId?: string, limit?: number): Promise<MemoryItem[]>;
}
