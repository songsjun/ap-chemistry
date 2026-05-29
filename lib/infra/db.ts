import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Resource, KnowledgePoint, Completion, MetaRecord, QuizQuestion, QuizResult, FRQCompletion } from '@/lib/types'

export interface DayUnlock {
  user_id: string
  week: number
  day: number
  unlocked_at: string
}

export interface AppDB extends Dexie {
  resources: EntityTable<Resource, 'id'>
  knowledge_points: EntityTable<KnowledgePoint, 'id'>
  completions: Table<Completion>
  day_unlocks: Table<DayUnlock>
  meta: EntityTable<MetaRecord, 'key'>
  quiz_questions: EntityTable<QuizQuestion, 'id'>
  quiz_results: Table<QuizResult>
  frq_completions: Table<FRQCompletion>
}

let _db: AppDB | null = null

export function getDb(): AppDB {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in browser')
  }
  if (!_db) {
    _db = new Dexie('ChemistryLearningDB') as AppDB
    _db.version(1).stores({
      resources: 'id, week, day, tier, adapter_type, *concepts',
      knowledge_points: 'id, week, day',
      completions: '[user_id+resource_id], user_id, status',
      day_unlocks: '[user_id+week+day], user_id',
      meta: 'key',
    })
    _db.version(2).stores({
      resources: 'id, week, day, tier, adapter_type, *concepts',
      knowledge_points: 'id, week, day',
      completions: '[user_id+resource_id], user_id, status',
      day_unlocks: '[user_id+week+day], user_id',
      meta: 'key',
      quiz_questions: 'id, *concept_ids, week, difficulty, type',
      quiz_results: 'id, [user_id+week+day], user_id, week, day, *concept_ids',
    })
    // v3: add compound indexes for common query patterns
    _db.version(3).stores({
      resources: 'id, week, day, tier, adapter_type, *concepts, [week+day], [week+day+tier]',
      knowledge_points: 'id, week, day, [week+day]',
      completions: '[user_id+resource_id], user_id, status',
      day_unlocks: '[user_id+week+day], user_id',
      meta: 'key',
      quiz_questions: 'id, *concept_ids, week, difficulty, type',
      quiz_results: 'id, [user_id+week+day], user_id, week, day, *concept_ids',
    })
    _db.version(4).stores({
      resources: 'id, week, day, tier, adapter_type, *concepts, [week+day], [week+day+tier]',
      knowledge_points: 'id, week, day, [week+day]',
      completions: '[user_id+resource_id], user_id, status',
      day_unlocks: '[user_id+week+day], user_id',
      meta: 'key',
      quiz_questions: 'id, *concept_ids, week, difficulty, type',
      quiz_results: 'id, [user_id+week+day], user_id, week, day, *concept_ids',
      frq_completions: '[user_id+frq_id], user_id, [user_id+week+day]',
    })
  }
  return _db
}
