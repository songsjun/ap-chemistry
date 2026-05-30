// ── FlowState: output of LearningFlow, UI rendering basis ──
export type FlowState =
  | { phase: 'LOCKED' }
  | { phase: 'PRESENTING'; resource: Resource; slot: number; total: number }
  | { phase: 'REMEDIATION'; resources: Resource[]; slot: number; total: number }
  | { phase: 'NEEDS_RETRY' }
  | { phase: 'COMPLETE'; passRate: number | null }

// ── Command: the only operations Presentation layer can emit ──
export type Command =
  | { type: 'COMPLETE_RESOURCE'; resourceId: string; result: CompletionResult }
  | { type: 'SKIP_RESOURCE'; resourceId: string }
  | { type: 'REQUEST_FEEDBACK' }
  | { type: 'FORCE_ADVANCE' }
  /** Reset all failed A resources back to 'skipped' so computeFlowState re-presents
   *  them in PRESENTING phase, giving the student a genuine retry opportunity. */
  | { type: 'RESET_FAILED_RESOURCES' }

// ── DayMode: affects LearningFlow decision logic ──
export type DayMode = 'STANDARD' | 'REVIEW'

// ── DaySnapshot: input to LearningFlow, built by assembleDaySnapshot ──
export interface DaySnapshot {
  isUnlocked: boolean
  mode: DayMode
  aResources: Resource[]
  completions: Map<string, Completion>
  bCandidates: Resource[]
  bTotalForSession: number
  forceCompleted?: boolean  // set in-session by forceAdvance(); not persisted
}

// ── DayStats: read output of ProgressTracker ──
export interface DayStats {
  passRate: number
  passedCount: number
  failedCount: number
  gradedCount: number
  totalACount: number
  weakConcepts: string[]
  seenResourceIds: Set<string>
}

// ── Resource: content library item ──
export interface Resource {
  id: string
  title: string
  url: string | null
  answer_url?: string
  description?: string
  adapter_type: 'external_manual' | 'observation'
  type: string
  platform: string
  tier: 'A' | 'B' | 'C'
  phase: 'LEARN' | 'PRACTICE'
  estimated_minutes: number
  concepts: string[]
  week: number
  day: number
  slot_order: number
}

// ── KnowledgePoint: curriculum node ──
export interface KnowledgePoint {
  id: string
  name_zh: string
  name_en: string
  unit: number
  ced_topic: string
  prerequisites: string[]
  openstax_sections: string[]
  week: number
  day: number
  alberta_tags: ('chem20' | 'chem30')[]
}

// ── Completion: persisted user record ──
export interface Completion {
  user_id: string
  resource_id: string
  status: 'passed' | 'failed' | 'skipped'
  score?: number
  score_max?: number
  ai_feedback?: string
  completed_at: string
}

// ── CompletionResult: unified output from adapter components ──
export interface CompletionResult {
  status: 'passed' | 'failed' | 'skipped'
  score?: number
  score_max?: number
  ai_feedback?: string
}

// ── AI output types ──
export interface GradeResult {
  status: 'passed' | 'failed'
  step_errors: string[]
  feedback: string
}

export interface DailyFeedback {
  strength: string
  note: string
  preview: string
}

// ── DB meta record ──
export interface MetaRecord {
  key: string
  value: string
}

// ── Progress snapshot for dashboard ──
export interface ProgressSnapshot {
  completedDays: Array<{ week: number; day: number; passRate: number }>
  currentWeek: number
  currentDay: number
}

// ── Quiz system ──

export interface QuizQuestion {
  id: string
  concept_ids: string[]        // matches KnowledgePoint.id values
  week: number                 // suggested week (for filtering)
  difficulty: 1 | 2 | 3       // 1=basic recall, 2=application, 3=synthesis
  type: 'mcq' | 'fill' | 'short' | 'feynman'
  question: string
  options?: [string, string, string, string]  // MCQ only
  answer: string               // correct answer text
  grading_rubric: string       // hint for AI grader
  explanation: string          // shown after answering
}

export interface QuizResult {
  id: string                   // `${user_id}-${question_id}-${answered_at}`
  user_id: string
  question_id: string
  concept_ids: string[]        // copied from question for fast querying
  week: number
  day: number
  correct: boolean
  student_answer: string
  answered_at: string
  question_type?: QuizQuestion['type']  // undefined for legacy records — treat as non-feynman
  difficulty?: 1 | 2 | 3               // copied from question; undefined for legacy records
}

export interface FRQCompletion {
  user_id: string
  frq_id: string
  week: number
  day: number
  score: number
  score_max: number
  completed_at: string
}

export interface QuizGrade {
  correct: boolean
  feedback: string             // 1-2 sentence explanation
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
