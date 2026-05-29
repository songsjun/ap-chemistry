import { getDb, type DayUnlock } from '@/lib/infra/db'
import type { Completion, QuizResult } from '@/lib/types'

// ── Type guards ──────────────────────────────────────────────────────────────

const COMPLETION_STATUSES = ['passed', 'failed', 'skipped'] as const
type CompletionStatus = typeof COMPLETION_STATUSES[number]

function isCompletionStatus(v: unknown): v is CompletionStatus {
  return typeof v === 'string' && (COMPLETION_STATUSES as readonly string[]).includes(v)
}

function isValidCompletion(c: unknown): c is Completion {
  if (typeof c !== 'object' || c === null) return false
  const obj = c as Record<string, unknown>
  return (
    typeof obj.resource_id === 'string' && obj.resource_id.length > 0 &&
    typeof obj.completed_at === 'string' && !isNaN(Date.parse(obj.completed_at)) &&
    isCompletionStatus(obj.status) &&
    (obj.score === undefined || typeof obj.score === 'number') &&
    (obj.score_max === undefined || typeof obj.score_max === 'number') &&
    (obj.ai_feedback === undefined || typeof obj.ai_feedback === 'string')
  )
}

function isValidDayUnlock(u: unknown): u is DayUnlock {
  if (typeof u !== 'object' || u === null) return false
  const obj = u as Record<string, unknown>
  if (
    typeof obj.week !== 'number' || !Number.isInteger(obj.week) ||
    typeof obj.day !== 'number' || !Number.isInteger(obj.day) ||
    typeof obj.unlocked_at !== 'string' || isNaN(Date.parse(obj.unlocked_at))
  ) return false
  // Range guard: prevent malicious large-integer injection
  if (obj.week < 1 || obj.week > 8) return false
  if (obj.day < 1 || obj.day > 7) return false
  return true
}

const QUIZ_QUESTION_TYPES = ['mcq', 'fill', 'short', 'feynman'] as const
type QuizQuestionType = typeof QUIZ_QUESTION_TYPES[number]

function isQuizQuestionType(v: unknown): v is QuizQuestionType {
  return typeof v === 'string' && (QUIZ_QUESTION_TYPES as readonly string[]).includes(v)
}

function isValidQuizResult(r: unknown): r is QuizResult {
  if (typeof r !== 'object' || r === null) return false
  const obj = r as Record<string, unknown>
  return (
    typeof obj.id === 'string' && obj.id.length > 0 &&
    typeof obj.question_id === 'string' && obj.question_id.length > 0 &&
    Array.isArray(obj.concept_ids) && obj.concept_ids.every((x: unknown) => typeof x === 'string') &&
    typeof obj.week === 'number' && Number.isInteger(obj.week) && obj.week >= 1 && obj.week <= 8 &&
    typeof obj.day === 'number' && Number.isInteger(obj.day) && obj.day >= 1 && obj.day <= 7 &&
    typeof obj.correct === 'boolean' &&
    typeof obj.student_answer === 'string' &&
    typeof obj.answered_at === 'string' && !isNaN(Date.parse(obj.answered_at)) &&
    (obj.question_type === undefined || isQuizQuestionType(obj.question_type))
  )
}

// ── ExportData ───────────────────────────────────────────────────────────────

export interface ExportData {
  version: 1 | 2
  exportedAt: string
  userId: string
  completions: Completion[]
  dayUnlocks: DayUnlock[]
  quiz_results?: QuizResult[]   // added in version 2; optional for forward compatibility
}

// ── exportProgress ───────────────────────────────────────────────────────────

export async function exportProgress(userId: string): Promise<ExportData> {
  const db = getDb()
  const [completions, dayUnlocks, quiz_results] = await Promise.all([
    db.completions.where('user_id').equals(userId).toArray(),
    db.day_unlocks.where('user_id').equals(userId).toArray(),
    db.quiz_results.where('user_id').equals(userId).toArray(),
  ])
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    userId,
    completions,
    dayUnlocks,
    quiz_results,
  }
}

// ── importProgress ───────────────────────────────────────────────────────────

export async function importProgress(userId: string, data: ExportData): Promise<void> {
  if (data.version !== 1 && data.version !== 2) throw new Error('不支持的数据版本')
  if (!Array.isArray(data.completions) || !Array.isArray(data.dayUnlocks)) {
    throw new Error('数据格式错误：completions 或 dayUnlocks 不是数组')
  }

  // Whitelist validation with real type guards — no `as any` needed below
  const validCompletions = data.completions.filter(isValidCompletion)
  const validUnlocks = data.dayUnlocks.filter(isValidDayUnlock)

  // quiz_results is optional (absent in version-1 exports)
  const rawQuizResults: unknown[] = Array.isArray(data.quiz_results) ? data.quiz_results : []
  const validQuizResults = rawQuizResults.filter(isValidQuizResult)

  const db = getDb()
  await db.transaction('rw', db.completions, db.day_unlocks, db.quiz_results, async () => {
    // Clear existing records for this user
    await db.completions.where('user_id').equals(userId).delete()
    await db.day_unlocks.where('user_id').equals(userId).delete()
    await db.quiz_results.where('user_id').equals(userId).delete()

    // Re-stamp user_id from the authenticated session — never trust the payload's user_id
    const completions: Completion[] = validCompletions.map(c => ({
      user_id: userId,
      resource_id: c.resource_id,
      status: c.status,
      score: c.score,
      score_max: c.score_max,
      ai_feedback: c.ai_feedback,
      completed_at: c.completed_at,
    }))

    const unlocks: DayUnlock[] = validUnlocks.map(u => ({
      user_id: userId,
      week: u.week,
      day: u.day,
      unlocked_at: u.unlocked_at,
    }))

    const quizResults: QuizResult[] = validQuizResults.map(r => ({
      id: `${userId}-${r.question_id}-${r.answered_at}`,
      user_id: userId,
      question_id: r.question_id,
      concept_ids: r.concept_ids,
      week: r.week,
      day: r.day,
      correct: r.correct,
      student_answer: r.student_answer,
      answered_at: r.answered_at,
      question_type: r.question_type,
    }))

    await db.completions.bulkPut(completions)
    await db.day_unlocks.bulkPut(unlocks)
    await db.quiz_results.bulkPut(quizResults)
  })
}

// ── downloadJson ─────────────────────────────────────────────────────────────

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Safari initiates downloads asynchronously; revoking immediately yields an
  // empty file. Delay revocation long enough for the browser to finish.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
