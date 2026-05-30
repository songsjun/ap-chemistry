// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeFlowState, shouldUnlock } from '@/lib/domain/flow'
import type { DaySnapshot, Resource, Completion, DayStats } from '@/lib/types'

// Test fixture helpers
function makeResource(id: string, overrides: Partial<Resource> = {}): Resource {
  return {
    id,
    title: `Resource ${id}`,
    url: 'https://example.com',
    adapter_type: 'external_manual',
    type: 'video',
    platform: 'khan',
    tier: 'A',
    phase: 'LEARN',
    estimated_minutes: 10,
    concepts: ['concept-1'],
    week: 1,
    day: 1,
    slot_order: 1,
    ...overrides,
  }
}

function makeCompletion(resourceId: string, status: 'passed' | 'failed' | 'skipped'): Completion {
  return {
    user_id: 'test-user',
    resource_id: resourceId,
    status,
    completed_at: new Date().toISOString(),
  }
}

function makeSnapshot(overrides: Partial<DaySnapshot> = {}): DaySnapshot {
  return {
    isUnlocked: true,
    mode: 'STANDARD',
    aResources: [],
    completions: new Map(),
    bCandidates: [],
    bTotalForSession: 0,
    ...overrides,
  }
}

describe('computeFlowState', () => {
  it('Rule 1: isUnlocked=false → LOCKED', () => {
    const result = computeFlowState(makeSnapshot({ isUnlocked: false }))
    expect(result.phase).toBe('LOCKED')
  })

  it('Rule 2: has incomplete A resource → PRESENTING with correct slot/total', () => {
    const resources = [makeResource('r1'), makeResource('r2'), makeResource('r3')]
    const completions = new Map([['r1', makeCompletion('r1', 'passed')]])
    const result = computeFlowState(makeSnapshot({ aResources: resources, completions }))
    expect(result.phase).toBe('PRESENTING')
    if (result.phase === 'PRESENTING') {
      expect(result.resource.id).toBe('r2')
      expect(result.slot).toBe(2)
      expect(result.total).toBe(3)
    }
  })

  it('Rule 2: skipped resource counts as incomplete', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map([['r1', makeCompletion('r1', 'skipped')]])
    const result = computeFlowState(makeSnapshot({ aResources: resources, completions }))
    expect(result.phase).toBe('PRESENTING')
    if (result.phase === 'PRESENTING') {
      expect(result.resource.id).toBe('r1')
      expect(result.slot).toBe(1)
    }
  })

  it('Rule 2: slot=1 when no resources are done yet', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map<string, Completion>()
    const result = computeFlowState(makeSnapshot({ aResources: resources, completions }))
    expect(result.phase).toBe('PRESENTING')
    if (result.phase === 'PRESENTING') {
      expect(result.resource.id).toBe('r1')
      expect(result.slot).toBe(1)
      expect(result.total).toBe(2)
    }
  })

  it('Rule 3: mode=REVIEW + all A done → COMPLETE (ignores passRate)', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map([
      ['r1', makeCompletion('r1', 'failed')],
      ['r2', makeCompletion('r2', 'failed')],
    ])
    const result = computeFlowState(makeSnapshot({
      mode: 'REVIEW',
      aResources: resources,
      completions,
    }))
    expect(result.phase).toBe('COMPLETE')
  })

  it('Rule 4: all A done + passRate≥0.75 → COMPLETE', () => {
    const resources = [makeResource('r1'), makeResource('r2'), makeResource('r3'), makeResource('r4')]
    const completions = new Map([
      ['r1', makeCompletion('r1', 'passed')],
      ['r2', makeCompletion('r2', 'passed')],
      ['r3', makeCompletion('r3', 'passed')],
      ['r4', makeCompletion('r4', 'failed')],
    ])
    const result = computeFlowState(makeSnapshot({ aResources: resources, completions }))
    expect(result.phase).toBe('COMPLETE')
    if (result.phase === 'COMPLETE') {
      expect(result.passRate).toBeCloseTo(0.75)
    }
  })

  it('Rule 4: all A done + passRate=1.0 → COMPLETE', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map([
      ['r1', makeCompletion('r1', 'passed')],
      ['r2', makeCompletion('r2', 'passed')],
    ])
    const result = computeFlowState(makeSnapshot({ aResources: resources, completions }))
    expect(result.phase).toBe('COMPLETE')
    if (result.phase === 'COMPLETE') {
      expect(result.passRate).toBe(1)
    }
  })

  it('Rule 5: all A done + passRate<0.75 + bCandidates non-empty → REMEDIATION', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map([
      ['r1', makeCompletion('r1', 'failed')],
      ['r2', makeCompletion('r2', 'failed')],
    ])
    const bCandidates = [makeResource('b1', { tier: 'B' })]
    const result = computeFlowState(makeSnapshot({
      aResources: resources,
      completions,
      bCandidates,
      bTotalForSession: 1,
    }))
    expect(result.phase).toBe('REMEDIATION')
    if (result.phase === 'REMEDIATION') {
      expect(result.resources).toHaveLength(1)
      expect(result.total).toBe(1)
    }
  })

  it('Rule 5: REMEDIATION slot reflects consumed B resources', () => {
    const resources = [makeResource('r1')]
    const completions = new Map([['r1', makeCompletion('r1', 'failed')]])
    const bCandidates = [makeResource('b2', { tier: 'B' }), makeResource('b3', { tier: 'B' })]
    // bTotalForSession=3, 1 already consumed → 2 remain
    const result = computeFlowState(makeSnapshot({
      aResources: resources,
      completions,
      bCandidates,
      bTotalForSession: 3,
    }))
    expect(result.phase).toBe('REMEDIATION')
    if (result.phase === 'REMEDIATION') {
      expect(result.slot).toBe(2) // 3 - 2 + 1 = 2 (presenting B resource #2)
      expect(result.total).toBe(3)
    }
  })

  it('Rule 6: all A done + passRate<0.75 + bCandidates empty → NEEDS_RETRY', () => {
    const resources = [makeResource('r1')]
    const completions = new Map([['r1', makeCompletion('r1', 'failed')]])
    const result = computeFlowState(makeSnapshot({
      aResources: resources,
      completions,
      bCandidates: [],
      bTotalForSession: 0,
    }))
    expect(result.phase).toBe('NEEDS_RETRY')
  })

  it('does not mutate the input snapshot', () => {
    const resources = [makeResource('r1')]
    const completions = new Map<string, Completion>()
    const snapshot = makeSnapshot({ aResources: resources, completions })
    const originalLength = snapshot.aResources.length
    computeFlowState(snapshot)
    expect(snapshot.aResources.length).toBe(originalLength)
    expect(snapshot.completions.size).toBe(0)
  })
})

describe('shouldUnlock', () => {
  function makeStats(overrides: Partial<DayStats> = {}): DayStats {
    return {
      passRate: 0,
      passedCount: 0,
      failedCount: 0,
      gradedCount: 0,
      totalACount: 4,
      weakConcepts: [],
      seenResourceIds: new Set(),
      ...overrides,
    }
  }

  it('STANDARD mode: passRate≥0.75 → true', () => {
    expect(shouldUnlock(makeStats({ passRate: 0.75 }), 'STANDARD')).toBe(true)
    expect(shouldUnlock(makeStats({ passRate: 1.0 }), 'STANDARD')).toBe(true)
  })

  it('STANDARD mode: passRate<0.75 → false', () => {
    expect(shouldUnlock(makeStats({ passRate: 0.74 }), 'STANDARD')).toBe(false)
    expect(shouldUnlock(makeStats({ passRate: 0 }), 'STANDARD')).toBe(false)
  })

  it('REVIEW mode: always true regardless of passRate', () => {
    expect(shouldUnlock(makeStats({ passRate: 0 }), 'REVIEW')).toBe(true)
    expect(shouldUnlock(makeStats({ passRate: 0.5 }), 'REVIEW')).toBe(true)
    expect(shouldUnlock(makeStats({ passRate: 1.0 }), 'REVIEW')).toBe(true)
  })
})
