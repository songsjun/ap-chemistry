import { repo } from '@/lib/repository'
import type { Resource, KnowledgePoint } from '@/lib/types'

export const catalog = {
  async getDay(week: number, day: number, tier: 'A' | 'B' | 'C'): Promise<Resource[]> {
    return repo.getResources(week, day, tier)
    // returns already sorted by slot_order (DexieRepository handles this)
  },

  async getKP(id: string): Promise<KnowledgePoint | null> {
    return repo.getKnowledgePoint(id)
  },

  async getBCandidates(conceptIds: string[], seenIds: Set<string>): Promise<Resource[]> {
    // seenIds filtering is handled by DexieRepository.getBResources
    return repo.getBResources(conceptIds, seenIds)
  },
}
