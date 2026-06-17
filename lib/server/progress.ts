import type { PoolClient } from 'pg'

import type { Completion, FRQCompletion, QuizResult } from '@/lib/types'

import { query, transaction } from './db'
import { ensureSchema } from './schema'

export interface DayUnlockRecord {
  user_id: string
  week: number
  day: number
  unlocked_at: string
}

interface CompletionRow {
  user_id: string
  resource_id: string
  status: Completion['status']
  score: number | null
  score_max: number | null
  ai_feedback: string | null
  completed_at: string | Date
}

interface DayUnlockRow {
  user_id: string
  week: number
  day: number
  unlocked_at: string | Date
}

interface QuizResultRow {
  id: string
  user_id: string
  question_id: string
  concept_ids: string[]
  week: number
  day: number
  correct: boolean
  student_answer: string
  answered_at: string | Date
  question_type: QuizResult['question_type'] | null
  difficulty: QuizResult['difficulty'] | null
}

interface FRQCompletionRow {
  user_id: string
  frq_id: string
  week: number
  day: number
  score: number
  score_max: number
  completed_at: string | Date
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isQuizQuestionType(value: unknown): value is NonNullable<QuizResult['question_type']> {
  return value === 'mcq' || value === 'fill' || value === 'short' || value === 'feynman'
}

function isQuizDifficulty(value: unknown): value is NonNullable<QuizResult['difficulty']> {
  return value === 1 || value === 2 || value === 3
}

function completionFromRow(row: CompletionRow): Completion {
  return {
    user_id: row.user_id,
    resource_id: row.resource_id,
    status: row.status,
    score: row.score ?? undefined,
    score_max: row.score_max ?? undefined,
    ai_feedback: row.ai_feedback ?? undefined,
    completed_at: iso(row.completed_at),
  }
}

function dayUnlockFromRow(row: DayUnlockRow): DayUnlockRecord {
  return {
    user_id: row.user_id,
    week: row.week,
    day: row.day,
    unlocked_at: iso(row.unlocked_at),
  }
}

function quizResultFromRow(row: QuizResultRow): QuizResult {
  return {
    id: row.id,
    user_id: row.user_id,
    question_id: row.question_id,
    concept_ids: row.concept_ids,
    week: row.week,
    day: row.day,
    correct: row.correct,
    student_answer: row.student_answer,
    answered_at: iso(row.answered_at),
    question_type: row.question_type ?? undefined,
    difficulty: row.difficulty ?? undefined,
  }
}

function frqCompletionFromRow(row: FRQCompletionRow): FRQCompletion {
  return {
    user_id: row.user_id,
    frq_id: row.frq_id,
    week: row.week,
    day: row.day,
    score: row.score,
    score_max: row.score_max,
    completed_at: iso(row.completed_at),
  }
}

export async function listCompletions(userId: string, resourceIds?: string[]): Promise<Completion[]> {
  await ensureSchema()
  const rows = resourceIds?.length
    ? await query<CompletionRow>(
        `SELECT user_id, resource_id, status, score, score_max, ai_feedback, completed_at
         FROM completions
         WHERE user_id = $1 AND resource_id = ANY($2::text[])
         ORDER BY completed_at`,
        [userId, resourceIds],
      )
    : await query<CompletionRow>(
        `SELECT user_id, resource_id, status, score, score_max, ai_feedback, completed_at
         FROM completions
         WHERE user_id = $1
         ORDER BY completed_at`,
        [userId],
      )
  return rows.map(completionFromRow)
}

export async function saveCompletionForUser(userId: string, input: unknown): Promise<Completion> {
  await ensureSchema()
  return transaction(client => saveCompletionWithClient(client, userId, input))
}

async function saveCompletionWithClient(client: PoolClient, userId: string, input: unknown): Promise<Completion> {
  if (!input || typeof input !== 'object') throw new Error('bad_completion')
  const record = input as Partial<Completion>
  if (!record.resource_id || typeof record.resource_id !== 'string') throw new Error('bad_resource_id')
  if (record.status !== 'passed' && record.status !== 'failed' && record.status !== 'skipped') {
    throw new Error('bad_status')
  }
  if (!record.completed_at || Number.isNaN(Date.parse(record.completed_at))) throw new Error('bad_completed_at')

  const values = [
    userId,
    record.resource_id,
    record.status,
    numberOrUndefined(record.score) ?? null,
    numberOrUndefined(record.score_max) ?? null,
    typeof record.ai_feedback === 'string' ? record.ai_feedback : null,
    record.completed_at,
  ]

  await client.query(
    `INSERT INTO completion_events (user_id, resource_id, status, score, score_max, ai_feedback, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    values,
  )

  const saved = await client.query<CompletionRow>(
    `INSERT INTO completions (user_id, resource_id, status, score, score_max, ai_feedback, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, resource_id) DO UPDATE SET
       status = EXCLUDED.status,
       score = EXCLUDED.score,
       score_max = EXCLUDED.score_max,
       ai_feedback = EXCLUDED.ai_feedback,
       completed_at = EXCLUDED.completed_at,
       updated_at = now()
     WHERE EXCLUDED.completed_at >= completions.completed_at
     RETURNING user_id, resource_id, status, score, score_max, ai_feedback, completed_at`,
    values,
  )
  if (saved.rows[0]) return completionFromRow(saved.rows[0])

  const existing = await client.query<CompletionRow>(
    `SELECT user_id, resource_id, status, score, score_max, ai_feedback, completed_at
     FROM completions
     WHERE user_id = $1 AND resource_id = $2`,
    [userId, record.resource_id],
  )
  if (!existing.rows[0]) throw new Error('completion_not_saved')
  return completionFromRow(existing.rows[0])
}

export async function listDayUnlocks(userId: string): Promise<DayUnlockRecord[]> {
  await ensureSchema()
  const rows = await query<DayUnlockRow>(
    `SELECT user_id, week, day, unlocked_at
     FROM day_unlocks
     WHERE user_id = $1
     ORDER BY week, day`,
    [userId],
  )
  return rows.map(dayUnlockFromRow)
}

export async function unlockDayForUser(userId: string, input: unknown): Promise<DayUnlockRecord> {
  await ensureSchema()
  return transaction(client => unlockDayWithClient(client, userId, input))
}

async function unlockDayWithClient(client: PoolClient, userId: string, input: unknown): Promise<DayUnlockRecord> {
  if (!input || typeof input !== 'object') throw new Error('bad_unlock')
  const record = input as { week?: unknown; day?: unknown; unlocked_at?: unknown }
  if (!Number.isInteger(record.week) || !Number.isInteger(record.day)) throw new Error('bad_day')
  const unlockedAt = typeof record.unlocked_at === 'string' && !Number.isNaN(Date.parse(record.unlocked_at))
    ? record.unlocked_at
    : new Date().toISOString()

  const result = await client.query<DayUnlockRow>(
    `INSERT INTO day_unlocks (user_id, week, day, unlocked_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, week, day) DO UPDATE SET
       unlocked_at = LEAST(day_unlocks.unlocked_at, EXCLUDED.unlocked_at)
     RETURNING user_id, week, day, unlocked_at`,
    [userId, record.week, record.day, unlockedAt],
  )
  return dayUnlockFromRow(result.rows[0])
}

export async function listQuizResults(userId: string, week?: number, day?: number): Promise<QuizResult[]> {
  await ensureSchema()
  const rows = Number.isInteger(week) && Number.isInteger(day)
    ? await query<QuizResultRow>(
        `SELECT result_id AS id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty
         FROM quiz_result_attempts
         WHERE user_id = $1 AND week = $2 AND day = $3
         ORDER BY answered_at, attempt_id`,
        [userId, week, day],
      )
    : await query<QuizResultRow>(
        `SELECT result_id AS id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty
         FROM quiz_result_attempts
         WHERE user_id = $1
         ORDER BY answered_at, attempt_id`,
        [userId],
      )
  return rows.map(quizResultFromRow)
}

export async function saveQuizResultForUser(userId: string, input: unknown): Promise<QuizResult> {
  await ensureSchema()
  return transaction(client => saveQuizResultWithClient(client, userId, input))
}

async function saveQuizResultWithClient(client: PoolClient, userId: string, input: unknown): Promise<QuizResult> {
  if (!input || typeof input !== 'object') throw new Error('bad_quiz_result')
  const record = input as Partial<QuizResult>
  if (!record.question_id || typeof record.question_id !== 'string') throw new Error('bad_question_id')
  if (!Array.isArray(record.concept_ids) || !record.concept_ids.every(id => typeof id === 'string')) {
    throw new Error('bad_concept_ids')
  }
  if (!Number.isInteger(record.week) || !Number.isInteger(record.day)) throw new Error('bad_day')
  if (typeof record.correct !== 'boolean') throw new Error('bad_correct')
  if (typeof record.student_answer !== 'string') throw new Error('bad_student_answer')
  if (!record.answered_at || Number.isNaN(Date.parse(record.answered_at))) throw new Error('bad_answered_at')
  if (record.question_type !== undefined && !isQuizQuestionType(record.question_type)) throw new Error('bad_question_type')
  if (record.difficulty !== undefined && !isQuizDifficulty(record.difficulty)) throw new Error('bad_difficulty')

  const answeredAt = new Date(record.answered_at).toISOString()
  const resultId = `${userId}-${record.question_id}-${answeredAt}`
  const values = [
    resultId,
    userId,
    record.question_id,
    record.concept_ids,
    record.week,
    record.day,
    record.correct,
    record.student_answer,
    answeredAt,
    record.question_type ?? null,
    record.difficulty ?? null,
  ]

  await client.query(
    `INSERT INTO quiz_result_attempts
       (result_id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty)
     VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, $11)`,
    values,
  )

  const saved = await client.query<QuizResultRow>(
    `INSERT INTO quiz_results
       (id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty)
     VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, question_id) DO UPDATE SET
       id = EXCLUDED.id,
       concept_ids = EXCLUDED.concept_ids,
       week = EXCLUDED.week,
       day = EXCLUDED.day,
       correct = EXCLUDED.correct,
       student_answer = EXCLUDED.student_answer,
       answered_at = EXCLUDED.answered_at,
       question_type = EXCLUDED.question_type,
       difficulty = EXCLUDED.difficulty,
       updated_at = now()
     WHERE quiz_results.answered_at <= EXCLUDED.answered_at
     RETURNING id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty`,
    values,
  )
  if (saved.rows[0]) return quizResultFromRow(saved.rows[0])

  const current = await client.query<QuizResultRow>(
    `SELECT id, user_id, question_id, concept_ids, week, day, correct, student_answer, answered_at, question_type, difficulty
     FROM quiz_results
     WHERE user_id = $1 AND question_id = $2`,
    [userId, record.question_id],
  )
  if (!current.rows[0]) throw new Error('quiz_result_not_saved')
  return quizResultFromRow(current.rows[0])
}

export async function commitProgressForUser(
  userId: string,
  input: unknown,
): Promise<{
  completions: Completion[]
  dayUnlocks: DayUnlockRecord[]
  quizResults: QuizResult[]
  frqCompletions: FRQCompletion[]
}> {
  await ensureSchema()
  if (!input || typeof input !== 'object') throw new Error('bad_commit')
  const body = input as { completions?: unknown; dayUnlocks?: unknown; quizResults?: unknown; frqCompletions?: unknown }
  const completions = body.completions === undefined ? [] : body.completions
  const dayUnlocks = body.dayUnlocks === undefined ? [] : body.dayUnlocks
  const quizResults = body.quizResults === undefined ? [] : body.quizResults
  const frqCompletions = body.frqCompletions === undefined ? [] : body.frqCompletions
  if (
    !Array.isArray(completions) ||
    !Array.isArray(dayUnlocks) ||
    !Array.isArray(quizResults) ||
    !Array.isArray(frqCompletions)
  ) {
    throw new Error('bad_commit')
  }

  return transaction(async client => {
    const savedCompletions: Completion[] = []
    const savedUnlocks: DayUnlockRecord[] = []
    const savedQuizResults: QuizResult[] = []
    const savedFRQCompletions: FRQCompletion[] = []

    for (const completion of completions) {
      savedCompletions.push(await saveCompletionWithClient(client, userId, completion))
    }
    for (const unlock of dayUnlocks) {
      savedUnlocks.push(await unlockDayWithClient(client, userId, unlock))
    }
    for (const quizResult of quizResults) {
      savedQuizResults.push(await saveQuizResultWithClient(client, userId, quizResult))
    }
    for (const frqCompletion of frqCompletions) {
      savedFRQCompletions.push(await saveFRQCompletionWithClient(client, userId, frqCompletion))
    }

    return {
      completions: savedCompletions,
      dayUnlocks: savedUnlocks,
      quizResults: savedQuizResults,
      frqCompletions: savedFRQCompletions,
    }
  })
}

export async function listFRQCompletions(userId: string, frqIds?: string[]): Promise<FRQCompletion[]> {
  await ensureSchema()
  const rows = frqIds?.length
    ? await query<FRQCompletionRow>(
        `SELECT user_id, frq_id, week, day, score, score_max, completed_at
         FROM frq_completions
         WHERE user_id = $1 AND frq_id = ANY($2::text[])
         ORDER BY completed_at`,
        [userId, frqIds],
      )
    : await query<FRQCompletionRow>(
        `SELECT user_id, frq_id, week, day, score, score_max, completed_at
         FROM frq_completions
         WHERE user_id = $1
         ORDER BY completed_at`,
        [userId],
      )
  return rows.map(frqCompletionFromRow)
}

export async function saveFRQCompletionForUser(userId: string, input: unknown): Promise<FRQCompletion> {
  await ensureSchema()
  return transaction(client => saveFRQCompletionWithClient(client, userId, input))
}

async function saveFRQCompletionWithClient(
  client: PoolClient,
  userId: string,
  input: unknown,
): Promise<FRQCompletion> {
  if (!input || typeof input !== 'object') throw new Error('bad_frq_completion')
  const record = input as Partial<FRQCompletion>
  if (!record.frq_id || typeof record.frq_id !== 'string') throw new Error('bad_frq_id')
  if (!Number.isInteger(record.week) || !Number.isInteger(record.day)) throw new Error('bad_day')
  if (!Number.isFinite(record.score) || !Number.isFinite(record.score_max)) throw new Error('bad_score')
  if (!record.completed_at || Number.isNaN(Date.parse(record.completed_at))) throw new Error('bad_completed_at')

  const result = await client.query<FRQCompletionRow>(
    `INSERT INTO frq_completions (user_id, frq_id, week, day, score, score_max, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, frq_id) DO UPDATE SET
       score = EXCLUDED.score,
       score_max = EXCLUDED.score_max,
       completed_at = EXCLUDED.completed_at,
       updated_at = now()
     RETURNING user_id, frq_id, week, day, score, score_max, completed_at`,
    [userId, record.frq_id, record.week, record.day, record.score, record.score_max, record.completed_at],
  )
  return frqCompletionFromRow(result.rows[0])
}
