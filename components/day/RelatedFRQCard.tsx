'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { findRelatedFRQ, frqTypeLabel } from '@/lib/domain/frq'
import type { FRQEntry } from '@/lib/domain/frq'
import type { FRQCompletion } from '@/lib/types'
import { repo } from '@/lib/repository'

// ── MoralJudgmentDialog ───────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function MoralJudgmentDialog({ entry, onConfirm, onCancel }: {
  entry: FRQEntry
  onConfirm: () => void
  onCancel: () => void
}) {
  const [checked, setChecked] = useState([false])
  const firstButtonRef = useCallback((el: HTMLButtonElement | null) => el?.focus(), [])
  const dialogRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      const els = Array.from(el.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const toggle = (i: number) => setChecked(prev => prev.map((v, j) => (j === i ? !v : v)))
  const allChecked = checked.every(Boolean)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="moral-dialog-title"
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-50 dark:bg-amber-900/20 px-5 pt-5 pb-4 border-b border-amber-100 dark:border-amber-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center shrink-0 text-lg">⚖️</div>
            <div>
              <p id="moral-dialog-title" className="text-sm font-semibold text-stone-800 dark:text-stone-200">查看答案前，请认真思考</p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{entry.year} · Q{entry.question_number} · {frqTypeLabel(entry.frq_type)}</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">逐条确认后才能查看评分标准：</p>
          {[`我已独立完成 ${entry.year} Q${entry.question_number} 的作答，没有在中途查阅提示或答案`].map((item, i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer group">
              <div
                className={`mt-0.5 w-5 h-5 rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-all ${checked[i] ? 'bg-amber-500 border-amber-500' : 'border-stone-300 dark:border-stone-600 group-hover:border-amber-400'}`}
                onClick={() => toggle(i)}
              >
                {checked[i] && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <span
                className={`text-xs leading-relaxed transition-colors ${checked[i] ? 'text-stone-400 line-through dark:text-stone-500' : 'text-stone-600 dark:text-stone-400'}`}
                onClick={() => toggle(i)}
              >
                {item}
              </span>
            </label>
          ))}
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button
            ref={firstButtonRef}
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
          >
            再想想
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${allChecked ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-stone-100 dark:bg-stone-700 text-stone-300 dark:text-stone-600 cursor-not-allowed'}`}
          >
            已确认，查看答案
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ScoreEntryInline ──────────────────────────────────────────────────────────

function ScoreEntryInline({ onSave, onCancel }: {
  onSave: (score: number, max: number) => void
  onCancel: () => void
}) {
  const [scoreStr, setScoreStr] = useState('')
  const [maxStr, setMaxStr] = useState('')

  const score = parseFloat(scoreStr)
  const max = parseFloat(maxStr)
  const valid = !isNaN(score) && !isNaN(max) && max > 0 && score >= 0 && score <= max

  return (
    <div className="flex items-center gap-2 pt-1.5 flex-wrap">
      <span className="text-xs text-stone-400 shrink-0">回填得分：</span>
      <input
        type="number"
        value={scoreStr}
        onChange={e => setScoreStr(e.target.value)}
        placeholder="得分"
        min="0"
        className="w-14 border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-400"
      />
      <span className="text-xs text-stone-300">/</span>
      <input
        type="number"
        value={maxStr}
        onChange={e => setMaxStr(e.target.value)}
        placeholder="满分"
        min="1"
        className="w-14 border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-violet-400"
      />
      <button
        onClick={() => valid && onSave(score, max)}
        disabled={!valid}
        className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700 transition-colors"
      >
        记录
      </button>
      <button onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
        取消
      </button>
    </div>
  )
}

// ── RelatedFRQCard ────────────────────────────────────────────────────────────

interface RelatedFRQCardProps {
  userId: string
  conceptIds: string[]
  week: number
  day: number
}

export function RelatedFRQCard({ userId, conceptIds, week, day }: RelatedFRQCardProps) {
  const related = findRelatedFRQ(conceptIds)
  const [open, setOpen] = useState(false)
  const [judgmentEntry, setJudgmentEntry] = useState<FRQEntry | null>(null)
  const [scoringEntry, setScoringEntry] = useState<FRQEntry | null>(null)
  const [frqCompletions, setFrqCompletions] = useState<Map<string, FRQCompletion>>(new Map())
  // Prevents concurrent saves from racing on rapid double-taps of the 记录 button.
  const isSavingRef = useRef(false)

  // Load existing completions for the related FRQs.
  // userId is in deps: if the active user changes the completions must reload.
  const conceptKey = conceptIds.join(',')
  useEffect(() => {
    if (!related.length) return
    if (!userId) return
    repo.getFRQCompletions(userId, related.map(e => e.id)).then(completions => {
      setFrqCompletions(new Map(completions.map(c => [c.frq_id, c])))
    }).catch(console.error)
  }, [conceptKey, userId])

  const handleSaveScore = useCallback(async (entry: FRQEntry, score: number, scoreMax: number) => {
    if (!userId || isSavingRef.current) return
    isSavingRef.current = true
    const completion: FRQCompletion = {
      user_id: userId,
      frq_id: entry.id,
      week,
      day,
      score,
      score_max: scoreMax,
      completed_at: new Date().toISOString(),
    }
    try {
      await repo.saveFRQCompletion(completion)
      setFrqCompletions(prev => new Map(prev).set(entry.id, completion))
      // Only close the form on success — on failure it stays open so the student
      // can retry without losing their entered score.
      setScoringEntry(null)
    } catch (err) {
      console.error('Failed to save FRQ score:', err)
      // Form intentionally stays open; student sees it and can tap 记录 again.
    } finally {
      isSavingRef.current = false
    }
  }, [userId, week, day])

  const confirmAnswer = useCallback((entry: FRQEntry) => {
    window.open(`${entry.sg_pdf}#page=${entry.sg_page ?? 1}`, '_blank', 'noopener,noreferrer')
    setJudgmentEntry(null)
    setScoringEntry(entry)
  }, [])

  if (!related.length) return null

  return (
    <>
      <div className="bg-white dark:bg-stone-800 rounded-xl border border-violet-100 dark:border-violet-900/50 overflow-hidden">
        {/* Collapsible header */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls="frq-card-content"
          className="w-full px-4 py-2.5 flex items-center justify-between bg-violet-50 dark:bg-violet-900/20 hover:brightness-95 transition-all text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-violet-600 text-white">FRQ</span>
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">历年相关真题</span>
            <span className="text-xs text-stone-400 dark:text-stone-500">按今日知识点匹配</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 dark:text-stone-500">{related.length} 题</span>
            <svg
              className={`w-3.5 h-3.5 text-stone-300 dark:text-stone-600 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Rows */}
        {open && (
          <div id="frq-card-content" className="divide-y divide-stone-50 dark:divide-stone-700">
            {related.map(entry => {
              const completion = frqCompletions.get(entry.id)
              const isPassing = completion && completion.score_max > 0 && completion.score / completion.score_max >= 0.6
              const isScoring = scoringEntry?.id === entry.id

              return (
                <div key={entry.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{entry.year}</span>
                        <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">Q{entry.question_number}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600">
                          {frqTypeLabel(entry.frq_type)}
                        </span>
                        {/* Score chip */}
                        {completion && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isPassing ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                            {completion.score}/{completion.score_max}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed line-clamp-2">
                        {entry.text_preview.slice(0, 130)}…
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => window.open(`${entry.frq_pdf}#page=${entry.frq_page}`, '_blank', 'noopener,noreferrer')}
                        className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors font-medium whitespace-nowrap"
                      >
                        查看题目 ↗
                      </button>
                      {entry.sg_pdf && (
                        <button
                          onClick={() => { setScoringEntry(null); setJudgmentEntry(entry) }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-500 dark:text-stone-400 hover:bg-amber-50 hover:text-amber-700 transition-colors whitespace-nowrap"
                        >
                          查看答案
                        </button>
                      )}
                      {completion ? (
                        <button
                          onClick={() => setScoringEntry(isScoring ? null : entry)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-400 dark:text-stone-500 hover:text-violet-600 transition-colors whitespace-nowrap"
                        >
                          修改分数
                        </button>
                      ) : (
                        <button
                          onClick={() => setScoringEntry(isScoring ? null : entry)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-500 dark:text-stone-400 hover:bg-violet-50 hover:text-violet-700 transition-colors whitespace-nowrap"
                        >
                          记录分数
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline score entry form */}
                  {isScoring && (
                    <ScoreEntryInline
                      onSave={(score, max) => handleSaveScore(entry, score, max)}
                      onCancel={() => setScoringEntry(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Moral judgment dialog */}
      {judgmentEntry && (
        <MoralJudgmentDialog
          entry={judgmentEntry}
          onConfirm={() => confirmAnswer(judgmentEntry)}
          onCancel={() => setJudgmentEntry(null)}
        />
      )}
    </>
  )
}
