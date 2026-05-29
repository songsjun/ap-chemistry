'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { DaySessionManager } from '@/lib/app/session'
import { DaySkeleton } from '@/components/DaySkeleton'
import type { FlowState, Command, DailyFeedback } from '@/lib/types'

interface DayContextValue {
  userId: string
  flowState: FlowState
  dispatch: (cmd: Command) => Promise<void>
  feedback: DailyFeedback | null
}

const DayContext = createContext<DayContextValue | null>(null)

interface DayProviderProps {
  userId: string
  week: number
  day: number
  children: React.ReactNode
}

export function DayProvider({ userId, week, day, children }: DayProviderProps) {
  const sessionRef = useRef<DaySessionManager | null>(null)
  if (sessionRef.current === null) {
    sessionRef.current = new DaySessionManager()
  }

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [flowState, setFlow] = useState<FlowState>({ phase: 'LOCKED' })
  const [feedback, setFeedback] = useState<DailyFeedback | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    sessionRef.current!
      .load(userId, week, day)
      .then(flowState => { if (!cancelled) setFlow(flowState) })
      .catch(err => { console.error(err); if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, week, day])

  const inFlight = useRef(false)
  // Pending commands are queued here so rapid dispatches (e.g., completing two
  // B resources in quick succession during REMEDIATION) are serialized rather
  // than silently dropped. The previous pattern of `if (inFlight) return` caused
  // the second completion to never be written to IndexedDB.
  const cmdQueue = useRef<Command[]>([])
  const feedbackInFlight = useRef(false)
  const feedbackAbortRef = useRef<AbortController | null>(null)

  // Reset feedback state when the user navigates to a different day
  useEffect(() => {
    setFeedback(null)
    feedbackInFlight.current = false
    feedbackAbortRef.current?.abort()
    feedbackAbortRef.current = null
    // Clear any pending commands so stale day-N commands don't execute against
    // day-(N+1). We intentionally do NOT reset inFlight here: if drainQueue is
    // mid-execute(), letting it finish naturally avoids a second concurrent drainer
    // starting (the session's execGen/advGen guards protect snapshot integrity anyway).
    cmdQueue.current = []
  }, [userId, week, day])

  // Clear feedback whenever the day is no longer COMPLETE (e.g. after
  // RESET_FAILED_RESOURCES brings the user back to PRESENTING). Without
  // this, the old feedback from the first completion would persist into
  // the retry session and the DayListView feedbackRequestedRef would
  // never re-arm, leaving the feedback spinner hanging indefinitely.
  useEffect(() => {
    if (flowState.phase !== 'COMPLETE') {
      setFeedback(null)
      feedbackInFlight.current = false
      feedbackAbortRef.current?.abort()
      feedbackAbortRef.current = null
    }
  }, [flowState.phase])

  // Serial drainer for non-feedback commands. Processes one command at a time;
  // if a second command arrives while the first is in flight it was already pushed
  // onto cmdQueue and will be picked up by the while loop — no command is dropped.
  const drainQueue = useCallback(async () => {
    // Only one drainer runs at a time. Concurrent dispatch() calls that find
    // inFlight=true push onto the queue and return; the running drainer picks them up.
    if (inFlight.current) return
    inFlight.current = true
    while (cmdQueue.current.length > 0) {
      const cmd = cmdQueue.current.shift()!
      try {
        let next: FlowState
        if (cmd.type === 'FORCE_ADVANCE') {
          next = await sessionRef.current!.forceAdvance()
        } else {
          next = await sessionRef.current!.execute(cmd)
        }
        setFlow(next)
      } catch (err) {
        console.error(`${cmd.type} failed:`, err)
      }
    }
    inFlight.current = false
  }, [])

  const dispatch = useCallback(async (cmd: Command) => {
    if (cmd.type === 'REQUEST_FEEDBACK') {
      // Also gate on inFlight: getDayStats reads the DB concurrently with
      // execute()'s transact() write, which can produce partially-committed stats.
      if (feedbackInFlight.current || inFlight.current) return
      feedbackInFlight.current = true
      const ac = new AbortController()
      feedbackAbortRef.current = ac
      try {
        const fb = await sessionRef.current!.requestFeedback(ac.signal)
        setFeedback(fb)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Navigation cancelled this request — not an error worth logging
          return
        }
        console.error('REQUEST_FEEDBACK failed:', err)
      } finally {
        feedbackInFlight.current = false
        feedbackAbortRef.current = null
      }
      return
    }
    // Non-feedback commands are queued for serial execution.
    // We do NOT block when feedbackInFlight is true: requestFeedback() reads
    // only A-resource completions. By the time phase is COMPLETE all A resources
    // are in a final state — no further A writes can occur. Blocking B/C completions
    // or FORCE_ADVANCE while feedback loads would silently discard student interactions.
    cmdQueue.current.push(cmd)
    await drainQueue()
  }, [drainQueue])

  if (loading) return <DaySkeleton />

  if (loadError) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center px-4">
        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="font-semibold text-stone-800 text-sm">加载失败</p>
          <p className="text-xs text-stone-500">数据库访问出错，请刷新后重试</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }

  return (
    <DayContext.Provider value={{ userId, flowState, dispatch, feedback }}>
      {children}
    </DayContext.Provider>
  )
}

export function useDayContext(): DayContextValue {
  const ctx = useContext(DayContext)
  if (!ctx) throw new Error('useDayContext must be used within DayProvider')
  return ctx
}

