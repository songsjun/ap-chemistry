import { getDb } from '@/lib/infra/db'
import { QUIZ_BANK_VERSION } from '@/lib/constants'
import type { QuizQuestion } from '@/lib/types'

// ── Type guard ───────────────────────────────────────────────────────────────

const QUIZ_QUESTION_TYPES = ['mcq', 'fill', 'short', 'feynman'] as const
const QUIZ_DIFFICULTIES = [1, 2, 3] as const

function isValidQuizQuestion(q: unknown): q is QuizQuestion {
  if (typeof q !== 'object' || q === null) return false
  const obj = q as Record<string, unknown>

  // Required string fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) return false
  if (typeof obj.question !== 'string' || obj.question.length === 0) return false
  if (typeof obj.answer !== 'string') return false

  // type must be one of the four allowed values
  if (!(QUIZ_QUESTION_TYPES as readonly unknown[]).includes(obj.type)) return false

  // difficulty must be 1 | 2 | 3
  if (!(QUIZ_DIFFICULTIES as readonly unknown[]).includes(obj.difficulty)) return false

  // concept_ids must be a string array
  if (!Array.isArray(obj.concept_ids)) return false
  if (!obj.concept_ids.every((x: unknown) => typeof x === 'string')) return false

  // week must be a positive integer (no upper-bound cap — bank may span any week)
  if (typeof obj.week !== 'number' || !Number.isInteger(obj.week) || obj.week < 1) return false

  // options: required for mcq, must be exactly [A, B, C, D] strings; allowed to be absent for other types
  if (obj.type === 'mcq') {
    if (
      !Array.isArray(obj.options) ||
      obj.options.length !== 4 ||
      !obj.options.every((x: unknown) => typeof x === 'string' && x.length > 0)
    ) return false
  }

  // grading_rubric and explanation are expected strings but tolerate absence for forward-compat
  if (obj.grading_rubric !== undefined && typeof obj.grading_rubric !== 'string') return false
  if (obj.explanation !== undefined && typeof obj.explanation !== 'string') return false

  return true
}

// ── Seed ─────────────────────────────────────────────────────────────────────

export async function seedQuizBank(): Promise<void> {
  const db = getDb()
  const meta = await db.meta.get('quiz_bank_version')
  if (meta?.value === QUIZ_BANK_VERSION) return

  const res = await fetch('/quiz-bank.json')
  if (!res.ok) {
    console.warn('quiz-bank.json not found, skipping quiz seed')
    return
  }

  const raw: unknown[] = await res.json()
  const questions = raw.filter(isValidQuizQuestion)

  if (questions.length === 0) {
    console.warn('quiz-bank.json 未通过 schema 验证，跳过写入')
    return
  }
  if (questions.length < raw.length) {
    console.warn(`quiz-bank.json: ${raw.length - questions.length} 道题未通过验证，已跳过`)
  }

  await db.transaction('rw', db.quiz_questions, db.meta, async () => {
    // Clear before inserting so retired questions don't persist across version bumps
    await db.quiz_questions.clear()
    await db.quiz_questions.bulkPut(questions)
    await db.meta.put({ key: 'quiz_bank_version', value: QUIZ_BANK_VERSION })
  })
}
