/**
 * App-wide singleton readiness gate.
 *
 * ensureAppReady() seeds IndexedDB and unlocks Week 1 Day 1 exactly once,
 * no matter how many components call it concurrently. Every caller awaits
 * the same Promise, so page-level data loads never race against seeding.
 *
 * If initialisation fails the cached Promise is cleared so the next call
 * can retry rather than permanently poisoning every future caller.
 */

import { StorageService } from '@/lib/infra/storage'
import { seedContentLibrary } from '@/lib/infra/seed'
import { seedQuizBank } from '@/lib/infra/seed-quiz'
import { repo } from '@/lib/repository'

let _ready: Promise<void> | null = null

async function bootstrap(): Promise<void> {
  // userId must be initialised before unlock so the record is stamped
  // with the correct owner.
  const userId = StorageService.userId.init()

  // Seeds can run in parallel — neither depends on the other.
  await Promise.all([seedContentLibrary(), seedQuizBank()])

  // Unlock must follow seeding so the day record exists in the DB.
  await repo.unlockDay(userId, 1, 1)

  // Request persistent storage to prevent Safari ITP clearing IndexedDB.
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    await navigator.storage.persist()
  }
}

export function ensureAppReady(): Promise<void> {
  if (!_ready) {
    _ready = bootstrap().catch(err => {
      _ready = null  // allow retry on next call
      throw err
    })
  }
  return _ready
}
