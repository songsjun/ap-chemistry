'use client'

import { useEffect, useRef, useState } from 'react'
import { selectDailyQuestions } from '@/lib/app/quiz'
import { DAILY_CHALLENGE_QUESTION_COUNT } from '@/lib/constants'
import { AIService } from '@/lib/infra/ai'
import { repo } from '@/lib/repository'
import type { QuizQuestion, QuizResult, QuizGrade, ChatMessage } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizPhase = 'loading' | 'question' | 'grading' | 'result' | 'chat' | 'summary'

interface QuizPanelProps {
  userId: string
  week: number
  day: number
  conceptIds: string[]
  onComplete: (results: QuizResult[]) => void
  onExit: () => void
}

// ── Local grading for objective question types ────────────────────────────────

function gradeLocal(q: QuizQuestion, answer: string): QuizGrade {
  if (q.type === 'mcq') {
    return {
      correct: answer.trim().toLowerCase() === q.answer.trim().toLowerCase(),
      feedback: q.explanation,
    }
  }
  // fill: normalize whitespace and common CJK punctuation
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[，,；;\s]+/g, '|')
  return {
    correct: normalize(answer) === normalize(q.answer),
    feedback: q.explanation,
  }
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin" />
    </div>
  )
}

// ── QuizPanel ─────────────────────────────────────────────────────────────────

export function QuizPanel({ userId, week, day, conceptIds, onComplete, onExit }: QuizPanelProps) {
  const [phase, setPhase] = useState<QuizPhase>('loading')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [grade, setGrade] = useState<QuizGrade | null>(null)
  const [sessionResults, setSessionResults] = useState<QuizResult[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const mountedRef = useRef(true)
  const submittingRef = useRef(false)
  // Holds the AbortController for an in-flight AI grading call so that it can be
  // cancelled on unmount. Without this, the fetch would continue running in the
  // background after the component unmounts, consuming an API credit on every
  // unmount-during-grading event (e.g. navigating away while AI is thinking).
  const gradingACRef = useRef<AbortController | null>(null)

  // Load questions — cancelled flag prevents stale setState after fast
  // prop changes or React StrictMode double-invoke.
  useEffect(() => {
    let cancelled = false
    if (!userId) { onExit(); return }
    selectDailyQuestions(userId, week, day, conceptIds, DAILY_CHALLENGE_QUESTION_COUNT)
      .then(qs => {
        if (cancelled) return
        if (qs.length === 0) { onExit(); return }
        setQuestions(qs)
        setPhase('question')
      })
      .catch(err => { if (!cancelled) { console.error(err); onExit() } })
    return () => { cancelled = true }
  }, [week, day, conceptIds, onExit, userId])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Cancel any in-flight AI grading call to prevent ghost fetches after unmount.
      gradingACRef.current?.abort()
      gradingACRef.current = null
    }
  }, [])

  async function handleSubmit() {
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      const q = questions[currentIdx]
      const userAnswer = q.type === 'mcq' ? (selectedOption ?? '') : answer.trim()
      if (!userAnswer) return

      let g: QuizGrade

      if (q.type === 'mcq' || q.type === 'fill') {
        // Objective: grade instantly, show result immediately, save in background
        g = gradeLocal(q, userAnswer)
        if (!mountedRef.current) return
        setGrade(g)
        setPhase('result')
        if (userId) {
          // Capture a single timestamp so `id` and `answered_at` are always
          // consistent — two separate `new Date()` calls can diverge if a
          // microtask runs between them.
          const answeredAt = new Date().toISOString()
          const result: QuizResult = {
            id: `${userId}-${q.id}-${answeredAt}`,
            user_id: userId,
            question_id: q.id,
            concept_ids: q.concept_ids,
            week,
            day,
            correct: g.correct,
            student_answer: userAnswer,
            answered_at: answeredAt,
            question_type: q.type,
            difficulty: q.difficulty,
          }
          repo.saveQuizResult(result).catch(console.error)
          setSessionResults(prev => [...prev, result])
        }
        return
      }

      // Subjective (short / feynman): show spinner and call AI.
      // Use an AbortController so the in-flight fetch is cancelled when the
      // 15 s timeout fires or the component unmounts — without this the ghost
      // fetch would continue in the background and consume a full API credit.
      let gradingSucceeded = true
      setPhase('grading')
      const gradingAC = new AbortController()
      gradingACRef.current = gradingAC
      g = await Promise.race([
        AIService.gradeAnswer(q, userAnswer, gradingAC.signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => { gradingAC.abort(); reject(new Error('grading timeout')) }, 15_000)
        ),
      ]).catch((err: unknown) => {
        gradingSucceeded = false
        const noApiKey = err instanceof Error && err.message === 'no-api-key'
        return {
          correct: false,
          feedback: noApiKey
            ? '此题需要 AI 批改。请前往「设置」页配置 Claude API Key 后重试。'
            : q.explanation || '批改超时，请参考题目说明。',
        }
      })

      gradingACRef.current = null
      if (!mountedRef.current) return
      setGrade(g)
      // Don't persist a timeout/error result — it would incorrectly mark the student wrong
      if (gradingSucceeded) {
        if (userId) {
          const answeredAt = new Date().toISOString()
          const result: QuizResult = {
            id: `${userId}-${q.id}-${answeredAt}`,
            user_id: userId,
            question_id: q.id,
            concept_ids: q.concept_ids,
            week,
            day,
            correct: g.correct,
            student_answer: userAnswer,
            answered_at: answeredAt,
            question_type: q.type,
            difficulty: q.difficulty,
          }
          await repo.saveQuizResult(result).catch(console.error)
          setSessionResults(prev => [...prev, result])
        }
      }
      setPhase('result')
    } finally {
      submittingRef.current = false
    }
  }

  function handleNext() {
    if (currentIdx + 1 >= questions.length) {
      setPhase('summary')
    } else {
      setCurrentIdx(i => i + 1)
      setAnswer('')
      setSelectedOption(null)
      setGrade(null)
      setChatMessages([])
      setPhase('question')
    }
  }

  async function handleChat() {
    if (!chatInput.trim() || !grade) return
    const q = questions[currentIdx]
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const reply = await AIService.chat(newMessages, q)
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch { /* ignore */ } finally {
      setChatLoading(false)
    }
  }

  // ── Render: loading ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-stone-100 rounded w-1/4" />
          <div className="h-4 bg-stone-100 rounded w-full" />
          <div className="h-4 bg-stone-100 rounded w-3/4" />
        </div>
      </div>
    )
  }

  // ── Render: summary ──────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const regularResults = sessionResults.filter(r => r.question_type !== 'feynman')
    const feynmanResult = sessionResults.find(r => r.question_type === 'feynman')
    const correct = regularResults.filter(r => r.correct).length
    const total = regularResults.length
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-lg">✦</p>
          <p className="text-sm font-semibold text-stone-800">挑战完成！</p>
          <p className="text-xs text-stone-500">
            {correct} / {total} 正确
            {feynmanResult && ' · 费曼反思已完成'}
          </p>
        </div>
        {/* Progress bar */}
        <div className="flex gap-1">
          {sessionResults.map((r, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${r.correct ? 'bg-emerald-400' : 'bg-red-300'}`}
            />
          ))}
        </div>
        <button
          onClick={() => onComplete(sessionResults)}
          className="w-full py-2 text-sm text-stone-500 hover:text-stone-700 border border-stone-200 rounded-lg transition-colors"
        >
          关闭
        </button>
      </div>
    )
  }

  const q = questions[currentIdx]
  const isLast = currentIdx + 1 >= questions.length

  // ── Render: question ─────────────────────────────────────────────────────────
  if (phase === 'question') {
    const hasAnswer = q.type === 'mcq' ? selectedOption !== null : answer.trim().length > 0
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
        {/* Progress */}
        <p className="text-xs text-stone-400">{currentIdx + 1} / {questions.length}</p>

        {/* Question */}
        <p className="text-sm font-medium text-stone-800">{q.question}</p>

        {/* MCQ options */}
        {q.type === 'mcq' && q.options && (
          <div role="radiogroup" aria-label="选择答案" className="space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={selectedOption === opt}
                onClick={() => setSelectedOption(opt)}
                className={`w-full text-left text-sm rounded-lg py-2 px-3 border transition-colors ${
                  selectedOption === opt
                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                    : 'border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Fill answer */}
        {q.type === 'fill' && (
          <input
            type="text"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && hasAnswer) handleSubmit() }}
            placeholder="输入答案…"
            className="border border-stone-200 rounded-lg p-2 w-full text-sm focus:outline-none focus:border-blue-400"
          />
        )}

        {/* Short / Feynman answer */}
        {(q.type === 'short' || q.type === 'feynman') && (
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={q.type === 'feynman' ? '用自己的话解释这个概念，就像在教一个完全不懂的人…' : '输入答案…'}
            rows={q.type === 'feynman' ? 5 : 3}
            className="border border-stone-200 rounded-lg p-2 w-full text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={onExit}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            退出
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasAnswer}
            className={`text-sm rounded-lg py-2 px-4 transition-colors ${
              hasAnswer
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-stone-100 text-stone-300 cursor-not-allowed'
            }`}
          >
            提交
          </button>
        </div>
      </div>
    )
  }

  // ── Render: grading ──────────────────────────────────────────────────────────
  if (phase === 'grading') {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <Spinner />
        <p className="text-xs text-center text-stone-400">AI 正在批改…</p>
      </div>
    )
  }

  // ── Render: result ───────────────────────────────────────────────────────────
  if (phase === 'result' && grade) {
    const userAnswer = q.type === 'mcq' ? (selectedOption ?? '') : answer.trim()
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
        {/* Progress */}
        <p className="text-xs text-stone-400">{currentIdx + 1} / {questions.length}</p>

        {/* Result badge */}
        {q.type === 'feynman' ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
            费曼反思
          </div>
        ) : (
          <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            grade.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {grade.correct ? '✓ 正确' : '✕ 错误'}
          </div>
        )}

        {/* Student answer */}
        <div>
          <p className="text-xs text-stone-400">你的回答</p>
          <p className="text-sm text-stone-700 mt-0.5">{userAnswer}</p>
        </div>

        {/* Correct answer (if wrong) */}
        {!grade.correct && (
          <div>
            <p className="text-xs text-stone-400">正确答案</p>
            <p className="text-sm text-emerald-700 mt-0.5">{q.answer}</p>
          </div>
        )}

        {/* Explanation / feedback */}
        <p className="text-sm text-stone-600">{grade.feedback}</p>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setPhase('chat')}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            继续追问 AI →
          </button>
          <button
            onClick={handleNext}
            className="text-sm bg-stone-800 text-white rounded-lg py-2 px-4 hover:bg-stone-700 transition-colors"
          >
            {isLast ? '查看总结 →' : '下一题 →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: chat ─────────────────────────────────────────────────────────────
  if (phase === 'chat') {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
        {/* Back link */}
        <button
          onClick={() => setPhase('result')}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          ← 回到题目
        </button>

        {/* Message list */}
        <div className="max-h-64 overflow-y-auto space-y-2 py-1">
          {chatMessages.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-4">向 AI 提问关于这道题的任何问题</p>
          )}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`text-xs rounded-lg px-3 py-2 max-w-[85%] ${
                msg.role === 'user'
                  ? 'ml-auto bg-blue-50 text-blue-800'
                  : 'mr-auto bg-stone-50 text-stone-700'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div className="mr-auto bg-stone-50 text-stone-400 text-xs rounded-lg px-3 py-2 max-w-[85%] animate-pulse">
              AI 正在思考…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) handleChat() }}
            placeholder="提问…"
            className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleChat}
            disabled={chatLoading || !chatInput.trim()}
            className={`text-xs rounded-lg px-3 py-2 transition-colors ${
              chatLoading || !chatInput.trim()
                ? 'bg-stone-100 text-stone-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            发送
          </button>
        </div>

        {/* Next question always visible */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleNext}
            className="text-sm bg-stone-800 text-white rounded-lg py-2 px-4 hover:bg-stone-700 transition-colors"
          >
            {isLast ? '查看总结 →' : '下一题 →'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
