import { repo } from '@/lib/repository'
import { assembleDaySnapshot } from '@/lib/app/snapshot'
import { computeFlowState, shouldUnlock } from '@/lib/domain/flow'
import { tracker } from '@/lib/domain/progress'
import { calcAttemptedPassRate } from '@/lib/domain/scoring'
import { AIService } from '@/lib/infra/ai'
import { DAYS_PER_WEEK, WEEKS } from '@/lib/constants'
import type { Command, FlowState, DaySnapshot, DailyFeedback, DayStats } from '@/lib/types'

function nextDay(week: number, day: number): [number, number] {
  if (day < DAYS_PER_WEEK) return [week, day + 1]
  if (week < WEEKS) return [week + 1, 1]
  return [week, day]
}

export class DaySessionManager {
  private currentSnapshot: DaySnapshot | null = null
  private userId: string = ''
  /** Routing fields — written synchronously at the START of load(), before any await.
   *  Use only for routing new DB calls (execute, forceAdvance). Never read them in
   *  requestFeedback, which runs concurrently and needs the *committed* week/day. */
  private week: number = 0
  private day: number = 0
  /** Committed fields — written only after assembleDaySnapshot resolves and the
   *  loadGen check passes, i.e. they always reflect the successfully loaded day.
   *  requestFeedback() uses these so a concurrent load(B) that overwrites `week/day`
   *  before requestFeedback begins cannot cause it to query the wrong day's stats. */
  private currentWeek: number = 0
  private currentDay: number = 0
  private bTotalForSession: number = 0
  /** Monotonically-increasing counter; used to discard stale load() results on
   *  fast day-to-day navigation so currentSnapshot never reflects the wrong day. */
  private loadGen = 0

  async load(userId: string, week: number, day: number): Promise<FlowState> {
    this.userId = userId
    this.week = week
    this.day = day
    const myGen = ++this.loadGen
    const snapshot = await assembleDaySnapshot(userId, week, day)
    // If a newer load() was issued while we awaited, discard this stale result.
    // The context's `cancelled` flag already prevents the return value from being
    // used, but we must also not commit to this.currentSnapshot.
    if (myGen !== this.loadGen) return computeFlowState(snapshot)
    this.currentWeek = week
    this.currentDay = day
    this.bTotalForSession = snapshot.bCandidates.length
    this.currentSnapshot = { ...snapshot, bTotalForSession: this.bTotalForSession }

    const flowState = computeFlowState(this.currentSnapshot)

    // Auto-unlock next day for rest/review days that have no A-tier resources
    if (this.currentSnapshot.isUnlocked && this.currentSnapshot.aResources.length === 0) {
      const [nw, nd] = nextDay(week, day)
      if (nw !== week || nd !== day) {
        await tracker.unlockDay(userId, nw, nd)
      }
    }

    return flowState
  }

  async execute(command: Command): Promise<FlowState> {
    if (!this.currentSnapshot) throw new Error('Session not loaded')
    const { userId, week, day } = this
    // Capture the load generation before any await. If load() fires a newer
    // generation while we are awaiting, we must not overwrite currentSnapshot —
    // doing so would corrupt the freshly loaded day with stale data from this one.
    const execGen = this.loadGen

    const wasInRemediation = computeFlowState(this.currentSnapshot).phase === 'REMEDIATION'

    if (command.type === 'COMPLETE_RESOURCE' || command.type === 'SKIP_RESOURCE') {
      const result =
        command.type === 'COMPLETE_RESOURCE'
          ? command.result
          : { status: 'skipped' as const }

      const aResources = this.currentSnapshot.aResources
      const aResourceIds = new Set(aResources.map(r => r.id))
      const mode = this.currentSnapshot.mode

      await repo.transact(async () => {
        await tracker.record(userId, command.resourceId, result)

        // Query only this day's A-tier completions (avoids full-table scan)
        const dayCompletions = await repo.getCompletionsByResourceIds(userId, aResourceIds)

        let passed = 0, failed = 0
        for (const c of dayCompletions) {
          if (c.status === 'passed') passed++
          else if (c.status === 'failed') failed++
        }
        const gradedCount = passed + failed
        const stats: DayStats = {
          // Use aTotal denominator (consistent with computeDayScore).
          passRate: calcAttemptedPassRate(passed, aResources.length),
          passedCount: passed,
          failedCount: failed,
          gradedCount,
          totalACount: aResources.length,
          weakConcepts: [],
          seenResourceIds: new Set(),
        }

        // Only unlock when every A resource is in a final state (passed or failed).
        // Skipped resources don't count — a student cannot bypass the gate by skipping.
        const completedIds = new Set(dayCompletions.filter(c => c.status !== 'skipped').map(c => c.resource_id))
        const allADone = aResources.every(r => completedIds.has(r.id))
        if (allADone && shouldUnlock(stats, mode)) {
          const [nw, nd] = nextDay(week, day)
          if (nw !== week || nd !== day) {
            // Idempotency guard: check inside the transaction so two concurrent tabs
            // completing the last resource simultaneously both see the same pre-write
            // state and only one actually triggers non-idempotent post-unlock logic.
            const alreadyUnlocked = await repo.isDayUnlocked(userId, nw, nd)
            if (!alreadyUnlocked) await tracker.unlockDay(userId, nw, nd)
          }
        }
      })
    }

    if (command.type === 'RESET_FAILED_RESOURCES') {
      // Re-record every failed A resource as 'skipped' so computeFlowState
      // re-presents them in PRESENTING phase, giving the student a genuine retry.
      const aResources = this.currentSnapshot.aResources
      const failedIds = aResources
        .filter(r => this.currentSnapshot!.completions.get(r.id)?.status === 'failed')
        .map(r => r.id)
      if (failedIds.length > 0) {
        // Wrap in a transaction so either ALL failed resources are reset to 'skipped'
        // or NONE are — a partial reset (e.g. page crash mid-write) would leave the
        // day in an inconsistent state that computeFlowState cannot reason about.
        await repo.transact(async () => {
          await Promise.all(
            failedIds.map(id => tracker.record(userId, id, { status: 'skipped' }))
          )
        })
      }
      // Falls through to re-assemble snapshot below
    }

    // Re-assemble snapshot and recompute flow state
    const newSnapshot = await assembleDaySnapshot(userId, week, day)

    // If a newer load() resolved while we were awaiting assembleDaySnapshot, that
    // load already committed the correct day's snapshot. Overwriting it here would
    // corrupt the session with this execute()'s now-stale data.
    if (execGen !== this.loadGen) {
      return computeFlowState(this.currentSnapshot)
    }

    // Freeze bTotalForSession on first entry into REMEDIATION; preserve while in it.
    // Also guard against updating to 0: after RESET_FAILED_RESOURCES the snapshot
    // re-assembles with empty bCandidates (B was already exhausted); writing 0 would
    // corrupt the slot counter if REMEDIATION were somehow re-entered later.
    if (!wasInRemediation && newSnapshot.bCandidates.length > 0) {
      this.bTotalForSession = newSnapshot.bCandidates.length
    }
    this.currentSnapshot = {
      ...newSnapshot,
      bTotalForSession: this.bTotalForSession,
      // Preserve forceCompleted across execute() calls. Without this, completing a
      // B or C resource after forceAdvance() re-assembles the snapshot without the
      // flag and computeFlowState can roll the phase back below COMPLETE.
      forceCompleted: this.currentSnapshot.forceCompleted,
    }

    return computeFlowState(this.currentSnapshot)
  }

  async requestFeedback(signal?: AbortSignal): Promise<DailyFeedback> {
    if (!this.currentSnapshot) throw new Error('Session not loaded')
    // Capture snapshot before the first await so a concurrent load() cannot clobber it.
    // Use this.currentWeek/currentDay (committed fields) rather than this.week/this.day
    // (routing fields): load(B) overwrites this.week/this.day SYNCHRONOUSLY before its
    // own await, so they may already point to Day B even though currentSnapshot is still
    // Day A. currentWeek/currentDay are only written after the gen check confirms the
    // load committed successfully, so they are always in sync with currentSnapshot.
    const snapshot = this.currentSnapshot
    const userId = this.userId
    const week = this.currentWeek
    const day = this.currentDay
    if (computeFlowState(snapshot).phase !== 'COMPLETE') {
      throw new Error('requestFeedback called before day is complete')
    }
    // After forceAdvance, skip AI call — student didn't truly pass
    if (snapshot.forceCompleted) {
      return {
        strength: '已选择跳过本日关口',
        note: '建议之后返回重新完成以巩固知识点',
        preview: '',
      }
    }
    const stats = await tracker.getDayStats(userId, week, day, snapshot.aResources)
    return AIService.getDailyFeedback(stats, { week, day }, signal)
  }

  async forceAdvance(): Promise<FlowState> {
    if (!this.currentSnapshot) throw new Error('Session not loaded')
    const { userId, week, day } = this
    // Capture generation before any await — same reason as execute().
    const advGen = this.loadGen
    const [nw, nd] = nextDay(week, day)

    // Already at the final day: return current state without any side effects
    if (nw === week && nd === day) {
      return computeFlowState(this.currentSnapshot)
    }

    await tracker.unlockDay(userId, nw, nd)

    // Re-assemble snapshot and mark forceCompleted so the UI transitions to COMPLETE
    // in-session without corrupting the actual DB pass-rate record.
    const newSnapshot = await assembleDaySnapshot(userId, week, day)

    // Guard: if a new load() resolved while we were awaiting, don't overwrite its snapshot.
    if (advGen !== this.loadGen) {
      return computeFlowState(this.currentSnapshot)
    }

    this.currentSnapshot = { ...newSnapshot, bTotalForSession: this.bTotalForSession, forceCompleted: true }
    return computeFlowState(this.currentSnapshot)
  }
}
