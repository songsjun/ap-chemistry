// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeDayScore } from '@/lib/domain/scoring'
import type { Resource, Completion, QuizResult, FRQCompletion } from '@/lib/types'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeResource(id: string, overrides: Partial<Resource> = {}): Resource {
  return {
    id, title: `Resource ${id}`, url: null,
    adapter_type: 'external_manual', type: 'video', platform: 'khan',
    tier: 'A', phase: 'LEARN', estimated_minutes: 10, concepts: ['c1'],
    week: 1, day: 1, slot_order: 1,
    ...overrides,
  }
}

function makeCompletion(resourceId: string, status: 'passed' | 'failed' | 'skipped'): Completion {
  return { user_id: 'u1', resource_id: resourceId, status, completed_at: '2025-01-07T00:00:00Z' }
}

function makeQuizResult(
  questionId: string,
  correct: boolean,
  opts: Partial<QuizResult> = {},
): QuizResult {
  return {
    id: `u1-${questionId}`, user_id: 'u1',
    question_id: questionId, concept_ids: ['c1'],
    week: 1, day: 1, correct,
    student_answer: 'ans', answered_at: '2025-01-07T00:00:00Z',
    question_type: 'mcq', difficulty: 1,
    ...opts,
  }
}

function makeFRQCompletion(frqId: string, score: number, scoreMax: number): FRQCompletion {
  return { user_id: 'u1', frq_id: frqId, week: 1, day: 1, score, score_max: scoreMax, completed_at: '2025-01-07T00:00:00Z' }
}

/** Fixed reference date for recency calculations: Jan 7 2025 */
const NOW = new Date('2025-01-07T12:00:00Z')

function base() {
  return {
    aResources: [] as Resource[],
    aCompletions: new Map<string, Completion>(),
    bCompletions: [] as Completion[],
    cCompletions: [] as Completion[],
    frqCompletions: [] as FRQCompletion[],
    quizResults: [] as QuizResult[],
    now: NOW,
  }
}

// ── A layer ───────────────────────────────────────────────────────────────────

describe('A layer scoring (0–55 pts)', () => {
  it('empty aResources → aScore = 0', () => {
    const { aScore } = computeDayScore(base())
    expect(aScore).toBe(0)
  })

  it('10 resources, all completed and passed → aScore = 55', () => {
    const resources = Array.from({ length: 10 }, (_, i) => makeResource(`r${i}`))
    const completions = new Map(resources.map(r => [r.id, makeCompletion(r.id, 'passed')]))
    const { aScore } = computeDayScore({ ...base(), aResources: resources, aCompletions: completions })
    expect(aScore).toBe(55)
  })

  it('10 resources, all completed, 7 passed 3 failed → completionRate=1, passRate=0.7', () => {
    const resources = Array.from({ length: 10 }, (_, i) => makeResource(`r${i}`))
    const completions = new Map(resources.map((r, i) =>
      [r.id, makeCompletion(r.id, i < 7 ? 'passed' : 'failed')]
    ))
    const { aScore } = computeDayScore({ ...base(), aResources: resources, aCompletions: completions })
    // 30*1.0 + 25*0.7 = 30 + 17.5 = 47.5
    expect(aScore).toBe(47.5)
  })

  it('anti-gaming: only 1/10 resources completed (passed) → low score', () => {
    const resources = Array.from({ length: 10 }, (_, i) => makeResource(`r${i}`))
    const completions = new Map([[resources[0].id, makeCompletion(resources[0].id, 'passed')]])
    const { aScore } = computeDayScore({ ...base(), aResources: resources, aCompletions: completions })
    // completionRate = 1/10 = 0.1, passRate = 1/10 = 0.1 (aTotal denominator, not aGraded)
    // aScore = 30*0.1 + 25*0.1 = 3 + 2.5 = 5.5
    expect(aScore).toBe(5.5)
  })

  it('skipped resources count as done (aDone) but not passed', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const completions = new Map([
      ['r1', makeCompletion('r1', 'passed')],
      ['r2', makeCompletion('r2', 'skipped')],
    ])
    const { aScore } = computeDayScore({ ...base(), aResources: resources, aCompletions: completions })
    // aDone = 1 (skipped not counted), aPassed = 1
    // completionRate = 1/2 = 0.5, passRate = 1/2 = 0.5
    // aScore = 30*0.5 + 25*0.5 = 15 + 12.5 = 27.5
    expect(aScore).toBe(27.5)
  })

  it('no completions at all → aScore = 0', () => {
    const resources = [makeResource('r1'), makeResource('r2')]
    const { aScore } = computeDayScore({ ...base(), aResources: resources })
    expect(aScore).toBe(0)
  })
})

// ── B layer ───────────────────────────────────────────────────────────────────

describe('B layer bonus (0–7 pts)', () => {
  it('no B completions → bBonus = 0', () => {
    const { bBonus } = computeDayScore(base())
    expect(bBonus).toBe(0)
  })

  it('3 passed, no bTotalResources → full bonus (denominator defaults to 3)', () => {
    const bCompletions = [
      makeCompletion('b1', 'passed'),
      makeCompletion('b2', 'passed'),
      makeCompletion('b3', 'passed'),
    ]
    const { bBonus } = computeDayScore({ ...base(), bCompletions })
    expect(bBonus).toBe(7)
  })

  it('bTotalResources=2, both done and passed → full 7 pts (no magic-number-3 penalty)', () => {
    const bCompletions = [makeCompletion('b1', 'passed'), makeCompletion('b2', 'passed')]
    const { bBonus } = computeDayScore({ ...base(), bCompletions, bTotalResources: 2 })
    // bDenominator = min(2,3) = 2, bCoverage = min(2/2,1) = 1, bQuality = 1
    expect(bBonus).toBe(7)
  })

  it('bTotalResources=4, student does 3 → capped to 3 for denominator', () => {
    const bCompletions = [
      makeCompletion('b1', 'passed'),
      makeCompletion('b2', 'passed'),
      makeCompletion('b3', 'passed'),
    ]
    const { bBonus } = computeDayScore({ ...base(), bCompletions, bTotalResources: 4 })
    // bDenominator = min(4,3) = 3, bCoverage = 3/3 = 1 → full bonus
    expect(bBonus).toBe(7)
  })

  it('2 done, 1 passed, 1 failed → partial quality + full coverage', () => {
    const bCompletions = [makeCompletion('b1', 'passed'), makeCompletion('b2', 'failed')]
    const { bBonus } = computeDayScore({ ...base(), bCompletions, bTotalResources: 2 })
    // bQuality = 0.5, bCoverage = 1 → 7 * 0.5 * 1 = 3.5
    expect(bBonus).toBe(3.5)
  })

  it('skipped B resources do not count toward bonus', () => {
    const bCompletions = [makeCompletion('b1', 'passed'), makeCompletion('b2', 'skipped')]
    const { bBonus } = computeDayScore({ ...base(), bCompletions, bTotalResources: 2 })
    // bGraded = 1 (skipped excluded), bPassed = 1
    // bQuality = 1, bDenominator = 2, bCoverage = min(1/2,1) = 0.5
    // bBonus = 7 * 1 * 0.5 = 3.5
    expect(bBonus).toBe(3.5)
  })
})

// ── Quiz scoring ──────────────────────────────────────────────────────────────

describe('Quiz scoring (0–30 pts, x^1.5 curve)', () => {
  it('no quiz results → quizScore = 0', () => {
    const { quizScore } = computeDayScore(base())
    expect(quizScore).toBe(0)
  })

  it('all correct (d1) → quizScore = 30', () => {
    const quizResults = [
      makeQuizResult('q1', true),
      makeQuizResult('q2', true),
      makeQuizResult('q3', true),
    ]
    const { quizScore } = computeDayScore({ ...base(), quizResults })
    expect(quizScore).toBe(30)
  })

  it('all wrong → quizScore = 0', () => {
    const quizResults = [makeQuizResult('q1', false), makeQuizResult('q2', false)]
    const { quizScore } = computeDayScore({ ...base(), quizResults })
    expect(quizScore).toBe(0)
  })

  it('x^1.5 curve: 75% correct → ~19.5 (less punishing than x^2=16.9)', () => {
    // 3 correct, 1 wrong, all equal-weight (d1, mcq)
    const quizResults = [
      makeQuizResult('q1', true),
      makeQuizResult('q2', true),
      makeQuizResult('q3', true),
      makeQuizResult('q4', false),
    ]
    const { quizScore } = computeDayScore({ ...base(), quizResults })
    const expected = Math.round(30 * Math.pow(0.75, 1.5) * 10) / 10
    expect(quizScore).toBe(expected) // ≈ 19.5
    expect(quizScore).toBeGreaterThan(16.9) // better than old x^2
  })

  it('feynman weight (0.30) outweighs d1 (0.15): 1 feynman correct + 3 d1 wrong', () => {
    const quizResults = [
      makeQuizResult('qf', true, { question_type: 'feynman', difficulty: 2 }),
      makeQuizResult('q1', false, { question_type: 'mcq', difficulty: 1 }),
      makeQuizResult('q2', false, { question_type: 'mcq', difficulty: 1 }),
      makeQuizResult('q3', false, { question_type: 'mcq', difficulty: 1 }),
    ]
    const { quizScore } = computeDayScore({ ...base(), quizResults })
    // weightedCorrect = 0.30, weightedTotal = 0.30 + 3*0.15 = 0.75
    // quizRate = 0.4, quizScore = 30 * 0.4^1.5 ≈ 7.6
    expect(quizScore).toBeGreaterThan(0)
    expect(quizScore).toBeLessThan(15)
  })

  it('difficulty-3 weight (0.25): 1 d3 wrong + 1 d1 correct changes rate', () => {
    const quizResults = [
      makeQuizResult('q_hard', false, { question_type: 'mcq', difficulty: 3 }),
      makeQuizResult('q_easy', true, { question_type: 'mcq', difficulty: 1 }),
    ]
    const { quizScore } = computeDayScore({ ...base(), quizResults })
    // weightedCorrect = 0.15, weightedTotal = 0.25 + 0.15 = 0.40
    // quizRate = 0.375, quizScore = 30 * 0.375^1.5 ≈ 6.9
    expect(quizScore).toBeGreaterThan(0)
    expect(quizScore).toBeLessThan(15)
  })

  it('dedup: same question answered twice — only latest counts', () => {
    const wrongFirst: QuizResult = makeQuizResult('q1', false, { answered_at: '2025-01-06T00:00:00Z' })
    const rightLater: QuizResult = makeQuizResult('q1', true, { answered_at: '2025-01-07T00:00:00Z' })
    const { quizScore } = computeDayScore({ ...base(), quizResults: [wrongFirst, rightLater] })
    // Only the later (correct) entry counts → quizRate = 1 → quizScore = 30
    expect(quizScore).toBe(30)
  })

  it('dedup: latest wrong overrides earlier correct', () => {
    const rightFirst: QuizResult = makeQuizResult('q1', true, { answered_at: '2025-01-06T00:00:00Z' })
    const wrongLater: QuizResult = makeQuizResult('q1', false, { answered_at: '2025-01-07T00:00:00Z' })
    const { quizScore } = computeDayScore({ ...base(), quizResults: [rightFirst, wrongLater] })
    // Only the later (wrong) entry counts → quizRate = 0 → quizScore = 0
    expect(quizScore).toBe(0)
  })

  it('recency factor: >30 days old → weight multiplied by 0.7', () => {
    // Q answered >30 days before NOW (2025-01-07), and Q answered today
    const oldResult = makeQuizResult('qOld', true, { answered_at: '2024-11-01T00:00:00Z' }) // ~67 days ago
    const newResult = makeQuizResult('qNew', false, { answered_at: '2025-01-07T00:00:00Z' }) // today
    const { quizScore } = computeDayScore({ ...base(), quizResults: [oldResult, newResult] })
    // oldResult: w = 0.15 * 0.7 = 0.105, correct
    // newResult: w = 0.15 * 1.0 = 0.15, wrong
    // weightedCorrect = 0.105, weightedTotal = 0.255
    // quizRate ≈ 0.412
    // quizScore = 30 * 0.412^1.5 ≈ 7.9
    expect(quizScore).toBeGreaterThan(0)
    expect(quizScore).toBeLessThan(15)
  })

  it('7-day window: within 7 days → recencyFactor = 1.0', () => {
    const recent = makeQuizResult('q1', true, { answered_at: '2025-01-05T00:00:00Z' }) // 2 days ago
    const { quizScore } = computeDayScore({ ...base(), quizResults: [recent] })
    expect(quizScore).toBe(30) // full weight → quizRate = 1 → 30
  })
})

// ── Total score and calibration ───────────────────────────────────────────────

describe('Total score and calibration', () => {
  it('total capped at 100', () => {
    // Construct a near-perfect day to verify cap
    const resources = Array.from({ length: 10 }, (_, i) => makeResource(`r${i}`))
    const aCompletions = new Map(resources.map(r => [r.id, makeCompletion(r.id, 'passed')]))
    const bCompletions = [
      makeCompletion('b1', 'passed'), makeCompletion('b2', 'passed'), makeCompletion('b3', 'passed'),
    ]
    const cCompletions = [makeCompletion('c1', 'passed'), makeCompletion('c2', 'passed')]
    const frqCompletions = [makeFRQCompletion('frq1', 9, 10)] // 90% → passing
    const quizResults = [
      makeQuizResult('q1', true), makeQuizResult('q2', true),
      makeQuizResult('q3', true), makeQuizResult('q4', true, { question_type: 'feynman', difficulty: 2 }),
    ]
    const { total } = computeDayScore({
      ...base(),
      aResources: resources, aCompletions,
      bCompletions, cCompletions, frqCompletions, quizResults,
    })
    expect(total).toBeLessThanOrEqual(100)
  })

  it('calibration: A fully done (100% pass) + Quiz 100% = 85 pts', () => {
    const resources = Array.from({ length: 4 }, (_, i) => makeResource(`r${i}`))
    const aCompletions = new Map(resources.map(r => [r.id, makeCompletion(r.id, 'passed')]))
    const quizResults = [
      makeQuizResult('q1', true), makeQuizResult('q2', true), makeQuizResult('q3', true),
      makeQuizResult('q4', true, { question_type: 'feynman', difficulty: 2 }),
    ]
    const { total } = computeDayScore({ ...base(), aResources: resources, aCompletions, quizResults })
    // aScore = 55, quizScore = 30 → total = 85
    expect(total).toBe(85)
  })

  it('calibration: A fully done (75% pass) + Quiz 75% → light-green badge range (65–80)', () => {
    const resources = Array.from({ length: 4 }, (_, i) => makeResource(`r${i}`))
    const aCompletions = new Map(resources.map((r, i) =>
      [r.id, makeCompletion(r.id, i < 3 ? 'passed' : 'failed')]
    ))
    // 3 correct, 1 wrong, equal-weight quiz
    const quizResults = [
      makeQuizResult('q1', true), makeQuizResult('q2', true), makeQuizResult('q3', true),
      makeQuizResult('q4', false),
    ]
    const { total } = computeDayScore({ ...base(), aResources: resources, aCompletions, quizResults })
    // aScore = 30*1 + 25*0.75 = 48.75, quizScore = 30*0.75^1.5 ≈ 19.5 → total ≈ 68
    // Badge thresholds: BADGE_DARK_GREEN=80, BADGE_LIGHT_GREEN=65, BADGE_AMBER=50
    // This student lands in the light-green zone (65–80).
    expect(total).toBeGreaterThanOrEqual(65)
    expect(total).toBeLessThan(80)
  })

  it('all empty → total = 0', () => {
    const { total } = computeDayScore(base())
    expect(total).toBe(0)
  })
})

// ── C layer + FRQ ─────────────────────────────────────────────────────────────

describe('C layer + FRQ bonus (0–8 pts)', () => {
  it('no C or FRQ → cBonus = 0', () => {
    const { cBonus } = computeDayScore(base())
    expect(cBonus).toBe(0)
  })

  it('FRQ ≥60% → counts as passing', () => {
    const frqCompletions = [makeFRQCompletion('f1', 6, 10)] // 60% exactly
    const { cBonus } = computeDayScore({ ...base(), frqCompletions })
    // cFRQCount=1, cFRQPassed=1, cQuality=1, cCoverage=min(1/2,1)=0.5 → 8*1*0.5=4
    expect(cBonus).toBe(4)
  })

  it('FRQ <60% → does not count as passing', () => {
    const frqCompletions = [makeFRQCompletion('f1', 5, 10)] // 50%
    const { cBonus } = computeDayScore({ ...base(), frqCompletions })
    // cQuality = 0/1 = 0 → cBonus = 0
    expect(cBonus).toBe(0)
  })

  it('2 C-layer passed + 1 FRQ passing → full 8 pts', () => {
    const cCompletions = [makeCompletion('c1', 'passed'), makeCompletion('c2', 'passed')]
    const frqCompletions = [makeFRQCompletion('f1', 8, 10)]
    const { cBonus } = computeDayScore({ ...base(), cCompletions, frqCompletions })
    // cFRQCount=3, cFRQPassed=3, cQuality=1, cCoverage=min(3/2,1)=1 → 8
    expect(cBonus).toBe(8)
  })
})
