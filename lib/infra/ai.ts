import type { DailyFeedback, DayStats, QuizQuestion, QuizGrade, ChatMessage } from '@/lib/types'

type AiProvider = 'codex' | 'gemini'
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

interface AiGatewayResponse {
  ok: boolean
  text: string
  parsed_json: unknown | null
  error_type: string | null
}

const AI_API_URL = '/api/ai'
const AI_PROVIDER: AiProvider = 'codex'
const AI_MODEL = 'gpt-5.4-mini'

const AI_PARAMS = {
  dailyFeedback: { reasoning_effort: 'low' as ReasoningEffort, json_mode: true },
  feynmanGrading: { reasoning_effort: 'low' as ReasoningEffort, json_mode: true },
  shortAnswerGrading: { reasoning_effort: 'medium' as ReasoningEffort, json_mode: true },
  chat: { reasoning_effort: 'low' as ReasoningEffort, json_mode: false },
}

async function callAiGateway(
  prompt: string,
  params: { reasoning_effort: ReasoningEffort; json_mode: boolean },
  signal?: AbortSignal,
): Promise<AiGatewayResponse> {
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: AI_PROVIDER,
      model: AI_MODEL,
      reasoning_effort: params.reasoning_effort,
      json_mode: params.json_mode,
      web_search: false,
      prompt,
    }),
  })

  if (!response.ok) throw new Error(`ai-gateway-unavailable:${response.status}`)

  const data = (await response.json()) as AiGatewayResponse
  if (!data.ok) throw new Error(`ai-gateway-unavailable:${data.error_type ?? 'unknown'}`)
  return data
}

function jsonObjectFromResponse(response: AiGatewayResponse): Record<string, unknown> {
  const parsed = isRecord(response.parsed_json) ? response.parsed_json : parseJsonObject(response.text)
  if (!parsed) throw new Error('ai-gateway-invalid-json')
  return parsed
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first === -1 || last <= first) return null
    try {
      const parsed: unknown = JSON.parse(text.slice(first, last + 1))
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function conversationPrompt(
  messages: ChatMessage[],
  system: string,
): string {
  const transcript = messages
    .map(message => `${message.role === 'assistant' ? 'Assistant' : 'Student'}: ${message.content}`)
    .join('\n\n')

  return `${system}

Conversation:
${transcript}

Respond as the assistant.`
}

export const AIService = {
  async getDailyFeedback(
    stats: DayStats,
    ctx: { week: number; day: number },
    signal?: AbortSignal,
  ): Promise<DailyFeedback> {
    const weak = stats.weakConcepts.length > 0 ? stats.weakConcepts.join('、') : '无'
    const prompt = `你是 AP 化学学习教练。学生完成了 Week ${ctx.week} Day ${ctx.day}。
数据：通过率 ${Math.round(stats.passRate * 100)}%（通过 ${stats.passedCount} / 批改 ${stats.gradedCount}），薄弱知识点：${weak}。

请用中文给出简短鼓励性反馈，格式为纯 JSON（无额外文字）：
{"strength":"做得好的地方（1句）","note":"需注意或建议（1句，若无填空字符串）","preview":"明天的预告（1句，若无填空字符串）"}`

    try {
      const response = await callAiGateway(prompt, AI_PARAMS.dailyFeedback, signal)
      const parsed = jsonObjectFromResponse(response)
      return {
        strength: stringValue(parsed.strength, '今日学习完成'),
        note: stringValue(parsed.note),
        preview: stringValue(parsed.preview),
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      console.error('AI feedback error:', err)
      return { strength: '今日学习已完成', note: '', preview: '' }
    }
  },

  async gradeAnswer(
    question: QuizQuestion,
    studentAnswer: string,
    signal?: AbortSignal,
  ): Promise<QuizGrade> {
    if (question.type === 'mcq') {
      const correct = studentAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase()
      return { correct, feedback: question.explanation }
    }

    if (question.type === 'fill') {
      const normalize = (s: string) =>
        s.trim().toLowerCase().replace(/[，,；;\s]+/g, '|')
      return {
        correct: normalize(studentAnswer) === normalize(question.answer),
        feedback: question.explanation,
      }
    }

    if (question.type === 'feynman') {
      const prompt = `你是 AP 化学学习助手。评估学生用费曼技巧解释化学概念的质量。
返回纯 JSON：{"correct":true/false,"feedback":"2-3句反馈：肯定理解准确之处，指出可以更清晰或补充的地方"}
correct=true 表示学生展示了对核心概念的真实理解（不必完美）。

题目：${question.question}
参考要点：${question.answer}
评估标准：${question.grading_rubric}
<student_answer>${studentAnswer.slice(0, 2000)}</student_answer>`

      const response = await callAiGateway(prompt, AI_PARAMS.feynmanGrading, signal)
      const parsed = jsonObjectFromResponse(response)
      return {
        correct: boolValue(parsed.correct, true),
        feedback: stringValue(parsed.feedback, question.explanation),
      }
    }

    const prompt = `你是 AP 化学评分助手。只评分，不教学。
返回纯 JSON，格式：{"correct":true/false,"feedback":"1句反馈"}

题目：${question.question}
正确答案：${question.answer}
评分要点：${question.grading_rubric}
<student_answer>${studentAnswer.slice(0, 2000)}</student_answer>

判断是否正确，给出1句反馈。`

    const response = await callAiGateway(prompt, AI_PARAMS.shortAnswerGrading, signal)
    const parsed = jsonObjectFromResponse(response)
    return {
      correct: boolValue(parsed.correct, false),
      feedback: stringValue(parsed.feedback, question.explanation),
    }
  },

  async chat(
    messages: ChatMessage[],
    questionContext: QuizQuestion,
    signal?: AbortSignal,
  ): Promise<string> {
    const system = `你是 AP 化学学习助手。学生刚完成了一道题，正在向你提问。
只针对以下题目内容回答，不回答其他话题。
题目：${questionContext.question}
正确答案：${questionContext.answer}
解析：${questionContext.explanation}
用中文回答，简洁（2-4句）。`

    try {
      const response = await callAiGateway(conversationPrompt(messages, system), AI_PARAMS.chat, signal)
      return response.text
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      console.error('chat error:', err)
      return '抱歉，AI 暂时无法响应，请稍后重试。'
    }
  },
}
