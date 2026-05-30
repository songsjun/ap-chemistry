'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ensureAppReady } from '@/lib/app/ready'
import { StorageService } from '@/lib/infra/storage'
import { repo } from '@/lib/repository'
import { getDb } from '@/lib/infra/db'
import type { Resource, KnowledgePoint, Completion } from '@/lib/types'
import { WEEKS } from '@/lib/constants'

type KPStatus = 'mastered' | 'in-progress' | 'not-started'
type ResourceStatus = 'passed' | 'failed' | 'skipped' | 'not-started'

interface ResourceData {
  resource: Resource
  status: ResourceStatus
}

interface KPData {
  kp: KnowledgePoint
  status: KPStatus
  resources: ResourceData[]
}

const TYPE_ICONS: Record<string, string> = {
  video: '▶',
  reading: '📖',
  exercise: '✏',
  interactive: '🔬',
  frq: '📝',
}

const TIER_LABELS: Record<string, string> = {
  A: '必学',
  B: '补充',
  C: '练习',
}

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

export function KnowledgeTreeClient() {
  const [kpData, setKpData] = useState<KPData[]>([])
  const [loading, setLoading] = useState(true)
  const [initFailed, setInitFailed] = useState(false)
  const [expandedKPs, setExpandedKPs] = useState<Set<string>>(new Set())
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set())

  useEffect(() => {
    async function load() {
      await ensureAppReady()
      const userId = StorageService.userId.init()

      const [allResources, allCompletions, allKPs] = await Promise.all([
        repo.getAllResources(),
        repo.getAllUserCompletions(userId),
        getDb().knowledge_points.toArray(),
      ])

      allKPs.sort((a, b) => a.week !== b.week ? a.week - b.week : a.day - b.day)

      const completionMap = new Map<string, Completion>(
        allCompletions.map(c => [c.resource_id, c])
      )

      const conceptToResources = new Map<string, Resource[]>()
      for (const resource of allResources) {
        for (const cid of resource.concepts) {
          const arr = conceptToResources.get(cid) ?? []
          arr.push(resource)
          conceptToResources.set(cid, arr)
        }
      }

      const result: KPData[] = allKPs.map(kp => {
        const resources = [...(conceptToResources.get(kp.id) ?? [])]
        resources.sort((a, b) => {
          const td = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
          return td !== 0 ? td : a.slot_order - b.slot_order
        })

        const aResources = resources.filter(r => r.tier === 'A')
        const aPassedCount = aResources.filter(r => completionMap.get(r.id)?.status === 'passed').length
        const hasAnyActivity = resources.some(r => completionMap.has(r.id))

        const status: KPStatus =
          aResources.length > 0 && aPassedCount === aResources.length ? 'mastered' :
          hasAnyActivity ? 'in-progress' : 'not-started'

        return {
          kp,
          status,
          resources: resources.map(r => ({
            resource: r,
            status: (completionMap.get(r.id)?.status ?? 'not-started') as ResourceStatus,
          })),
        }
      })

      setKpData(result)
      setLoading(false)
    }
    load().catch(err => {
      console.error(err)
      setInitFailed(true)
      setLoading(false)
    })
  }, [])

  function toggleKP(id: string) {
    setExpandedKPs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleWeek(week: number) {
    setCollapsedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }

  if (initFailed) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="font-semibold text-stone-800 dark:text-stone-200 text-sm">数据加载失败</p>
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
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-6 w-28 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-3.5 w-48 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 w-12 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-4 w-12 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
        </div>
        <div className="h-14 bg-stone-100 dark:bg-stone-800 rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 flex justify-between">
              <div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
              <div className="h-4 w-20 bg-stone-200 dark:bg-stone-700 rounded" />
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="px-4 py-3 border-b border-stone-50 dark:border-stone-700/50 flex gap-3">
                <div className="h-5 w-12 bg-stone-100 dark:bg-stone-700 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-3/4 bg-stone-100 dark:bg-stone-700 rounded" />
                  <div className="h-3 w-1/2 bg-stone-100 dark:bg-stone-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const byWeek = new Map<number, KPData[]>()
  for (const d of kpData) {
    const arr = byWeek.get(d.kp.week) ?? []
    arr.push(d)
    byWeek.set(d.kp.week, arr)
  }

  const totalKPs = kpData.length
  const masteredKPs = kpData.filter(d => d.status === 'mastered').length
  const inProgressKPs = kpData.filter(d => d.status === 'in-progress').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">知识点树</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">AP Chemistry · {totalKPs} 个知识点</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors">← 进度</Link>
          <Link href="/settings" className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">⚙ 设置</Link>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 p-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-stone-600 dark:text-stone-300">已掌握 <strong className="text-stone-900 dark:text-stone-100">{masteredKPs}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-stone-600 dark:text-stone-300">进行中 <strong className="text-stone-900 dark:text-stone-100">{inProgressKPs}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-300 dark:bg-stone-600 shrink-0" />
            <span className="text-stone-600 dark:text-stone-300">未开始 <strong className="text-stone-900 dark:text-stone-100">{totalKPs - masteredKPs - inProgressKPs}</strong></span>
          </div>
        </div>
      </div>

      {/* Week sections */}
      <div className="space-y-4">
        {Array.from({ length: WEEKS }, (_, wi) => {
          const week = wi + 1
          const weekKPs = byWeek.get(week) ?? []
          if (weekKPs.length === 0) return null

          const isCollapsed = collapsedWeeks.has(week)
          const weekMastered = weekKPs.filter(d => d.status === 'mastered').length

          return (
            <div key={week} className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 overflow-hidden">

              {/* Week header */}
              <button
                onClick={() => toggleWeek(week)}
                className="w-full px-4 py-3 flex items-center justify-between bg-stone-50 dark:bg-stone-700/50 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors border-b border-stone-100 dark:border-stone-700"
              >
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">Week {week}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 dark:text-stone-500">{weekMastered}/{weekKPs.length} 已掌握</span>
                  <svg
                    className={`w-4 h-4 text-stone-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* KP list */}
              {!isCollapsed && (
                <div className="divide-y divide-stone-50 dark:divide-stone-700/50">
                  {weekKPs.map(({ kp, status, resources }) => {
                    const isExpanded = expandedKPs.has(kp.id)

                    const statusBadgeCls =
                      status === 'mastered'    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      status === 'in-progress' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
                    const statusLabel =
                      status === 'mastered'    ? '已掌握' :
                      status === 'in-progress' ? '进行中' : '未开始'

                    return (
                      <div key={kp.id}>

                        {/* KP row */}
                        <button
                          onClick={() => toggleKP(kp.id)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors text-left"
                        >
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${statusBadgeCls}`}>
                            {statusLabel}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{kp.name_zh}</p>
                            <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{kp.name_en}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-stone-400 dark:text-stone-500 whitespace-nowrap">D{kp.day} · {resources.length} 资源</span>
                            <svg
                              className={`w-3.5 h-3.5 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {/* Resource list */}
                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 space-y-1.5 bg-stone-50/50 dark:bg-stone-700/10">
                            {resources.length === 0 ? (
                              <p className="text-xs text-stone-400 dark:text-stone-500 py-2 pl-1">暂无关联资源</p>
                            ) : (
                              resources.map(({ resource, status: rStatus }) => (
                                <ResourceRow key={resource.id} resource={resource} status={rStatus} />
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResourceRow({ resource, status }: { resource: Resource; status: ResourceStatus }) {
  const icon = TYPE_ICONS[resource.type] ?? '·'

  const rStatusCls =
    status === 'passed'      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
    status === 'failed'      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
    status === 'skipped'     ? 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400' :
                               'bg-stone-100 text-stone-400 dark:bg-stone-700/50 dark:text-stone-500'
  const rStatusLabel =
    status === 'passed'  ? '✓ 已学' :
    status === 'failed'  ? '✗ 未过' :
    status === 'skipped' ? '— 跳过' : '未学'

  const tierCls =
    resource.tier === 'A' ? 'text-blue-500 dark:text-blue-400' :
    resource.tier === 'B' ? 'text-purple-500 dark:text-purple-400' :
                            'text-stone-400 dark:text-stone-500'

  const inner = (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 hover:border-stone-200 dark:hover:border-stone-600 transition-colors">
      <span className="text-sm shrink-0 w-5 text-center leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-stone-700 dark:text-stone-300 truncate">{resource.title}</p>
        <p className="text-[10px] text-stone-400 dark:text-stone-500">{resource.platform}</p>
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${tierCls}`}>{TIER_LABELS[resource.tier]}</span>
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${rStatusCls}`}>{rStatusLabel}</span>
      {resource.url && (
        <svg className="w-3 h-3 text-stone-300 dark:text-stone-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      )}
    </div>
  )

  if (!resource.url) return <div>{inner}</div>

  return (
    <a href={resource.url} target="_blank" rel="noopener noreferrer" className="block">
      {inner}
    </a>
  )
}
