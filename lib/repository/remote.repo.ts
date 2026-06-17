import type { Completion, FRQCompletion, QuizResult } from '@/lib/types'

import { DexieRepository } from './dexie.repo'

interface CompletionListResponse {
  completions: Completion[]
}

interface DayUnlockListResponse {
  dayUnlocks: Array<{ week: number; day: number; unlocked_at: string }>
}

interface QuizResultListResponse {
  quizResults: QuizResult[]
}

interface FRQCompletionListResponse {
  frqCompletions: FRQCompletion[]
}

interface CommitResponse {
  completions: Completion[]
  dayUnlocks: Array<{ week: number; day: number; unlocked_at: string }>
  quizResults: QuizResult[]
  frqCompletions: FRQCompletion[]
}

interface PendingTransaction {
  completions: Completion[]
  dayUnlocks: Array<{ week: number; day: number; unlocked_at: string }>
  quizResults: QuizResult[]
  frqCompletions: FRQCompletion[]
}

function csv(values: string[]): string {
  return values.map(encodeURIComponent).join(',')
}

function requestUrl(path: string): string {
  if (/^[a-z][a-z\d+\-.]*:/i.test(path)) return path
  if (typeof window !== 'undefined') return path
  return new URL(path, 'http://localhost').toString()
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(requestUrl(path), {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.reload()
    }
    throw new Error(`Request failed: ${response.status}`)
  }
  return await response.json() as T
}

export class RemoteProgressRepository extends DexieRepository {
  private pendingTransaction: PendingTransaction | null = null
  private transactionQueue: Promise<void> = Promise.resolve()

  private overlayPendingCompletions(completions: Completion[], resourceIds?: Set<string>): Completion[] {
    if (!this.pendingTransaction?.completions.length) return completions
    const byResourceId = new Map(completions.map(completion => [completion.resource_id, completion]))

    for (const completion of this.pendingTransaction.completions) {
      if (resourceIds && !resourceIds.has(completion.resource_id)) continue
      const existing = byResourceId.get(completion.resource_id)
      if (!existing || Date.parse(completion.completed_at) >= Date.parse(existing.completed_at)) {
        byResourceId.set(completion.resource_id, completion)
      }
    }

    return Array.from(byResourceId.values())
  }

  private overlayPendingUnlocks(days: Array<{ week: number; day: number }>): Array<{ week: number; day: number }> {
    if (!this.pendingTransaction?.dayUnlocks.length) return days
    const keys = new Set(days.map(day => `${day.week}:${day.day}`))
    const merged = [...days]

    for (const day of this.pendingTransaction.dayUnlocks) {
      const key = `${day.week}:${day.day}`
      if (!keys.has(key)) {
        keys.add(key)
        merged.push({ week: day.week, day: day.day })
      }
    }

    return merged
  }

  private overlayPendingQuizResults(results: QuizResult[], week?: number, day?: number): QuizResult[] {
    if (!this.pendingTransaction?.quizResults.length) return results
    const byId = new Map(results.map(result => [result.id, result]))

    for (const result of this.pendingTransaction.quizResults) {
      if (week !== undefined && day !== undefined && (result.week !== week || result.day !== day)) continue
      byId.set(result.id, result)
    }

    return Array.from(byId.values()).sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at))
  }

  private overlayPendingFRQCompletions(completions: FRQCompletion[], frqIds?: Set<string>): FRQCompletion[] {
    if (!this.pendingTransaction?.frqCompletions.length) return completions
    const byFrqId = new Map(completions.map(completion => [completion.frq_id, completion]))

    for (const completion of this.pendingTransaction.frqCompletions) {
      if (frqIds && !frqIds.has(completion.frq_id)) continue
      byFrqId.set(completion.frq_id, completion)
    }

    return Array.from(byFrqId.values())
  }

  async getCompletions(userId: string, week: number, day: number): Promise<Completion[]> {
    const resources = await super.getAllDayResources(week, day)
    return this.getCompletionsByResourceIds(userId, new Set(resources.map(r => r.id)))
  }

  async getAllUserCompletions(_userId: string): Promise<Completion[]> {
    const data = await requestJson<CompletionListResponse>('/api/progress/completions')
    return this.overlayPendingCompletions(data.completions)
  }

  async getCompletionsByResourceIds(_userId: string, resourceIds: Set<string>): Promise<Completion[]> {
    if (resourceIds.size === 0) return []
    const data = await requestJson<CompletionListResponse>(
      `/api/progress/completions?resourceIds=${csv(Array.from(resourceIds))}`,
    )
    return this.overlayPendingCompletions(data.completions, resourceIds)
  }

  async transact(fn: () => Promise<void>): Promise<void> {
    if (this.pendingTransaction) {
      await this.transactionQueue.catch(() => undefined)
    }

    const previous = this.transactionQueue.catch(() => undefined)
    let release = () => {}
    const lock = new Promise<void>(resolve => { release = resolve })
    this.transactionQueue = previous.then(() => lock)
    await previous

    const pending: PendingTransaction = { completions: [], dayUnlocks: [], quizResults: [], frqCompletions: [] }
    this.pendingTransaction = pending
    try {
      await fn()
      this.pendingTransaction = null
      if (
        pending.completions.length > 0 ||
        pending.dayUnlocks.length > 0 ||
        pending.quizResults.length > 0 ||
        pending.frqCompletions.length > 0
      ) {
        await requestJson<CommitResponse>('/api/progress/commit', {
          method: 'POST',
          body: JSON.stringify(pending),
        })
      }
    } finally {
      this.pendingTransaction = null
      release()
    }
  }

  async saveCompletion(completion: Completion): Promise<void> {
    if (this.pendingTransaction) {
      this.pendingTransaction.completions.push(completion)
      return
    }
    await requestJson('/api/progress/completions', {
      method: 'PUT',
      body: JSON.stringify(completion),
    })
  }

  async isDayUnlocked(userId: string, week: number, day: number): Promise<boolean> {
    const unlocked = await this.getUnlockedDays(userId)
    return unlocked.some(record => record.week === week && record.day === day)
  }

  async unlockDay(_userId: string, week: number, day: number): Promise<void> {
    if (this.pendingTransaction) {
      this.pendingTransaction.dayUnlocks.push({ week, day, unlocked_at: new Date().toISOString() })
      return
    }
    await requestJson('/api/progress/day-unlocks', {
      method: 'PUT',
      body: JSON.stringify({ week, day, unlocked_at: new Date().toISOString() }),
    })
  }

  async getUnlockedDays(_userId: string): Promise<Array<{ week: number; day: number }>> {
    const data = await requestJson<DayUnlockListResponse>('/api/progress/day-unlocks')
    return this.overlayPendingUnlocks(data.dayUnlocks.map(record => ({ week: record.week, day: record.day })))
  }

  async saveQuizResult(result: QuizResult): Promise<void> {
    if (this.pendingTransaction) {
      this.pendingTransaction.quizResults.push(result)
      return
    }
    await requestJson('/api/progress/quiz-results', {
      method: 'PUT',
      body: JSON.stringify(result),
    })
  }

  async getQuizResultsForDay(_userId: string, week: number, day: number): Promise<QuizResult[]> {
    const data = await requestJson<QuizResultListResponse>(`/api/progress/quiz-results?week=${week}&day=${day}`)
    return this.overlayPendingQuizResults(data.quizResults, week, day)
  }

  async getAllQuizResultsForUser(_userId: string): Promise<QuizResult[]> {
    const data = await requestJson<QuizResultListResponse>('/api/progress/quiz-results')
    return this.overlayPendingQuizResults(data.quizResults)
  }

  async saveFRQCompletion(completion: FRQCompletion): Promise<void> {
    if (this.pendingTransaction) {
      this.pendingTransaction.frqCompletions.push(completion)
      return
    }
    await requestJson('/api/progress/frq-completions', {
      method: 'PUT',
      body: JSON.stringify(completion),
    })
  }

  async getFRQCompletions(_userId: string, frqIds: string[]): Promise<FRQCompletion[]> {
    if (frqIds.length === 0) return []
    const data = await requestJson<FRQCompletionListResponse>(
      `/api/progress/frq-completions?frqIds=${csv(frqIds)}`,
    )
    return this.overlayPendingFRQCompletions(data.frqCompletions, new Set(frqIds))
  }

  async getAllFRQCompletionsForUser(_userId: string): Promise<FRQCompletion[]> {
    const data = await requestJson<FRQCompletionListResponse>('/api/progress/frq-completions')
    return this.overlayPendingFRQCompletions(data.frqCompletions)
  }
}
