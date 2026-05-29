import { repo } from '@/lib/repository'
import type { QuizQuestion, QuizResult } from '@/lib/types'

/** Soft-dedup window: questions answered *correctly* within this many days are
 *  excluded. Questions answered *incorrectly* are always eligible (re-expose errors).
 *  Questions answered correctly more than DEDUP_WINDOW_DAYS ago become eligible
 *  again — a lightweight spaced-repetition heuristic without a full SR engine. */
const DEDUP_WINDOW_DAYS = 14

/**
 * Select questions for the daily challenge.
 * Returns count-1 regular questions (mcq/fill/short) + 1 feynman question.
 *
 * Difficulty sampling: guarantees at least 1 difficulty-3 question when the
 * pool has one, so students encounter AP-level synthesis questions regularly.
 *
 * Dedup: questions answered correctly within the last DEDUP_WINDOW_DAYS are
 * excluded; incorrect answers are always re-eligible to reinforce weak spots.
 */
export async function selectDailyQuestions(
  userId: string,
  _week: number,
  _day: number,
  conceptIds: string[],
  count = 4,
): Promise<QuizQuestion[]> {
  if (conceptIds.length === 0) return []

  // Fetch all history once — used for both exclusion and weakness scoring.
  const allResults = await repo.getAllQuizResultsForUser(userId)

  // Soft dedup: only exclude questions answered correctly within the window.
  // Incorrectly-answered questions are never excluded (re-exposure helps learning).
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86_400_000).toISOString()
  const seenIds = new Set(
    allResults
      .filter(r => r.correct && r.answered_at > cutoff)
      .map(r => r.question_id),
  )

  const candidates = await repo.getQuizQuestions(conceptIds, seenIds)
  let regular = candidates.filter(q => q.type !== 'feynman')
  const feynmanPool = candidates.filter(q => q.type === 'feynman')

  // Fallback: check coverage against the *regular* pool only — a concept whose
  // only surviving questions are feynman-typed still has no regular question,
  // so the regular pool can be silently short without this fallback.
  const coveredByRegular = new Set(regular.flatMap(q => q.concept_ids))
  const uncoveredIds = conceptIds.filter(id => !coveredByRegular.has(id))
  if (uncoveredIds.length > 0) {
    const fallback = await repo.getQuizQuestions(uncoveredIds, new Set())
    const existingIds = new Set(candidates.map(q => q.id))
    const newRegular = fallback.filter(q => q.type !== 'feynman' && !existingIds.has(q.id))
    regular = [...regular, ...newRegular]
  }

  // Difficulty sampling: guarantee 1 d3 slot, fill rest from d1/d2.
  // Shuffling each pool and the final selection ensures randomness.
  const d1d2 = shuffle(regular.filter(q => q.difficulty !== 3))
  const d3   = shuffle(regular.filter(q => q.difficulty === 3))
  const slots = count - 1
  const hardPick     = d3.slice(0, 1)                           // 0 or 1 hard question
  const easyMedPick  = d1d2.slice(0, slots - hardPick.length)  // fill remaining slots
  const regularSelected = shuffle([...easyMedPick, ...hardPick])

  // Feynman question: weak-concept-first, else first available
  const feynman = pickFeynmanQuestion(conceptIds, feynmanPool, allResults)

  return feynman ? [...regularSelected, feynman] : regularSelected
}

/** Minimum days before the same Feynman question is eligible to be picked again.
 *  Prevents the same question appearing in back-to-back sessions, which creates a
 *  self-reinforcing loop where weak students never see other Feynman questions. */
const FEYNMAN_MIN_INTERVAL_DAYS = 3

function pickFeynmanQuestion(
  conceptIds: string[],
  pool: QuizQuestion[],
  allResults: QuizResult[],
): QuizQuestion | null {
  if (pool.length === 0) return null
  // Note: pool.length === 1 is NOT early-returned — the recency penalty below
  // must still be applied for consistent behaviour (a single-item pool returns
  // pool[0] anyway, since there are no higher-scoring alternatives).

  const conceptSet = new Set(conceptIds)

  // Net failure score per concept: each wrong answer +1, each correct -1
  const netFailures = new Map<string, number>()
  for (const r of allResults) {
    for (const cid of r.concept_ids) {
      if (!conceptSet.has(cid)) continue
      netFailures.set(cid, (netFailures.get(cid) ?? 0) + (r.correct ? -1 : 1))
    }
  }

  // Recency: track the most recent answer timestamp per question
  const lastAnswered = new Map<string, string>()
  for (const r of allResults) {
    const existing = lastAnswered.get(r.question_id)
    if (!existing || r.answered_at > existing) lastAnswered.set(r.question_id, r.answered_at)
  }

  const now = Date.now()
  const scored = pool.map(q => {
    const conceptScore = q.concept_ids.length === 0
      ? 0
      : Math.max(...q.concept_ids.map(id => netFailures.get(id) ?? 0))
    const lastTime = lastAnswered.get(q.id)
    const daysSinceLast = lastTime
      ? (now - new Date(lastTime).getTime()) / 86_400_000
      : Infinity
    // Apply a penalty for questions seen within the minimum interval to break
    // self-reinforcing loops where the same question appears every session.
    const recencyPenalty = daysSinceLast < FEYNMAN_MIN_INTERVAL_DAYS
      ? FEYNMAN_MIN_INTERVAL_DAYS - daysSinceLast
      : 0
    return { q, score: conceptScore - recencyPenalty }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].q
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
