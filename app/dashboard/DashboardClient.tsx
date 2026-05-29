'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StorageService } from '@/lib/infra/storage'
import { ensureAppReady } from '@/lib/app/ready'
import { repo } from '@/lib/repository'
import { WEEKS, DAYS_PER_WEEK, PASS_THRESHOLD, BADGE_DARK_GREEN, BADGE_LIGHT_GREEN, BADGE_AMBER } from '@/lib/constants'
import { computeDayScore, latestPerQuestion } from '@/lib/domain/scoring'
import type { QuizResult, FRQCompletion } from '@/lib/types'

interface DayStatus {
  week: number
  day: number
  unlocked: boolean
  aTotal: number
  aDone: number
  passRate: number | null
  challengeCorrect: number | null
  challengeTotal: number | null
  score: number | null
}

export function DashboardClient() {
  const [days, setDays] = useState<DayStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [initFailed, setInitFailed] = useState(false)

  useEffect(() => {
    async function load() {
      await ensureAppReady()
      const userId = StorageService.userId.init()

      const [allResources, allCompletions, unlockedDays, allQuizResults, allFRQCompletions] = await Promise.all([
        repo.getAllResources(),
        repo.getAllUserCompletions(userId),
        repo.getUnlockedDays(userId),
        repo.getAllQuizResultsForUser(userId),
        repo.getAllFRQCompletionsForUser(userId),
      ])

      const unlockedSet = new Set(unlockedDays.map(u => `${u.week}-${u.day}`))
      const completionMap = new Map(allCompletions.map(c => [c.resource_id, c]))

      // Group quiz results by week-day for O(1) per-day lookups
      const quizByDay = new Map<string, QuizResult[]>()
      for (const r of allQuizResults) {
        const key = `${r.week}-${r.day}`
        if (!quizByDay.has(key)) quizByDay.set(key, [])
        quizByDay.get(key)!.push(r)
      }

      // Group FRQ completions by week-day
      const frqByDay = new Map<string, FRQCompletion[]>()
      for (const f of allFRQCompletions) {
        const key = `${f.week}-${f.day}`
        if (!frqByDay.has(key)) frqByDay.set(key, [])
        frqByDay.get(key)!.push(f)
      }

      // Pre-index resources by tier and week-day key for O(1) lookups
      const aResourcesByDay = new Map<string, typeof allResources>()
      const cResourcesByDay = new Map<string, typeof allResources>()
      // B resources are indexed by concept ID rather than by their assigned week/day.
      // getBResources() selects B candidates by concept IDs (not by day), so a B
      // resource seeded to Day 7 can be presented during Day 3 remediation when
      // the concepts overlap. Keying by assigned day would silently produce
      // bBonus = 0 for those cross-day B completions.
      const bResourceByConcept = new Map<string, typeof allResources>()
      for (const r of allResources) {
        const key = `${r.week}-${r.day}`
        if (r.tier === 'A') {
          const arr = aResourcesByDay.get(key) ?? []; arr.push(r); aResourcesByDay.set(key, arr)
        } else if (r.tier === 'B') {
          for (const c of r.concepts) {
            const arr = bResourceByConcept.get(c) ?? []; arr.push(r); bResourceByConcept.set(c, arr)
          }
        } else if (r.tier === 'C') {
          const arr = cResourcesByDay.get(key) ?? []; arr.push(r); cResourcesByDay.set(key, arr)
        }
      }

      // Freeze the reference time once so every day cell uses the same 'now'.
      // Without this, a tab left open overnight would silently degrade scores via
      // the recency factor in computeDayScore.
      const loadedAt = new Date()
      const result: DayStatus[] = []
      for (let w = 1; w <= WEEKS; w++) {
        for (let d = 1; d <= DAYS_PER_WEEK; d++) {
          const key = `${w}-${d}`
          const aResources = aResourcesByDay.get(key) ?? []
          const aDone = aResources.filter(r => {
            const c = completionMap.get(r.id)
            return c && c.status !== 'skipped'
          }).length

          let passRate: number | null = null
          if (aDone > 0 && aResources.length > 0) {
            const passed = aResources.filter(r => completionMap.get(r.id)?.status === 'passed').length
            // Use aTotal denominator — matches calcAttemptedPassRate used everywhere else.
            // Untouched resources count against quality so the display stays honest.
            passRate = passed / aResources.length
          }

          const dayQuiz = quizByDay.get(key) ?? []
          const regularQuiz = dayQuiz.filter(r => r.question_type !== 'feynman')
          const dedupedQuiz = latestPerQuestion(regularQuiz)
          const challengeTotal = dedupedQuiz.length > 0 ? dedupedQuiz.length : null
          const challengeCorrect = dedupedQuiz.length > 0 ? dedupedQuiz.filter(r => r.correct).length : null

          // Compute day score if there is any activity
          const dayFRQ = frqByDay.get(key) ?? []
          // Collect B resources by concept overlap — same logic as getBResources().
          // B resources are stored with their curriculum-assigned week/day, which may
          // differ from the remediation session day; using concept overlap ensures
          // cross-day B completions are credited to the day whose concepts they cover.
          const dayConceptSet = new Set(aResources.flatMap(r => r.concepts))
          const bSeenIds = new Set<string>()
          const bResources: typeof allResources = []
          for (const conceptId of dayConceptSet) {
            for (const r of (bResourceByConcept.get(conceptId) ?? [])) {
              if (!bSeenIds.has(r.id)) { bSeenIds.add(r.id); bResources.push(r) }
            }
          }
          const cResources = cResourcesByDay.get(key) ?? []
          const bComps = bResources.map(r => completionMap.get(r.id)).filter((c): c is NonNullable<typeof c> => c != null)
          const cComps = cResources.map(r => completionMap.get(r.id)).filter((c): c is NonNullable<typeof c> => c != null)
          // cComps must be included: a day with only C-tier activity has aDone=0,
          // no quiz, no B completion, and no FRQ — omitting cComps silently
          // discards the C-bonus and leaves score as null in the dashboard.
          const hasActivity = aDone > 0 || dayQuiz.length > 0 || bComps.length > 0 || cComps.length > 0 || dayFRQ.length > 0

          let score: number | null = null
          if (hasActivity) {
            const aCompMap = new Map<string, NonNullable<ReturnType<typeof completionMap.get>>>()
            for (const r of aResources) {
              const c = completionMap.get(r.id)
              if (c) aCompMap.set(r.id, c)
            }
            score = computeDayScore({
              aResources,
              aCompletions: aCompMap,
              bCompletions: bComps,
              cCompletions: cComps,
              frqCompletions: dayFRQ,
              quizResults: dayQuiz,
              bTotalResources: bResources.length,
              now: loadedAt,
            }).total
          }

          result.push({
            week: w, day: d,
            unlocked: unlockedSet.has(key),
            aTotal: aResources.length,
            aDone,
            passRate,
            challengeCorrect,
            challengeTotal,
            score,
          })
        }
      }

      setDays(result)
      setLoading(false)
    }
    load().catch(err => {
      console.error(err)
      setInitFailed(true)
      setLoading(false)
    })
  }, [])

  if (initFailed) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="font-semibold text-stone-800 text-sm">数据加载失败</p>
        <p className="text-xs text-stone-500">请检查网络连接后重试</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          刷新页面
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-pulse">
        {/* Header: title + nav links */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-6 w-24 bg-stone-200 dark:bg-stone-700/60 rounded" />
            <div className="h-3.5 w-40 bg-stone-200 dark:bg-stone-700/60 rounded" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-10 bg-stone-200 dark:bg-stone-700/60 rounded" />
            <div className="h-4 w-10 bg-stone-200 dark:bg-stone-700/60 rounded" />
          </div>
        </div>

        {/* Progress summary bar */}
        <div className="bg-stone-50 rounded-xl border border-stone-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="h-8 w-16 bg-stone-200 dark:bg-stone-700/60 rounded" />
              <div className="pl-5 border-l border-stone-100 space-y-1.5">
                <div className="h-3 w-16 bg-stone-200 dark:bg-stone-700/60 rounded" />
                <div className="h-4 w-24 bg-stone-200 dark:bg-stone-700/60 rounded" />
              </div>
            </div>
            <div className="h-4 w-8 bg-stone-200 dark:bg-stone-700/60 rounded" />
          </div>
          <div className="h-1.5 bg-stone-200 dark:bg-stone-700/60 rounded-full" />
        </div>

        {/* Week grids */}
        <div className="space-y-3">
          {Array.from({ length: WEEKS }).map((_, wi) => (
            <div key={wi} className="bg-stone-50 rounded-xl border border-stone-100 overflow-hidden">
              {/* Week header */}
              <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between">
                <div className="h-4 w-14 bg-stone-200 dark:bg-stone-700/60 rounded" />
                <div className="h-3 w-10 bg-stone-200 dark:bg-stone-700/60 rounded" />
              </div>
              {/* Day cells grid */}
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 min-w-[308px]">
                  {Array.from({ length: DAYS_PER_WEEK }).map((_, di) => (
                    <div key={di} className="py-3 flex flex-col items-center gap-1.5 border-r border-stone-100 last:border-r-0">
                      <div className="h-3 w-5 bg-stone-200 dark:bg-stone-700/60 rounded" />
                      <div className="h-3.5 w-3.5 bg-stone-100 rounded-full" />
                      <div className="h-2.5 w-8 bg-stone-100 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Summary stats
  // A day is "complete" only when the student genuinely passed (passRate ≥ threshold).
  // Counting failed-but-attempted days (aDone === aTotal but passRate < threshold)
  // inflates the progress bar and misleads the student about how far they've come.
  // Free days (aTotal=0) are auto-unlocked on arrival and count as completed.
  const completedDays = days.filter(d =>
    (d.aTotal > 0 && d.passRate !== null && d.passRate >= PASS_THRESHOLD) ||
    (d.aTotal === 0 && d.unlocked)
  )
  const unlockedDays = days.filter(d => d.unlocked)
  const totalDays = WEEKS * DAYS_PER_WEEK
  const progressPct = Math.round((completedDays.length / totalDays) * 100)

  // Find current day (latest unlocked, not yet completed)
  const currentDay = [...unlockedDays].reverse().find(d => d.aDone < d.aTotal) ?? unlockedDays[unlockedDays.length - 1]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">学习进度</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">AP Physics 1  ·  8 周 56 天</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors">← 返回</Link>
          <Link href="/settings" className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">⚙ 设置</Link>
        </div>
      </div>

      {/* Progress summary bar */}
      <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-5">
            <div>
              <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">{completedDays.length}</span>
              <span className="text-stone-400 dark:text-stone-500 ml-1 text-xs">/ {totalDays} 天完成</span>
            </div>
            {currentDay && (
              <div className="pl-5 border-l border-stone-100 dark:border-stone-700">
                <span className="text-xs text-stone-400 dark:text-stone-500">当前进度</span>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Week {currentDay.week} · Day {currentDay.day}
                </p>
              </div>
            )}
          </div>
          <span className="text-stone-400 dark:text-stone-500 text-sm font-medium">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Week grids */}
      <div className="space-y-3">
        {Array.from({ length: WEEKS }, (_, wi) => {
          const week = wi + 1
          const weekDays = days.filter(d => d.week === week)
          const weekDone = weekDays.filter(d =>
            (d.aTotal > 0 && d.passRate !== null && d.passRate >= PASS_THRESHOLD) ||
            (d.aTotal === 0 && d.unlocked)
          ).length
          const isCurrentWeek = currentDay?.week === week
          const isLockedWeek = weekDays.every(d => !d.unlocked)

          return (
            <div
              key={week}
              className={`bg-white dark:bg-stone-800 rounded-xl border overflow-hidden transition-all ${
                isLockedWeek ? 'border-stone-100 dark:border-stone-700 opacity-60' :
                isCurrentWeek ? 'border-blue-200 dark:border-blue-800 shadow-sm shadow-blue-50' :
                'border-stone-100 dark:border-stone-700'
              }`}
            >
              {/* Week header */}
              <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
                isCurrentWeek ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800' : 'bg-stone-50 dark:bg-stone-700 border-stone-50 dark:border-stone-700'
              }`}>
                <div className="flex items-center gap-2">
                  {isCurrentWeek && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                  <span className={`text-sm font-semibold ${isCurrentWeek ? 'text-blue-800 dark:text-blue-300' : 'text-stone-600 dark:text-stone-400'}`}>
                    Week {week}
                  </span>
                </div>
                <span className="text-xs text-stone-400 dark:text-stone-500">{weekDone}/{DAYS_PER_WEEK} 天</span>
              </div>

              {/* Day cells */}
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 min-w-[308px]">
                  {weekDays.map(d => (
                    <DayCell key={`${d.week}-${d.day}`} status={d} isCurrent={
                      currentDay?.week === d.week && currentDay?.day === d.day
                    } />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-stone-400 dark:text-stone-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />通过
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />进行中
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" />待开始
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 inline-block" />需重试
        </span>
      </div>
    </div>
  )
}

function DayCell({ status, isCurrent }: { status: DayStatus; isCurrent: boolean }) {
  const { week, day, unlocked, aTotal, aDone, passRate, challengeCorrect, challengeTotal, score } = status
  // Rest/review days (aTotal === 0) are auto-unlocked on arrival with no resources to complete.
  // Treat them as "done" so the cell shows a green checkmark instead of the blue "start" icon.
  const isFreeDay = aTotal === 0 && unlocked
  const isComplete = aTotal > 0 && aDone === aTotal
  const isStarted = aDone > 0 && !isComplete
  const isPassed = isComplete && passRate !== null && passRate >= PASS_THRESHOLD
  const needsRetry = isComplete && passRate !== null && passRate < PASS_THRESHOLD

  // Visual state
  let cellBg = 'bg-stone-50 dark:bg-stone-700/50'
  let dayNumCls = 'text-stone-300 dark:text-stone-600'
  let indicator: React.ReactNode = null

  if (!unlocked) {
    cellBg = 'bg-stone-50 dark:bg-stone-700/50'
    dayNumCls = 'text-stone-300 dark:text-stone-600'
    indicator = (
      <svg className="w-3.5 h-3.5 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    )
  } else if (isPassed || isFreeDay) {
    cellBg = 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30'
    dayNumCls = 'text-emerald-700 dark:text-emerald-400'
    indicator = (
      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    )
  } else if (needsRetry) {
    cellBg = 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30'
    dayNumCls = 'text-orange-700 dark:text-orange-400'
    indicator = (
      <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    )
  } else if (isStarted) {
    cellBg = 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
    dayNumCls = 'text-amber-700 dark:text-amber-400'
    indicator = (
      <div className="flex gap-0.5">
        {Array.from({ length: status.aTotal }).map((_, i) => (
          <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < aDone ? 'bg-amber-400' : 'bg-amber-200 dark:bg-amber-700'}`} />
        ))}
      </div>
    )
  } else if (unlocked) {
    cellBg = 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30'
    dayNumCls = 'text-blue-700 dark:text-blue-400'
    indicator = (
      <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
    )
  }

  const subText = aTotal > 0 ? (
    <span className="text-[10px] text-stone-400 dark:text-stone-500">
      {aDone}/{aTotal}
      {passRate !== null && (
        <span className={passRate >= PASS_THRESHOLD ? 'text-emerald-500' : 'text-orange-400'}>
          {' '}{Math.round(passRate * 100)}%
        </span>
      )}
    </span>
  ) : null

  const challengeText = challengeTotal !== null ? (
    <span className={`text-[10px] ${
      challengeCorrect! / challengeTotal >= 0.75
        ? 'text-emerald-500'
        : 'text-amber-500'
    }`}>
      ⚡{challengeCorrect}/{challengeTotal}
    </span>
  ) : null

  const scoreBadgeCls = score !== null
    ? score >= BADGE_DARK_GREEN  ? 'bg-emerald-500 text-white'
    : score >= BADGE_LIGHT_GREEN ? 'bg-emerald-100 text-emerald-700'
    : score >= BADGE_AMBER       ? 'bg-amber-100 text-amber-700'
    : 'bg-red-50 text-red-600'
    : null

  const inner = (
    <div className={`relative py-3 flex flex-col items-center gap-1.5 ${cellBg} transition-colors ${
      isCurrent ? 'ring-1 ring-inset ring-blue-400' : ''
    }`}>
      {scoreBadgeCls && score !== null && (
        <div className={`absolute top-0.5 right-0.5 text-[8px] font-bold leading-tight px-1 py-0.5 rounded ${scoreBadgeCls}`}>
          {score}
        </div>
      )}
      <span className={`text-[11px] font-semibold ${dayNumCls}`}>D{day}</span>
      <div className="flex items-center justify-center h-4">{indicator}</div>
      {subText}
      {challengeText}
    </div>
  )

  if (!unlocked) return <div className="border-r border-stone-50 dark:border-stone-700 last:border-r-0">{inner}</div>

  return (
    <a href={`/week/${week}/day/${day}`} className="block border-r border-stone-50 dark:border-stone-700 last:border-r-0">
      {inner}
    </a>
  )
}
