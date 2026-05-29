'use client'

interface ChallengePromptProps {
  week: number
  day: number
  onStart: () => void
  onSkip: () => void
  questionCount: number
}

export function ChallengePrompt({ onStart, onSkip, questionCount }: ChallengePromptProps) {
  if (questionCount === 0) return null

  const estimatedSecs = questionCount * 45

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">⚡</span>
        <span className="text-sm font-medium text-stone-700">知识掌握检测</span>
      </div>
      <div>
        <p className="text-xs text-stone-400">今日学到的概念，还记得吗？</p>
        <p className="text-xs text-stone-400 mt-0.5">{questionCount} 道题 · 约 {estimatedSecs} 秒</p>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onStart}
          className="bg-stone-800 text-white text-sm rounded-lg py-2 px-4 hover:bg-stone-700 transition-colors"
        >
          开始挑战
        </button>
        <button
          onClick={onSkip}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          明天再说 →
        </button>
      </div>
    </div>
  )
}
