import type { Resource, KnowledgePoint, Completion, QuizQuestion, QuizResult, FRQCompletion } from '@/lib/types'

export interface IRepository {
  getResources(week: number, day: number, tier: 'A' | 'B' | 'C'): Promise<Resource[]>
  getBResources(conceptIds: string[], seenIds: Set<string>): Promise<Resource[]>
  getKnowledgePoint(id: string): Promise<KnowledgePoint | null>
  getCompletions(userId: string, week: number, day: number): Promise<Completion[]>
  getAllUserCompletions(userId: string): Promise<Completion[]>
  getCompletionsByResourceIds(userId: string, resourceIds: Set<string>): Promise<Completion[]>
  transact(fn: () => Promise<void>): Promise<void>
  saveCompletion(completion: Completion): Promise<void>
  isDayUnlocked(userId: string, week: number, day: number): Promise<boolean>
  unlockDay(userId: string, week: number, day: number): Promise<void>
  getUnlockedDays(userId: string): Promise<Array<{ week: number; day: number }>>
  getAllResources(): Promise<Resource[]>
  getAllDayResources(week: number, day: number): Promise<Resource[]>
  getKnowledgePoints(ids: string[]): Promise<KnowledgePoint[]>
  getQuizQuestions(conceptIds: string[], seenIds: Set<string>): Promise<QuizQuestion[]>
  saveQuizResult(result: QuizResult): Promise<void>
  getQuizResultsForDay(userId: string, week: number, day: number): Promise<QuizResult[]>
  getAllQuizResultsForUser(userId: string): Promise<QuizResult[]>
  saveFRQCompletion(completion: FRQCompletion): Promise<void>
  getFRQCompletions(userId: string, frqIds: string[]): Promise<FRQCompletion[]>
  getAllFRQCompletionsForUser(userId: string): Promise<FRQCompletion[]>
}
