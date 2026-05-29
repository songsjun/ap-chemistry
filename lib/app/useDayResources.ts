'use client'

import { useEffect, useState } from 'react'
import { repo } from '@/lib/repository'
import { selectDailyQuestions } from '@/lib/app/quiz'
import { DAILY_CHALLENGE_QUESTION_COUNT } from '@/lib/constants'
import type { Resource, Completion, KnowledgePoint, FlowState, QuizResult } from '@/lib/types'

export type ChallengeStatus = 'prompt' | 'active' | 'done' | 'skipped'

export interface DayResourcesState {
  resources: Resource[]
  completions: Map<string, Completion>
  kpMap: Map<string, KnowledgePoint>
  loading: boolean
  challengeStatus: ChallengeStatus
  challengeResults: QuizResult[]
  availableQuestions: number
  quizChecked: boolean
  setChallengeStatus: (s: ChallengeStatus) => void
  onChallengeComplete: (results: QuizResult[]) => void
}

export function useDayResources(
  userId: string,
  week: number,
  day: number,
  flowState: FlowState,
): DayResourcesState {
  const [resources, setResources] = useState<Resource[]>([])
  const [completions, setCompletions] = useState<Map<string, Completion>>(new Map())
  const [kpMap, setKpMap] = useState<Map<string, KnowledgePoint>>(new Map())
  const [loading, setLoading] = useState(true)

  const [challengeStatus, setChallengeStatus] = useState<ChallengeStatus>('prompt')
  const [challengeResults, setChallengeResults] = useState<QuizResult[]>([])
  const [availableQuestions, setAvailableQuestions] = useState(0)
  const [quizChecked, setQuizChecked] = useState(false)

  // One-time load: resources, kpMap, quiz status
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!userId) return
      const allRes = await repo.getAllDayResources(week, day)
      if (cancelled) return
      const conceptIds = [...new Set(allRes.flatMap(r => r.concepts))]
      const kps = await repo.getKnowledgePoints(conceptIds)
      if (cancelled) return
      const newKpMap = new Map<string, KnowledgePoint>()
      kps.forEach(kp => { newKpMap.set(kp.id, kp) })
      setResources(allRes)
      setKpMap(newKpMap)
      setLoading(false)

      const existingResults = await repo.getQuizResultsForDay(userId, week, day)
      if (cancelled) return
      if (existingResults.length > 0) {
        setChallengeStatus('done')
        setChallengeResults(existingResults)
      } else {
        const questions = await selectDailyQuestions(userId, week, day, conceptIds, DAILY_CHALLENGE_QUESTION_COUNT)
        if (!cancelled) {
          setAvailableQuestions(questions.length)
          setQuizChecked(true)
        }
      }
    }
    // Use finally so setLoading(false) is always called, even on error.
    // Without this, a Dexie failure would leave the skeleton visible forever.
    load()
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [week, day, userId])

  // Refresh completions after every dispatch (flowState is a new object on each execute(),
  // even when phase stays the same — e.g. completing a B/C tier resource during COMPLETE phase).
  // userId must be in deps: if the active user changes the completions must reload immediately.
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!userId) return
      const dayCompletions = await repo.getCompletions(userId, week, day)
      if (cancelled) return
      setCompletions(new Map(dayCompletions.map(c => [c.resource_id, c])))
    }
    refresh().catch(console.error)
    return () => { cancelled = true }
  }, [week, day, userId, flowState])

  const onChallengeComplete = (results: QuizResult[]) => {
    setChallengeResults(results)
    setChallengeStatus('done')
  }

  return {
    resources,
    completions,
    kpMap,
    loading,
    challengeStatus,
    challengeResults,
    availableQuestions,
    quizChecked,
    setChallengeStatus,
    onChallengeComplete,
  }
}
