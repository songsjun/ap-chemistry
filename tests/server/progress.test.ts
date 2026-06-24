// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.hoisted(() => vi.fn())
const transactionMock = vi.hoisted(() => vi.fn())
const clientQueryMock = vi.hoisted(() => vi.fn())
const ensureSchemaMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/server/db', () => ({
  query: queryMock,
  transaction: transactionMock,
}))

vi.mock('@/lib/server/schema', () => ({
  ensureSchema: ensureSchemaMock,
}))

import {
  listQuizResults,
  saveCompletionForUser,
  saveQuizResultForUser,
} from '@/lib/server/progress'

interface CompletionRow {
  user_id: string
  resource_id: string
  status: 'passed' | 'failed' | 'skipped'
  score: number | null
  score_max: number | null
  ai_feedback: string | null
  completed_at: string
}

interface QuizRow {
  id: string
  user_id: string
  question_id: string
  concept_ids: string[]
  week: number
  day: number
  correct: boolean
  student_answer: string
  answered_at: string
  question_type: 'mcq' | 'fill' | 'short' | 'feynman' | null
  difficulty: 1 | 2 | 3 | null
}

const completions = new Map<string, CompletionRow>()
const completionEvents: CompletionRow[] = []
const quizResults = new Map<string, QuizRow>()
const quizAttempts: QuizRow[] = []

function completionKey(userId: string, resourceId: string): string {
  return `${userId}:${resourceId}`
}

function quizKey(userId: string, questionId: string): string {
  return `${userId}:${questionId}`
}

beforeEach(() => {
  vi.clearAllMocks()
  completions.clear()
  completionEvents.length = 0
  quizResults.clear()
  quizAttempts.length = 0
  ensureSchemaMock.mockResolvedValue(undefined)
  transactionMock.mockImplementation(async fn => fn({ query: clientQueryMock }))
  clientQueryMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO completion_events')) {
      completionEvents.push({
        user_id: values[0] as string,
        resource_id: values[1] as string,
        status: values[2] as CompletionRow['status'],
        score: values[3] as number | null,
        score_max: values[4] as number | null,
        ai_feedback: values[5] as string | null,
        completed_at: values[6] as string,
      })
      return { rows: [] }
    }

    if (sql.includes('INSERT INTO completions')) {
      const row: CompletionRow = {
        user_id: values[0] as string,
        resource_id: values[1] as string,
        status: values[2] as CompletionRow['status'],
        score: values[3] as number | null,
        score_max: values[4] as number | null,
        ai_feedback: values[5] as string | null,
        completed_at: values[6] as string,
      }
      const key = completionKey(row.user_id, row.resource_id)
      const current = completions.get(key)
      if (!current || Date.parse(row.completed_at) >= Date.parse(current.completed_at)) {
        completions.set(key, row)
        return { rows: [row] }
      }
      return { rows: [] }
    }

    if (sql.includes('FROM completions')) {
      return { rows: [completions.get(completionKey(values[0] as string, values[1] as string))].filter(Boolean) }
    }

    if (sql.includes('INSERT INTO quiz_result_attempts')) {
      quizAttempts.push({
        id: values[0] as string,
        user_id: values[1] as string,
        question_id: values[2] as string,
        concept_ids: values[3] as string[],
        week: values[4] as number,
        day: values[5] as number,
        correct: values[6] as boolean,
        student_answer: values[7] as string,
        answered_at: values[8] as string,
        question_type: values[9] as QuizRow['question_type'],
        difficulty: values[10] as QuizRow['difficulty'],
      })
      return { rows: [] }
    }

    if (sql.includes('INSERT INTO quiz_results')) {
      const row: QuizRow = {
        id: values[0] as string,
        user_id: values[1] as string,
        question_id: values[2] as string,
        concept_ids: values[3] as string[],
        week: values[4] as number,
        day: values[5] as number,
        correct: values[6] as boolean,
        student_answer: values[7] as string,
        answered_at: values[8] as string,
        question_type: values[9] as QuizRow['question_type'],
        difficulty: values[10] as QuizRow['difficulty'],
      }
      quizResults.set(quizKey(row.user_id, row.question_id), row)
      return { rows: [row] }
    }

    throw new Error(`Unexpected client query: ${sql}`)
  })

  queryMock.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM quiz_result_attempts')) {
      return quizAttempts
        .filter(row => row.user_id === values[0])
        .filter(row => values.length < 3 || (row.week === values[1] && row.day === values[2]))
        .sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at))
    }
    if (sql.includes('FROM quiz_results')) {
      return Array.from(quizResults.values())
        .filter(row => row.user_id === values[0])
        .filter(row => values.length < 3 || (row.week === values[1] && row.day === values[2]))
        .sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at))
    }
    throw new Error(`Unexpected query: ${sql}`)
  })
})

describe('server progress persistence', () => {
  it('keeps quiz result ids scoped by the authenticated student', async () => {
    const input = {
      id: 'client-controlled-id',
      user_id: 'ignored-client-user',
      question_id: 'q1',
      concept_ids: ['kp1'],
      week: 1,
      day: 1,
      correct: true,
      student_answer: 'A',
      answered_at: '2026-01-01T00:00:00.000Z',
      question_type: 'mcq' as const,
      difficulty: 1 as const,
    }

    await saveQuizResultForUser('student-a', input)
    await saveQuizResultForUser('student-b', { ...input, correct: false, student_answer: 'B' })

    await expect(listQuizResults('student-a')).resolves.toMatchObject([
      { id: 'student-a-q1-2026-01-01T00:00:00.000Z', user_id: 'student-a', correct: true, student_answer: 'A' },
    ])
    await expect(listQuizResults('student-b')).resolves.toMatchObject([
      { id: 'student-b-q1-2026-01-01T00:00:00.000Z', user_id: 'student-b', correct: false, student_answer: 'B' },
    ])
    expect(quizAttempts).toHaveLength(2)
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT (user_id, question_id)'))).toBe(true)
  })

  it('appends completion events while keeping the latest projection', async () => {
    const newer = await saveCompletionForUser('student-a', {
      resource_id: 'resource-1',
      status: 'failed',
      completed_at: '2026-01-02T00:00:00.000Z',
    })
    const older = await saveCompletionForUser('student-a', {
      resource_id: 'resource-1',
      status: 'passed',
      completed_at: '2026-01-01T00:00:00.000Z',
    })

    expect(newer).toMatchObject({ resource_id: 'resource-1', status: 'failed' })
    expect(older).toMatchObject({ resource_id: 'resource-1', status: 'failed' })
    expect(completionEvents.map(event => event.status)).toEqual(['failed', 'passed'])
    expect(completions.get(completionKey('student-a', 'resource-1'))?.status).toBe('failed')
  })
})
