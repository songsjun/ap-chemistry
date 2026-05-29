import { repo } from '@/lib/repository'
import { calcAttemptedPassRate } from '@/lib/domain/scoring'
import type { Completion, CompletionResult, DayStats, Resource } from '@/lib/types'

export const tracker = {
  async record(userId: string, resourceId: string, result: CompletionResult): Promise<void> {
    const completion: Completion = {
      user_id: userId,
      resource_id: resourceId,
      status: result.status,
      score: result.score,
      score_max: result.score_max,
      ai_feedback: result.ai_feedback,
      completed_at: new Date().toISOString(),
    }
    await repo.saveCompletion(completion)
  },

  async unlockDay(userId: string, week: number, day: number): Promise<void> {
    await repo.unlockDay(userId, week, day)
  },

  async getDayStats(userId: string, week: number, day: number, aResources: Resource[]): Promise<DayStats> {
    // NOTE: aResources passed in to avoid reading db.resources inside a Dexie transaction
    const completions = await repo.getCompletions(userId, week, day)
    const completionMap = new Map(completions.map(c => [c.resource_id, c]))

    let passedCount = 0
    let failedCount = 0
    const weakConceptSet = new Set<string>()
    const seenResourceIds = new Set(completions.map(c => c.resource_id))

    for (const resource of aResources) {
      const c = completionMap.get(resource.id)
      if (!c) continue
      if (c.status === 'passed') {
        passedCount++
      } else if (c.status === 'failed') {
        failedCount++
        for (const concept of resource.concepts) {
          weakConceptSet.add(concept)
        }
      }
    }

    const gradedCount = passedCount + failedCount
    // Use aTotal denominator (consistent with computeDayScore): untouched
    // resources count against quality, and AI feedback reflects the same metric.
    const passRate = calcAttemptedPassRate(passedCount, aResources.length)

    return {
      passRate,
      passedCount,
      failedCount,
      gradedCount,
      totalACount: aResources.length,
      weakConcepts: Array.from(weakConceptSet),
      seenResourceIds,
    }
  },

  async getAllProgress(userId: string): Promise<{ completedDays: Array<{ week: number; day: number }> }> {
    const unlockedDays = await repo.getUnlockedDays(userId)
    return { completedDays: unlockedDays }
  },
}
