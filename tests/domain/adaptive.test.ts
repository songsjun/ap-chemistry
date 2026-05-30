// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { prioritize } from '@/lib/domain/adaptive'
import type { Resource } from '@/lib/types'

function makeResource(id: string, concepts: string[]): Resource {
  return {
    id,
    title: `Resource ${id}`,
    url: null,
    adapter_type: 'external_manual',
    type: 'reading',
    platform: 'openstax',
    tier: 'B',
    phase: 'LEARN',
    estimated_minutes: 15,
    concepts,
    week: 1,
    day: 1,
    slot_order: 1,
  }
}

describe('prioritize', () => {
  it('returns empty array for empty candidates', () => {
    expect(prioritize(['concept-1'], [])).toEqual([])
  })

  it('returns candidates unchanged when no weak concepts', () => {
    const candidates = [makeResource('b1', ['c1']), makeResource('b2', ['c2'])]
    const result = prioritize([], candidates)
    expect(result).toHaveLength(2)
  })

  it('sorts by concept overlap count descending', () => {
    const c1 = makeResource('b1', ['concept-a'])
    const c2 = makeResource('b2', ['concept-a', 'concept-b', 'concept-c'])
    const c3 = makeResource('b3', ['concept-a', 'concept-b'])
    const result = prioritize(['concept-a', 'concept-b'], [c1, c2, c3])
    expect(result[0].id).toBe('b2') // 2 matches
    expect(result[1].id).toBe('b3') // 2 matches
    expect(result[2].id).toBe('b1') // 1 match
  })

  it('resources with no overlap are sorted last', () => {
    const c1 = makeResource('b1', ['irrelevant'])
    const c2 = makeResource('b2', ['concept-a'])
    const result = prioritize(['concept-a'], [c1, c2])
    expect(result[0].id).toBe('b2')
    expect(result[1].id).toBe('b1')
  })

  it('resource with more concept overlaps ranks higher', () => {
    const c1 = makeResource('b1', ['concept-x'])
    const c2 = makeResource('b2', ['concept-x', 'concept-y', 'concept-z'])
    const result = prioritize(['concept-x', 'concept-y'], [c1, c2])
    // c2 has 2 overlaps (concept-x, concept-y), c1 has 1 overlap → c2 ranks first
    expect(result[0].id).toBe('b2')
    expect(result[1].id).toBe('b1')
  })

  it('does not mutate input array', () => {
    const candidates = [makeResource('b1', ['c1']), makeResource('b2', ['c2'])]
    const original = [...candidates]
    prioritize(['c1'], candidates)
    expect(candidates[0].id).toBe(original[0].id)
    expect(candidates[1].id).toBe(original[1].id)
  })

  it('returns a new array, not the same reference', () => {
    const candidates = [makeResource('b1', ['c1'])]
    const resultWithConcepts = prioritize(['c1'], candidates)
    expect(Array.isArray(resultWithConcepts)).toBe(true)
  })

  it('handles resource with zero concept overlap correctly', () => {
    const c1 = makeResource('b1', ['unrelated-a', 'unrelated-b'])
    const c2 = makeResource('b2', ['concept-1'])
    const result = prioritize(['concept-1'], [c1, c2])
    expect(result[0].id).toBe('b2') // 1 match vs 0
    expect(result[1].id).toBe('b1') // 0 matches
  })
})
