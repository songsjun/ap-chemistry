import type { Resource } from '@/lib/types'

export function prioritize(weakConcepts: string[], bCandidates: Resource[]): Resource[] {
  if (weakConcepts.length === 0) return bCandidates
  const conceptSet = new Set(weakConcepts)
  return [...bCandidates].sort((a, b) => {
    const scoreA = a.concepts.filter(c => conceptSet.has(c)).length
    const scoreB = b.concepts.filter(c => conceptSet.has(c)).length
    return scoreB - scoreA // descending: higher relevance first
  })
}
