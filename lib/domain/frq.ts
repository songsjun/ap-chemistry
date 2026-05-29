import frqMap from '@/data/frq_map.json'

export interface FRQEntry {
  id: string
  year: number
  question_number: number
  frq_type: string
  frq_pdf: string
  frq_page: number
  sg_pdf?: string
  sg_page?: number
  concepts: string[]
  text_preview: string
}

const ALL_QUESTIONS: FRQEntry[] = frqMap.questions as FRQEntry[]

export function findRelatedFRQ(conceptIds: string[]): FRQEntry[] {
  if (!conceptIds.length) return []
  const set = new Set(conceptIds)
  const scored = ALL_QUESTIONS.map(q => ({
    q,
    score: q.concepts.filter(c => set.has(c)).length,
  }))
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.q.year - a.q.year)
    .map(x => x.q)
    .slice(0, 6)
}

export function frqTypeLabel(frq_type: string): string {
  const map: Record<string, string> = {
    long_answer: '长答题（Section II Part A）',
    short_answer: '短答题（Section II Part B）',
  }
  return map[frq_type] ?? frq_type
}
