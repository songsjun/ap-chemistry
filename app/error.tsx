'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="bg-white border border-stone-200 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-stone-800 text-sm">应用加载失败</p>
          <p className="text-xs text-stone-500 mt-1">{error.message || '请检查网络连接后重试'}</p>
        </div>
        <button
          onClick={reset}
          className="w-full py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  )
}
