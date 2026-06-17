'use client'

import { useEffect, useState } from 'react'

import { ensureAppReady } from '@/lib/app/ready'
import { StorageService } from '@/lib/infra/storage'

interface StudentSession {
  id: string
  displayName: string | null
}

type AuthState =
  | { status: 'checking' }
  | { status: 'authenticated'; student: StudentSession }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

async function fetchSession(): Promise<StudentSession | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Unable to check session')
  const data = await response.json() as { student?: StudentSession }
  return data.student ?? null
}

async function login(accessCode: string): Promise<StudentSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  })
  if (response.status === 401) throw new Error('Access code is invalid.')
  if (!response.ok) throw new Error('Unable to sign in.')
  const data = await response.json() as { student: StudentSession }
  return data.student
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })
  const [accessCode, setAccessCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchSession()
      .then(async student => {
        if (cancelled) return
        if (!student) {
          StorageService.userId.clear()
          setState({ status: 'unauthenticated' })
          return
        }
        StorageService.userId.save(student.id)
        await ensureAppReady()
        if (!cancelled) setState({ status: 'authenticated', student })
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setState({ status: 'error', message: '无法连接本地学习数据库，请检查服务配置。' })
      })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = accessCode.trim()
    if (!code || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const student = await login(code)
      StorageService.userId.save(student.id)
      await ensureAppReady()
      setState({ status: 'authenticated', student })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  if (state.status === 'authenticated') return <>{children}</>

  if (state.status === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-6">
          <div className="h-3 w-28 rounded bg-stone-200 dark:bg-stone-700 animate-pulse" />
          <div className="mt-4 h-10 rounded bg-stone-100 dark:bg-stone-700 animate-pulse" />
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-red-100 dark:border-red-900/40 bg-white dark:bg-stone-800 p-6 text-center">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">初始化失败</p>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{state.message}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">AP Chemistry</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">请输入老师提供的 access code。</p>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Access Code</span>
          <input
            value={accessCode}
            onChange={event => setAccessCode(event.target.value)}
            autoComplete="one-time-code"
            className="mt-2 w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="CHEM-..."
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !accessCode.trim()}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {submitting ? '验证中...' : '进入学习'}
        </button>
      </form>
    </main>
  )
}
