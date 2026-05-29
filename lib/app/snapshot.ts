import { catalog } from '@/lib/domain/catalog'
import { prioritize } from '@/lib/domain/adaptive'
import { repo } from '@/lib/repository'
import { WEEKS } from '@/lib/constants'
import type { DaySnapshot, DayMode, Completion, Resource } from '@/lib/types'

export async function assembleDaySnapshot(
  userId: string,
  week: number,
  day: number
): Promise<DaySnapshot> {
  const mode: DayMode = week === WEEKS ? 'REVIEW' : 'STANDARD'

  // Parallel fetches for independent data
  const [aResources, isUnlocked, completionsList, allCompletions] = await Promise.all([
    catalog.getDay(week, day, 'A'),
    repo.isDayUnlocked(userId, week, day),
    repo.getCompletions(userId, week, day),
    repo.getAllUserCompletions(userId),  // lifetime seenIds for cross-day B deduplication
  ])

  const completions = new Map(completionsList.map(c => [c.resource_id, c]))

  // Compute stats from already-fetched data (no extra DB read)
  const stats = computeStatsFromData(aResources, completionsList)

  // Use lifetime completions so B resources already seen on other days are excluded
  const lifetimeSeenIds = new Set(allCompletions.map(c => c.resource_id))

  // B candidates depend on weakConcepts from stats
  const rawBCandidates = await catalog.getBCandidates(stats.weakConcepts, lifetimeSeenIds)
  const bCandidates = prioritize(stats.weakConcepts, rawBCandidates)

  return {
    isUnlocked,
    mode,
    aResources,
    completions,
    bCandidates,
    bTotalForSession: bCandidates.length,
  }
}

function computeStatsFromData(
  aResources: Resource[],
  completionsList: Completion[]
): { weakConcepts: string[]; seenResourceIds: Set<string> } {
  const completionMap = new Map(completionsList.map(c => [c.resource_id, c]))
  const weakConceptSet = new Set<string>()
  const seenResourceIds = new Set(completionsList.map(c => c.resource_id))

  for (const resource of aResources) {
    const c = completionMap.get(resource.id)
    if (c?.status === 'failed') {
      for (const concept of resource.concepts) {
        weakConceptSet.add(concept)
      }
    }
  }

  return {
    weakConcepts: Array.from(weakConceptSet),
    seenResourceIds,
  }
}
