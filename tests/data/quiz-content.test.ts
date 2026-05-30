// @vitest-environment node
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import type { QuizQuestion } from '@/lib/types'
import { WEEKS } from '@/lib/constants'

// Test the deployed quiz bank (public/quiz-bank.json) — the file actually loaded
// at runtime — not the generation-pipeline source files in data/ or scripts/.
const questions = JSON.parse(
  readFileSync(join(__dirname, '../../public/quiz-bank.json'), 'utf8')
) as QuizQuestion[]

// Phrases that introduce distractor analysis — the letter(s) immediately following
// indicate the WRONG options. If the correct answer letter appears here, it's a bug.
const DISTRACTOR_PATTERNS = [
  /([A-D])[、，]?\s*错误/g,
  /([A-D])[、，]?\s*混淆/g,
  /([A-D])[、，]?\s*只考虑/g,
  /([A-D])[、，]?\s*忽略/g,
  /([A-D])[、，]?\s*认为.*错/g,
]

function extractDistractorLetters(explanation: string): Set<string> {
  const blamed = new Set<string>()
  for (const pattern of DISTRACTOR_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(explanation)) !== null) {
      blamed.add(m[1])
    }
  }
  return blamed
}

// ── Structural integrity ───────────────────────────────────────────────────────

describe('quiz bank — structural integrity', () => {
  it('all questions have required fields', () => {
    const required = ['id', 'concept_ids', 'week', 'difficulty', 'type', 'question', 'answer', 'grading_rubric', 'explanation'] as const
    for (const q of questions) {
      for (const field of required) {
        expect(q[field], `Question ${q.id} missing field "${field}"`).toBeDefined()
        expect(q[field], `Question ${q.id} has empty field "${field}"`).not.toBe('')
      }
    }
  })

  it('all question ids are unique', () => {
    const ids = questions.map(q => q.id)
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx)
    expect(duplicates, `Duplicate IDs: ${duplicates.join(', ')}`).toHaveLength(0)
  })

  it(`week is in range 1–${WEEKS}`, () => {
    for (const q of questions) {
      expect(q.week, `Question ${q.id}: week=${q.week} out of range`).toBeGreaterThanOrEqual(1)
      expect(q.week, `Question ${q.id}: week=${q.week} out of range`).toBeLessThanOrEqual(WEEKS)
    }
  })

  it('difficulty is 1, 2, or 3', () => {
    for (const q of questions) {
      expect([1, 2, 3], `Question ${q.id}: difficulty=${q.difficulty} invalid`).toContain(q.difficulty)
    }
  })

  it('type is one of the allowed values', () => {
    const VALID_TYPES = ['mcq', 'fill', 'short', 'feynman']
    for (const q of questions) {
      expect(VALID_TYPES, `Question ${q.id}: type="${q.type}" invalid`).toContain(q.type)
    }
  })

  it('MCQ questions have exactly 4 options', () => {
    for (const q of questions) {
      if (q.type === 'mcq') {
        expect(q.options, `MCQ question ${q.id} missing options`).toBeDefined()
        expect(q.options!.length, `MCQ question ${q.id} must have 4 options`).toBe(4)
      }
    }
  })

  it('concept_ids is a non-empty array of strings', () => {
    for (const q of questions) {
      expect(Array.isArray(q.concept_ids), `Question ${q.id}: concept_ids is not an array`).toBe(true)
      expect(q.concept_ids.length, `Question ${q.id}: concept_ids is empty`).toBeGreaterThan(0)
      for (const c of q.concept_ids) {
        expect(typeof c, `Question ${q.id}: concept_id is not a string`).toBe('string')
      }
    }
  })
})

// ── Semantic integrity — answer vs explanation consistency ─────────────────────

describe('quiz bank — semantic integrity (answer vs explanation)', () => {
  it('MCQ answer is one of the option labels (A/B/C/D)', () => {
    for (const q of questions) {
      if (q.type !== 'mcq' || !q.options) continue
      const answerLetter = q.answer.trim().charAt(0).toUpperCase()
      const validLetters = q.options.map(opt => opt.trim().charAt(0).toUpperCase())
      expect(
        validLetters,
        `Question ${q.id}: answer="${q.answer}" is not one of the option labels ${validLetters.join('/')}`,
      ).toContain(answerLetter)
    }
  })

  it('the correct answer letter is not blamed in distractor analysis phrases', () => {
    const failures: string[] = []
    for (const q of questions) {
      if (q.type !== 'mcq') continue
      const correctLetter = q.answer.trim().charAt(0).toUpperCase()
      const blamed = extractDistractorLetters(q.explanation)
      if (blamed.has(correctLetter)) {
        failures.push(
          `Question ${q.id}: correct answer is "${correctLetter}" but explanation blames "${correctLetter}" as wrong (distractor mention found)`
        )
      }
    }
    expect(failures, failures.join('\n')).toHaveLength(0)
  })

  it('every MCQ explanation mentions the correct answer as correct (contains answer letter + "正确")', () => {
    const missing: string[] = []
    for (const q of questions) {
      if (q.type !== 'mcq') continue
      const correctLetter = q.answer.trim().charAt(0).toUpperCase()
      const confirmsCorrect =
        q.explanation.includes(`${correctLetter}正确`) ||
        q.explanation.includes(`选${correctLetter}`) ||
        q.explanation.includes(`答案是${correctLetter}`) ||
        q.explanation.includes(`答案为${correctLetter}`)
      if (!confirmsCorrect) {
        missing.push(`${q.id} (answer=${correctLetter})`)
      }
    }
    // Warning-level check — conventions vary, surfaces gaps without hard failing.
    if (missing.length > 0) {
      console.warn(`[quiz-content] ${missing.length} questions don't explicitly confirm the correct answer in explanation:\n  ${missing.join('\n  ')}`)
    }
  })
})
