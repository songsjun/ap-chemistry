import type { Completion, QuizResult, Resource, FRQCompletion } from '@/lib/types'

export interface ScoreInput {
  aResources: Resource[]
  aCompletions: Map<string, Completion>
  bCompletions: Completion[]
  cCompletions: Completion[]
  frqCompletions: FRQCompletion[]
  quizResults: QuizResult[]
  now?: Date
  /** Total B-layer resources available that day (not just those the student touched).
   *  When provided, coverage denominator is min(bTotalResources, 3) so a day with
   *  only 2 B resources can still reach 100% B bonus. Defaults to 3 if omitted. */
  bTotalResources?: number
}

export interface ScoreBreakdown {
  aScore: number
  bBonus: number
  cBonus: number
  quizScore: number
  total: number
}

function recencyFactor(completedAt: string, now: Date): number {
  const days = (now.getTime() - new Date(completedAt).getTime()) / 86_400_000
  if (days <= 7) return 1.0
  if (days <= 30) return 0.85
  return 0.7
}

function quizWeight(result: QuizResult): number {
  if (result.question_type === 'feynman') return 0.30
  switch (result.difficulty) {
    case 3: return 0.25
    case 2: return 0.20
    default: return 0.15   // difficulty 1 or unknown
  }
}

/**
 * Canonical pass-rate denominator: uses aTotal (not just graded) so
 * untouched resources count against quality — prevents gaming the gate
 * by doing only one easy resource.  All callers should use this function
 * instead of rolling their own passed/gradedCount formula.
 */
export function calcAttemptedPassRate(passed: number, aTotal: number): number {
  return aTotal > 0 ? passed / aTotal : 0
}

/**
 * Deduplicate quiz results per question_id, keeping the latest attempt.
 * A question answered incorrectly becomes re-eligible and may produce a
 * second result row — without this dedup, totals and weighted scores are
 * inflated. Single source of truth used by scoring and dashboard display.
 */
export function latestPerQuestion(results: QuizResult[]): QuizResult[] {
  const map = new Map<string, QuizResult>()
  for (const r of results) {
    const existing = map.get(r.question_id)
    if (!existing || r.answered_at > existing.answered_at) map.set(r.question_id, r)
  }
  return Array.from(map.values())
}

export function computeDayScore(input: ScoreInput): ScoreBreakdown {
  const now = input.now ?? new Date()
  const { aResources, aCompletions, bCompletions, cCompletions, frqCompletions, quizResults } = input

  // ── A layer: 0–55 points ────────────────────────────────────────────────────
  const aTotal = aResources.length
  const aDone = aResources.filter(r => {
    const c = aCompletions.get(r.id)
    return c && c.status !== 'skipped'
  }).length
  const aPassed = aResources.filter(r => aCompletions.get(r.id)?.status === 'passed').length
  const completionRate = aTotal > 0 ? aDone / aTotal : 0
  // Use aTotal (not aGraded) as denominator: untouched resources count against
  // quality, preventing "do one easy resource and get full quality score" exploit.
  const passRate = aTotal > 0 ? aPassed / aTotal : 0
  const aScore = aTotal === 0 ? 0 : 30 * completionRate + 25 * passRate

  // ── B layer: 0–7 points (only graded resources count) ──────────────────────
  const bGraded = bCompletions.filter(c => c.status !== 'skipped')
  const bPassed = bGraded.filter(c => c.status === 'passed').length
  const bCount = bGraded.length
  const bQuality = bCount > 0 ? bPassed / bCount : 0
  const bDenominator = Math.min(input.bTotalResources ?? 3, 3)
  const bCoverage = bDenominator > 0 ? Math.min(bCount / bDenominator, 1) : 0
  const bBonus = 7 * bQuality * bCoverage

  // ── C layer + FRQ: 0–8 points (only graded resources count) ───────────────
  const cGraded = cCompletions.filter(c => c.status !== 'skipped')
  const cPassed = cGraded.filter(c => c.status === 'passed').length
  const frqPassed = frqCompletions.filter(f => f.score_max > 0 && f.score / f.score_max >= 0.6).length
  const cFRQCount = cGraded.length + frqCompletions.length
  const cFRQPassed = cPassed + frqPassed
  const cQuality = cFRQCount > 0 ? cFRQPassed / cFRQCount : 0
  const cCoverage = Math.min(cFRQCount / 2, 1)
  const cBonus = 8 * cQuality * cCoverage

  // ── Quiz: 0–30 points, squared correct-rate for steep wrong-answer penalty ─
  let weightedCorrect = 0
  let weightedTotal = 0
  for (const r of latestPerQuestion(quizResults)) {
    const w = quizWeight(r) * recencyFactor(r.answered_at, now)
    weightedTotal += w
    if (r.correct) weightedCorrect += w
  }
  const quizRate = weightedTotal > 0 ? weightedCorrect / weightedTotal : 0
  // x^1.5 instead of x^2: retains wrong-answer penalty but is less punishing for
  // students in the normal 60–80% correct-rate range during active learning.
  const quizScore = 30 * Math.pow(quizRate, 1.5)

  const total = Math.round(Math.min(100, aScore + bBonus + cBonus + quizScore))
  return {
    aScore: Math.round(aScore * 10) / 10,
    bBonus: Math.round(bBonus * 10) / 10,
    cBonus: Math.round(cBonus * 10) / 10,
    quizScore: Math.round(quizScore * 10) / 10,
    total,
  }
}
