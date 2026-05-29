import { getDb } from '@/lib/infra/db'
import type { Resource, KnowledgePoint, Completion, QuizQuestion, QuizResult, FRQCompletion } from '@/lib/types'
import type { IRepository } from './interface'

export class DexieRepository implements IRepository {
  async getResources(week: number, day: number, tier: 'A' | 'B' | 'C'): Promise<Resource[]> {
    const db = getDb()
    return db.resources.where({ week, day, tier }).sortBy('slot_order')
  }

  async getBResources(conceptIds: string[], seenIds: Set<string>): Promise<Resource[]> {
    const db = getDb()
    return db.resources
      .where('concepts')
      .anyOf(conceptIds)
      .filter(r => r.tier === 'B' && !seenIds.has(r.id))
      .distinct()
      .toArray()
  }

  async getKnowledgePoint(id: string): Promise<KnowledgePoint | null> {
    const db = getDb()
    return (await db.knowledge_points.get(id)) ?? null
  }

  async getCompletions(userId: string, week: number, day: number): Promise<Completion[]> {
    const db = getDb()
    // Query resources for the day (all tiers), then filter completions by those IDs
    const dayResources = await db.resources.where({ week, day }).toArray()
    const resourceIds = new Set(dayResources.map(r => r.id))
    return db.completions
      .where('user_id')
      .equals(userId)
      .filter(c => resourceIds.has(c.resource_id))
      .toArray()
  }

  async getAllUserCompletions(userId: string): Promise<Completion[]> {
    const db = getDb()
    return db.completions.where('user_id').equals(userId).toArray()
  }

  async getCompletionsByResourceIds(userId: string, resourceIds: Set<string>): Promise<Completion[]> {
    const db = getDb()
    // Use compound-PK bulkGet instead of a full user_id index scan + JS filter.
    // The completions PK is [user_id+resource_id], so we can construct the exact
    // keys and retrieve only the records we need — O(k) point lookups vs O(N) scan.
    const keys = Array.from(resourceIds).map(id => [userId, id])
    const results = await db.completions.bulkGet(keys)
    return results.filter((c): c is Completion => c !== undefined)
  }

  async transact(fn: () => Promise<void>): Promise<void> {
    const db = getDb()
    // Include all writable tables so any fn that writes to quiz_results or
    // frq_completions doesn't hit a Dexie TransactionInactiveError and silently
    // roll back the whole transaction.
    await db.transaction('rw', db.completions, db.day_unlocks, db.quiz_results, db.frq_completions, fn)
  }

  async saveCompletion(completion: Completion): Promise<void> {
    const db = getDb()
    await db.completions.put(completion)
  }

  async isDayUnlocked(userId: string, week: number, day: number): Promise<boolean> {
    const db = getDb()
    const record = await db.day_unlocks.get([userId, week, day])
    return record !== undefined
  }

  async unlockDay(userId: string, week: number, day: number): Promise<void> {
    const db = getDb()
    await db.day_unlocks.put({
      user_id: userId,
      week,
      day,
      unlocked_at: new Date().toISOString(),
    })
  }

  async getUnlockedDays(userId: string): Promise<Array<{ week: number; day: number }>> {
    const db = getDb()
    const records = await db.day_unlocks.where('user_id').equals(userId).toArray()
    return records.map(r => ({ week: r.week, day: r.day }))
  }

  async getAllResources(): Promise<Resource[]> {
    const db = getDb()
    return db.resources.toArray()
  }

  async getAllDayResources(week: number, day: number): Promise<Resource[]> {
    const db = getDb()
    return db.resources.where({ week, day }).sortBy('slot_order')
  }

  async getKnowledgePoints(ids: string[]): Promise<KnowledgePoint[]> {
    const db = getDb()
    const results = await db.knowledge_points.bulkGet(ids)
    return results.filter((kp): kp is KnowledgePoint => kp !== undefined)
  }

  async getQuizQuestions(conceptIds: string[], seenIds: Set<string>): Promise<QuizQuestion[]> {
    const db = getDb()
    if (conceptIds.length === 0) return []
    const raw = await db.quiz_questions
      .where('concept_ids').anyOf(conceptIds)
      .filter(q => !seenIds.has(q.id))
      .distinct()
      .toArray()
    // Dexie's .distinct() deduplicates consecutive cursor entries but can miss
    // non-consecutive duplicates when anyOf issues multiple sub-scans over a
    // multi-entry index. A question with N matching concept_ids can appear N times.
    // Explicit dedup by primary key guarantees each question appears at most once.
    const seen = new Set<string>()
    return raw.filter(q => seen.has(q.id) ? false : (seen.add(q.id), true))
  }

  async saveQuizResult(result: QuizResult): Promise<void> {
    const db = getDb()
    await db.quiz_results.put(result)
  }

  async getQuizResultsForDay(userId: string, week: number, day: number): Promise<QuizResult[]> {
    const db = getDb()
    return db.quiz_results
      .where('[user_id+week+day]')
      .equals([userId, week, day])
      .toArray()
  }

  async getAllQuizResultsForUser(userId: string): Promise<QuizResult[]> {
    const db = getDb()
    return db.quiz_results.where('user_id').equals(userId).toArray()
  }

  async saveFRQCompletion(completion: FRQCompletion): Promise<void> {
    const db = getDb()
    // Wrap the read-modify-write in a transaction so concurrent calls (e.g., rapid
    // double-taps on the save button) cannot both read `undefined` and independently
    // decide to set week/day, with the second write silently overriding the first.
    await db.transaction('rw', db.frq_completions, async () => {
      // Preserve the original week/day from the first save so that score edits
      // on a later day don't silently reassign this FRQ to that day's score.
      const existing = await db.frq_completions.get([completion.user_id, completion.frq_id])
      await db.frq_completions.put({
        ...completion,
        week: existing?.week ?? completion.week,
        day:  existing?.day  ?? completion.day,
      })
    })
  }

  async getFRQCompletions(userId: string, frqIds: string[]): Promise<FRQCompletion[]> {
    const db = getDb()
    const keys = frqIds.map(id => [userId, id])
    const results = await db.frq_completions.bulkGet(keys)
    return results.filter((r): r is FRQCompletion => r !== undefined)
  }

  async getAllFRQCompletionsForUser(userId: string): Promise<FRQCompletion[]> {
    const db = getDb()
    return db.frq_completions.where('user_id').equals(userId).toArray()
  }
}
