'use client'

import { useState, useEffect } from 'react'
import type { Resource, Completion, KnowledgePoint } from '@/lib/types'
import { PASS_THRESHOLD } from '@/lib/constants'

// ── Phase visual system ───────────────────────────────────────────────────────

const PHASE_STYLE: Record<string, {
  label: string
  badgeCls: string
  borderCls: string
  rowBg: string
}> = {
  LEARN: {
    label: '学习',
    badgeCls: 'bg-amber-100 text-amber-700',
    borderCls: 'border-l-amber-400',
    rowBg: 'bg-amber-50/40 dark:bg-amber-900/10',
  },
  PRACTICE: {
    label: '练习',
    badgeCls: 'bg-blue-100 text-blue-700',
    borderCls: 'border-l-blue-400',
    rowBg: 'bg-blue-50/40 dark:bg-blue-900/10',
  },
}

const PLATFORM_SHORT: Record<string, string> = {
  khan: 'Khan', openstax: 'OpenStax', phet: 'PhET',
  flipping: 'Flipping', ap_central: 'AP Central', native: '平台',
}

const TYPE_LABEL: Record<string, string> = {
  video: '视频', exercise: '练习', reading: '阅读',
  interactive: '实验', frq: 'FRQ',
}

// Default score_max by resource type / platform
function defaultScoreMax(r: Resource): number {
  if (r.platform === 'khan' && r.type === 'exercise') return 4
  if (r.type === 'frq') return 10
  return 5
}

function isGradedResource(r: Resource): boolean {
  return r.type === 'exercise' || r.type === 'frq'
}

// ── Derived annotations ───────────────────────────────────────────────────────

function getCompletionCriteria(r: Resource): string {
  if (r.platform === 'khan' && r.type === 'exercise') return '4 题，目标 ≥ 3 题正确（75%）'
  if (r.platform === 'khan' && r.type === 'video') return '完整观看，记录关键概念和公式'
  if (r.platform === 'khan' && r.type === 'reading') return '阅读互动文章，完成嵌入练习'
  if (r.type === 'interactive') return '完成实验步骤，记录观察结论，建立化学直觉'
  if (r.platform === 'openstax' && r.type === 'reading') return '阅读并理解核心定义，能口述要点'
  if (r.platform === 'openstax' && r.type === 'exercise') return '完成练习题，用答案键核对过程'
  if (r.type === 'frq') return '完成 FRQ 作答，对照评分标准逐点自评'
  if (r.platform === 'flipping') return '观看补强视频，针对卡点概念做笔记'
  return `完成 ${r.estimated_minutes} 分钟学习任务`
}

function getLearningObjective(r: Resource, kps: KnowledgePoint[]): string {
  const topicsZh = kps.map(k => k.name_zh).join('、')
  if (!topicsZh) return ''
  const prefix: Record<string, string> = {
    video: `理解 ${topicsZh} 的化学原理和数学表达`,
    exercise: `运用 ${topicsZh} 解决典型 AP 题目`,
    interactive: `通过实验直观感受 ${topicsZh} 的规律`,
    reading: `深入理解 ${topicsZh} 的定义与推导过程`,
    frq: `综合运用本周知识完成开放性 FRQ 作答`,
  }
  return prefix[r.type] ?? `完成 ${topicsZh} 相关学习`
}

// ── RowSharedProps ────────────────────────────────────────────────────────────

export interface RowSharedProps {
  completions: Map<string, Completion>
  kpMap: Map<string, KnowledgePoint>
  scoringId: string | null
  onCheckDirect: (r: Resource) => void
  onCheckGraded: (r: Resource) => void
  onScoreSubmit: (r: Resource, score: number, scoreMax: number) => void
  onScoreCancel: () => void
}

// ── ScorePanel ────────────────────────────────────────────────────────────────

function ScorePanel({ resource, onSubmit, onCancel }: {
  resource: Resource
  onSubmit: (score: number, scoreMax: number) => void
  onCancel: () => void
}) {
  const max = defaultScoreMax(resource)
  const [score, setScore] = useState(0)

  const pct = Math.round((score / max) * 100)
  const willPass = score / max >= PASS_THRESHOLD

  return (
    <div className="mx-4 mb-3 ml-12 mt-1">
      <div className="bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-600 p-3 space-y-3">
        <p className="text-xs font-medium text-stone-600 dark:text-stone-400">
          {resource.type === 'frq' ? '得了几分？' : '几题答对了？'}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScore(s => Math.max(0, s - 1))}
            className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:bg-stone-100 transition-colors dark:bg-stone-700 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-600"
          >−</button>
          <div className="flex items-baseline gap-1.5 min-w-[4rem] justify-center">
            <span className="text-2xl font-bold text-stone-800 dark:text-stone-200 tabular-nums">{score}</span>
            <span className="text-sm text-stone-400 dark:text-stone-500">/ {max}</span>
          </div>
          <button
            onClick={() => setScore(s => Math.min(max, s + 1))}
            className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:bg-stone-100 transition-colors dark:bg-stone-700 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-600"
          >+</button>
          <div className={`ml-1 text-xs font-medium px-2 py-1 rounded-md ${
            willPass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
          }`}>
            {pct}%{willPass ? ' ✓' : ''}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(score, max)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              willPass
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-red-100 hover:bg-red-200 text-red-700'
            }`}
          >
            {willPass ? '通过' : '未达标'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ResourceRow ───────────────────────────────────────────────────────────────

function ResourceRow({ resource, completion, kpMap, scoringId, onCheckDirect, onCheckGraded, onScoreSubmit, onScoreCancel }: {
  resource: Resource
  completion: Completion | undefined
  kpMap: Map<string, KnowledgePoint>
  scoringId: string | null
  onCheckDirect: (r: Resource) => void
  onCheckGraded: (r: Resource) => void
  onScoreSubmit: (r: Resource, score: number, scoreMax: number) => void
  onScoreCancel: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const done = completion?.status === 'passed'
  const failed = completion?.status === 'failed'
  const isScoring = scoringId === resource.id

  const phase = PHASE_STYLE[resource.phase] ?? PHASE_STYLE.PRACTICE
  const kps = resource.concepts.map(id => kpMap.get(id)).filter(Boolean) as KnowledgePoint[]
  const cedCodes = [...new Set(kps.map(k => k.ced_topic))].join(', ')
  const objective = getLearningObjective(resource, kps)
  const criteria = getCompletionCriteria(resource)
  const openstaxSections = [...new Set(kps.flatMap(k => k.openstax_sections))]
  const typeLabel = TYPE_LABEL[resource.type] ?? resource.type
  const platformLabel = PLATFORM_SHORT[resource.platform] ?? resource.platform
  const graded = isGradedResource(resource)

  const rowBg = done ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : phase.rowBg

  // Score display if recorded
  const scoreDisplay = done && completion?.score !== undefined && completion.score_max
    ? `${completion.score}/${completion.score_max}`
    : null
  const failedScoreDisplay = failed && completion?.score !== undefined && completion.score_max
    ? `${completion.score}/${completion.score_max}`
    : null

  return (
    <div className={`border-l-[3px] ${done ? 'border-l-emerald-400' : failed ? 'border-l-red-300' : phase.borderCls} transition-colors`}>

      {/* Main row */}
      <div className={`flex items-start gap-3 px-4 pt-3 pb-2 ${rowBg}`}>

        {/* Checkbox */}
        <button
          onClick={() => {
            if (done || !resource.url) return
            if (graded) onCheckGraded(resource)
            else onCheckDirect(resource)
          }}
          disabled={!resource.url}
          aria-label={done ? `${resource.title} 已完成` : !resource.url ? `${resource.title} 内容准备中` : `标记 ${resource.title} 为完成`}
          aria-pressed={done}
          className={`mt-0.5 w-5 h-5 rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-all ${
            !resource.url ? 'border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800 cursor-not-allowed' :
            done   ? 'bg-emerald-500 border-emerald-500 shadow-sm' :
            failed ? 'bg-red-50 border-red-300 hover:bg-red-100 dark:bg-red-950/30' :
                     'border-stone-300 hover:border-blue-400 hover:bg-blue-50 dark:border-stone-600 dark:hover:bg-blue-900/20'
          }`}
        >
          {done && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {failed && <span className="text-red-400 text-[10px] leading-none font-bold">✕</span>}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* Title + badges */}
          <div className="flex items-start justify-between gap-2">
            {resource.url ? (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm font-medium leading-snug transition-colors flex-1 ${
                  done ? 'text-stone-400 line-through dark:text-stone-500' : 'text-stone-800 hover:text-blue-600 dark:text-stone-200 dark:hover:text-blue-400'
                }`}
              >
                {resource.title}
              </a>
            ) : (
              <span className="text-sm font-medium leading-snug flex-1 text-stone-400 dark:text-stone-500 italic">
                {resource.title}
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium not-italic">内容准备中</span>
              </span>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${phase.badgeCls}`}>
                {phase.label}
              </span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 hidden sm:inline">{typeLabel}</span>
              <span className="text-[11px] text-stone-300 dark:text-stone-600 hidden sm:inline">{platformLabel}</span>
              {/* Score display */}
              {scoreDisplay && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                  {scoreDisplay}
                </span>
              )}
              {failedScoreDisplay && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">
                  {failedScoreDisplay}
                </span>
              )}
              {!scoreDisplay && !failedScoreDisplay && (
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
                  done ? 'text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-700' : 'text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-700'
                }`}>
                  {resource.estimated_minutes}m
                </span>
              )}
              {resource.url && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-300 dark:text-stone-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                  aria-label="在新标签页打开"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Subtitle row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {cedCodes && (
              <span className="text-[11px] text-stone-400 font-mono">CED {cedCodes}</span>
            )}
            {kps.slice(0, 2).map(kp => (
              <span key={kp.id} className="text-[11px] bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded-md">
                {kp.name_zh}
              </span>
            ))}
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors ml-0.5"
            >
              {expanded ? '收起' : '详情'}
            </button>
          </div>
        </div>
      </div>

      {/* Score input panel */}
      {isScoring && (
        <ScorePanel
          resource={resource}
          onSubmit={(score, max) => onScoreSubmit(resource, score, max)}
          onCancel={onScoreCancel}
        />
      )}

      {/* Expandable detail */}
      {expanded && !isScoring && (
        <div className={`mx-4 mb-3 ml-12 pl-3 border-l border-stone-100 dark:border-stone-700 space-y-1.5 text-xs text-stone-500 dark:text-stone-400 ${rowBg}`}>
          {objective && (
            <div className="flex gap-2 pt-1">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">学习目标</span>
              <span className="text-stone-600 dark:text-stone-400">{objective}</span>
            </div>
          )}
          {resource.description && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right pt-0.5">实验步骤</span>
              <ol className="space-y-1 flex-1">
                {resource.description.split('\n').map((step, i) => (
                  <li key={i} className="text-stone-600 dark:text-stone-400">{step}</li>
                ))}
              </ol>
            </div>
          )}
          {!resource.description && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">完成标准</span>
              <span className="text-stone-600 dark:text-stone-400">{criteria}</span>
            </div>
          )}
          {/* Answer key link */}
          {resource.answer_url && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">答案</span>
              <a
                href={resource.answer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 underline underline-offset-2"
              >
                查看答案键 →
              </a>
            </div>
          )}
          {kps.length > 0 && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">知识点</span>
              <span className="text-stone-600 dark:text-stone-400">
                {kps.map(k => `CED ${k.ced_topic} ${k.name_en}`).join('  ·  ')}
              </span>
            </div>
          )}
          {openstaxSections.length > 0 && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">OpenStax</span>
              <span className="text-stone-600 dark:text-stone-400">第 {openstaxSections.join(', ')} 节</span>
            </div>
          )}
          {resource.type === 'exercise' && resource.platform === 'khan' && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">达成含义</span>
              <span className="text-stone-600 dark:text-stone-400">75% 正确率代表对该知识点有基础掌握，可推进下一模块</span>
            </div>
          )}
          {resource.type === 'interactive' && (
            <div className="flex gap-2">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">达成含义</span>
              <span className="text-stone-600 dark:text-stone-400">实验建立的直觉将帮助你在 FRQ 中理解现象机理和解释规律</span>
            </div>
          )}
          {resource.type === 'frq' && (
            <div className="flex gap-2 pb-1">
              <span className="text-stone-300 dark:text-stone-600 shrink-0 w-14 text-right">达成含义</span>
              <span className="text-stone-600 dark:text-stone-400">FRQ 是 AP 考试 50% 分值，完成官方题是最直接的水平校准</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── TierSection ───────────────────────────────────────────────────────────────

interface TierSectionProps extends RowSharedProps {
  tier: 'A' | 'B' | 'C'
  label: string
  accentCls: string
  headerBg: string
  borderCls: string
  description: string
  statusText: string
  resources: Resource[]
  defaultOpen: boolean
  forceOpen?: boolean
}

export function TierSection({
  tier, label, accentCls, headerBg, borderCls,
  description, statusText, resources, defaultOpen, forceOpen,
  ...rowProps
}: TierSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])

  return (
    <div className={`bg-white dark:bg-stone-800 rounded-xl border ${borderCls} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`tier-${tier.toLowerCase()}-content`}
        className={`w-full px-4 py-2.5 flex items-center justify-between ${headerBg} hover:brightness-95 transition-all text-left`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
            tier === 'A' ? 'bg-blue-600 text-white' :
            tier === 'B' ? 'bg-amber-500 text-white' :
                           'bg-stone-400 text-white'
          }`}>{tier}</span>
          <span className={`text-sm font-medium ${accentCls}`}>{label}</span>
          {description && <span className="text-xs text-stone-400 dark:text-stone-500">{description}</span>}
        </div>
        <div className="flex items-center gap-2">
          {statusText && <span className="text-xs text-stone-500 dark:text-stone-400">{statusText}</span>}
          <svg
            className={`w-3.5 h-3.5 text-stone-300 dark:text-stone-600 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div id={`tier-${tier.toLowerCase()}-content`} className="divide-y divide-stone-50 dark:divide-stone-700">
          {resources.map(r => (
            <ResourceRow
              key={r.id}
              resource={r}
              completion={rowProps.completions.get(r.id)}
              kpMap={rowProps.kpMap}
              scoringId={rowProps.scoringId}
              onCheckDirect={rowProps.onCheckDirect}
              onCheckGraded={rowProps.onCheckGraded}
              onScoreSubmit={rowProps.onScoreSubmit}
              onScoreCancel={rowProps.onScoreCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}
