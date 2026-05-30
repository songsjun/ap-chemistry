'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDayContext } from '@/lib/app/session-context'
import { useDayResources } from '@/lib/app/useDayResources'
import type { Resource, KnowledgePoint, DailyFeedback } from '@/lib/types'
import { TierSection, RowSharedProps } from './ResourceRow'
import { RelatedFRQCard } from './RelatedFRQCard'
import { PASS_THRESHOLD, QUIZ_ESTIMATED_MINUTES } from '@/lib/constants'
import { ChallengePrompt } from './ChallengePrompt'
import { QuizPanel } from './QuizPanel'
import { DaySkeleton } from '@/components/DaySkeleton'

// ── CompleteBanner ────────────────────────────────────────────────────────────

function CompleteBanner({ passRate, feedback }: { passRate: number | null; feedback: DailyFeedback | null }) {
  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">今日完成</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {passRate !== null ? `通过率 ${Math.round(passRate * 100)}%  ·  ` : '已跳过关口  ·  '}
            下一天已解锁
          </p>
        </div>
      </div>
      {feedback ? (
        <div className="space-y-1.5 text-sm border-t border-emerald-200 dark:border-emerald-800 pt-3 pl-1">
          <p className="text-stone-700 dark:text-stone-300">💪 {feedback.strength}</p>
          {feedback.note && <p className="text-stone-600 dark:text-stone-400">📝 {feedback.note}</p>}
          {feedback.preview && <p className="text-stone-500 dark:text-stone-400">👀 明日：{feedback.preview}</p>}
        </div>
      ) : (
        <p className="text-xs text-emerald-500 pl-1 animate-pulse">正在获取 AI 学习反馈…</p>
      )}
    </div>
  )
}

// ── NeedsRetryBanner ─────────────────────────────────────────────────────────

function NeedsRetryBanner({
  passRate,
  retryCount,
  weakConceptNames,
  onForceAdvance,
  onResetFailed,
}: {
  passRate: number | null
  retryCount: number
  weakConceptNames: string[]
  onForceAdvance: () => void
  onResetFailed: () => void
}) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-orange-900 text-sm">需要重试</p>
          <p className="text-xs text-orange-600">
            当前通过率 {passRate !== null ? Math.round(passRate * 100) : 0}%  ·  目标 75%
          </p>
        </div>
      </div>
      {weakConceptNames.length > 0 ? (
        <p className="text-xs text-orange-700 pl-1">
          在以下知识点上遇到了困难，建议重新完成相关资源（标记为 ✕ 的题目）：
          <span className="font-medium"> {weakConceptNames.join('、')}</span>
        </p>
      ) : (
        <p className="text-xs text-orange-700 pl-1">
          请重新完成下方 A 层资源，提升答题质量后即可解锁下一天。
        </p>
      )}
      <button
        onClick={onResetFailed}
        className="mt-1 w-full py-2.5 px-3 text-sm font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors min-h-[44px]"
      >
        重新完成失败项目
      </button>
      {retryCount >= 2 && (
        <button
          onClick={onForceAdvance}
          className="py-2 px-1 text-sm text-stone-500 underline min-h-[44px]"
        >
          仍然继续（跳过当前关口，不计为通过）
        </button>
      )}
    </div>
  )
}

// ── DayListView ───────────────────────────────────────────────────────────────

export function DayListView({ week, day }: { week: number; day: number }) {
  const { userId, dispatch, flowState, feedback } = useDayContext()
  const {
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
  } = useDayResources(userId, week, day, flowState)

  // id of resource currently in score-input mode
  const [scoringId, setScoringId] = useState<string | null>(null)
  const feedbackRequestedRef = useRef(false)
  const [retryCount, setRetryCount] = useState(0)

  // Reset per-day state when navigating to a different day (same component instance via client routing)
  useEffect(() => {
    feedbackRequestedRef.current = false
  }, [week, day])

  // Also re-arm feedback when the phase leaves COMPLETE (e.g. after
  // RESET_FAILED_RESOURCES). Without this, the ref stays true and
  // REQUEST_FEEDBACK never fires on the subsequent completion.
  useEffect(() => {
    if (flowState.phase !== 'COMPLETE') {
      feedbackRequestedRef.current = false
    }
  }, [flowState.phase])

  useEffect(() => {
    if (flowState.phase === 'COMPLETE' && !feedbackRequestedRef.current) {
      feedbackRequestedRef.current = true
      dispatch({ type: 'REQUEST_FEEDBACK' }).catch((err) => {
        console.error(err)
        feedbackRequestedRef.current = false
      })
    }
  }, [flowState.phase, dispatch])

  // Track current phase in a ref so the cleanup below can distinguish StrictMode
  // double-invoke (phase unchanged) from a real phase transition away from NEEDS_RETRY.
  const phaseRef = useRef(flowState.phase)
  useLayoutEffect(() => {
    phaseRef.current = flowState.phase
  })

  // Increment per-day retry counter in localStorage when landing in NEEDS_RETRY.
  // On StrictMode double-invoke: cleanup sees phase still NEEDS_RETRY → restores counter.
  // On real transition out of NEEDS_RETRY: cleanup sees new phase → clears counter so
  // next visit to this day starts fresh (prevents "skip" button appearing immediately).
  useEffect(() => {
    if (flowState.phase !== 'NEEDS_RETRY') return
    const key = `needs_retry_${week}_${day}`
    const prev = parseInt(localStorage.getItem(key) ?? '0', 10)
    const next = prev + 1
    localStorage.setItem(key, String(next))
    setRetryCount(next)
    return () => {
      if (phaseRef.current === 'NEEDS_RETRY') {
        localStorage.setItem(key, String(prev))
      } else {
        localStorage.removeItem(key)
      }
    }
  }, [week, day, flowState.phase])

  // For non-graded resources: mark complete immediately
  const handleCheckDirect = useCallback(async (r: Resource) => {
    if (completions.get(r.id)?.status === 'passed') return
    await dispatch({ type: 'COMPLETE_RESOURCE', resourceId: r.id, result: { status: 'passed' } })
  }, [completions, dispatch])

  // For graded resources: open score panel
  const handleCheckGraded = useCallback((r: Resource) => {
    if (completions.get(r.id)?.status === 'passed') return
    setScoringId(r.id)
  }, [completions])

  const handleScoreSubmit = useCallback(async (r: Resource, score: number, scoreMax: number) => {
    setScoringId(null)
    const passed = score / scoreMax >= PASS_THRESHOLD
    await dispatch({
      type: 'COMPLETE_RESOURCE',
      resourceId: r.id,
      result: { status: passed ? 'passed' : 'failed', score, score_max: scoreMax },
    })
  }, [dispatch])

  const handleScoreCancel = useCallback(() => setScoringId(null), [])

  // All hooks must be called before any early return
  const aTier = resources.filter(r => r.tier === 'A')
  const aConceptIds = useMemo(
    () => [...new Set(aTier.flatMap(r => r.concepts))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resources],
  )
  const handleQuizExit = useCallback(() => setChallengeStatus('skipped'), [setChallengeStatus])

  if (loading) {
    return <DaySkeleton />
  }

  if (flowState.phase === 'LOCKED') {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-700 flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-stone-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <p className="text-stone-500 dark:text-stone-400 text-sm">完成上一天的必做任务后解锁</p>
      </div>
    )
  }
  const bTier = resources.filter(r => r.tier === 'B')

  const aPassed = aTier.filter(r => completions.get(r.id)?.status === 'passed').length
  // Use aTotal denominator — matches calcAttemptedPassRate used by the gate.
  // aPassed/aGraded would diverge after RESET_FAILED_RESOURCES (failed→skipped
  // drops aGraded), making the banner show 100% while the gate stays blocked.
  const passRate = aTier.length > 0 ? aPassed / aTier.length : null
  const aTotalMin = aTier.reduce((s, r) => s + r.estimated_minutes, 0)
  const hasAFailed = aTier.some(r => completions.get(r.id)?.status === 'failed')

  // Weak concepts: A-tier resources the student failed
  const weakConceptIds = new Set(
    aTier
      .filter(r => completions.get(r.id)?.status === 'failed')
      .flatMap(r => r.concepts)
  )

  // C-tier sorted by weakness: resources covering failed concepts come first
  const cTier = resources
    .filter(r => r.tier === 'C')
    .sort((a, b) => {
      const aCoversWeak = a.concepts.some(c => weakConceptIds.has(c)) ? 0 : 1
      const bCoversWeak = b.concepts.some(c => weakConceptIds.has(c)) ? 0 : 1
      return aCoversWeak - bCoversWeak || a.slot_order - b.slot_order
    })

  const aConcepts = aConceptIds
    .map(id => kpMap.get(id))
    .filter(Boolean) as KnowledgePoint[]

  const rowProps: RowSharedProps = { completions, kpMap, scoringId, onCheckDirect: handleCheckDirect, onCheckGraded: handleCheckGraded, onScoreSubmit: handleScoreSubmit, onScoreCancel: handleScoreCancel }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">

      {/* Complete banner */}
      {flowState.phase === 'COMPLETE' && (
        <CompleteBanner passRate={flowState.passRate} feedback={feedback} />
      )}

      {/* Needs-retry banner */}
      {flowState.phase === 'NEEDS_RETRY' && (
        <NeedsRetryBanner
          passRate={passRate}
          retryCount={retryCount}
          weakConceptNames={
            [...weakConceptIds]
              .map(id => kpMap.get(id)?.name_zh)
              .filter((n): n is string => Boolean(n))
          }
          onForceAdvance={() => dispatch({ type: 'FORCE_ADVANCE' })}
          onResetFailed={() => dispatch({ type: 'RESET_FAILED_RESOURCES' })}
        />
      )}

      {/* Challenge system */}
      {flowState.phase === 'COMPLETE' && challengeStatus === 'prompt' && availableQuestions > 0 && (
        <ChallengePrompt
          week={week}
          day={day}
          questionCount={availableQuestions}
          onStart={() => setChallengeStatus('active')}
          onSkip={() => setChallengeStatus('skipped')}
        />
      )}

      {flowState.phase === 'COMPLETE' && challengeStatus === 'active' && (
        <QuizPanel
          userId={userId}
          week={week}
          day={day}
          conceptIds={aConceptIds}
          onComplete={onChallengeComplete}
          onExit={handleQuizExit}
        />
      )}

      {flowState.phase === 'COMPLETE' && challengeStatus === 'done' && challengeResults.length > 0 && (
        <div className="bg-white border border-stone-100 rounded-xl px-4 py-3">
          <p className="text-xs text-stone-500">
            ⚡ 今日挑战：{challengeResults.filter(r => r.correct).length} / {challengeResults.length} 正确
          </p>
        </div>
      )}

      {flowState.phase === 'COMPLETE' && challengeStatus === 'prompt' && quizChecked && availableQuestions === 0 && (
        <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
          <p className="text-xs text-stone-400">⚡ 本日相关题目已全部完成，继续学习新内容以解锁更多题目。</p>
        </div>
      )}

      {/* Alberta course legend */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-stone-400 dark:text-stone-500 px-1">
        <span>Alberta 对应课程：</span>
        <span className="inline-flex items-center gap-1">
          <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-px rounded font-medium">AB 化学 20-1</span>
          <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 px-1.5 py-px rounded font-medium">AB 化学 30-1</span>
          <span className="bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500 px-1.5 py-px rounded font-medium">AP 专属</span>
        </span>
        <span>· 点击各资源「详情」查看</span>
      </div>

      {/* A 必做 */}
      {aTier.length > 0 ? (
        <TierSection
          tier="A"
          label="必做"
          accentCls="text-blue-700 dark:text-blue-300"
          headerBg="bg-blue-50 dark:bg-blue-900/20"
          borderCls="border-blue-100 dark:border-blue-900"
          description={`约 ${aTotalMin} 分钟 · 完成后＋约 ${QUIZ_ESTIMATED_MINUTES} 分钟挑战`}
          statusText={`${aPassed}/${aTier.length} 完成${passRate !== null ? `  ·  ${Math.round(passRate * 100)}%` : ''}`}
          resources={aTier}
          defaultOpen
          {...rowProps}
        />
      ) : (
        <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-stone-700 dark:text-stone-300">今日为自由学习日</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">无必做任务，下一天已自动解锁</p>
          </div>
        </div>
      )}

      {/* B 建议 */}
      {bTier.length > 0 && (
        <TierSection
          tier="B"
          label="建议补充"
          accentCls="text-amber-700 dark:text-amber-300"
          headerBg="bg-amber-50 dark:bg-amber-900/20"
          borderCls="border-amber-100 dark:border-amber-900"
          description={hasAFailed ? '有题目未通过，已自动展开——针对卡点补充练习' : 'A 层 < 75% 或概念卡点时使用'}
          statusText=""
          resources={bTier}
          defaultOpen={false}
          forceOpen={hasAFailed}
          {...rowProps}
        />
      )}

      {/* C 拓展 */}
      {cTier.length > 0 && (
        <TierSection
          tier="C"
          label="拓展"
          accentCls="text-stone-500 dark:text-stone-400"
          headerBg="bg-stone-50 dark:bg-stone-700"
          borderCls="border-stone-100 dark:border-stone-700"
          description="100% 覆盖 / 二轮返工"
          statusText=""
          resources={cTier}
          defaultOpen={false}
          {...rowProps}
        />
      )}

      {/* 相关 FRQ 真题 */}
      {aConcepts.length > 0 && (
        <RelatedFRQCard userId={userId} conceptIds={aConcepts.map(k => k.id)} week={week} day={day} />
      )}
    </div>
  )
}
