import type { Run, RunId, Task, TaskState } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
/** Durable before-send registration and a retained session ownership index, including ended runs. */
export class RunRegistry {
  private readonly sessions = new Map<string, RunId>()
  constructor(readonly store: WhaleStore) {
    for (const run of store.status().state === 'error' ? [] : store.runs.all())
      this.sessions.set(run.sessionId, run.run_id)
  }
  /** Retain ownership even if a stored run later becomes unreadable. */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
  /** Re-read current durable state for a registered session. */
  get(sessionId: string): Run | undefined {
    const id = this.sessions.get(sessionId)
    return id ? this.store.runs.get(id) : undefined
  }
  /** Persist before publishing the in-memory ownership index. */
  register(run: Run): void {
    this.store.runs.insert(run)
    this.sessions.set(run.sessionId, run.run_id)
  }
  /** Apply the domain state machine and repository CAS together. */
  transition(task: Task, state: TaskState, reason: string, runId?: RunId): void {
    const result = this.store.tasks.transition(task.id, state, {
      expectedVersion: task.version,
      source: 'execution',
      reason,
      ...(runId ? { runId } : {}),
    })
    if (!result.ok) throw new Error(result.error.code)
  }
  /** A restarted host cannot safely infer delivery or completion. Reconcile later; never resend. */
  recover(): void {
    for (const run of this.store.runs.all().filter((run) => run.status === 'running')) {
      this.store.transaction(() => {
        const task = this.store.tasks.get(run.taskId)
        if (task?.state === 'RUNNING') this.transition(task, 'UNKNOWN', 'host-restarted', run.run_id)
        this.store.runs.update({
          ...run,
          status: 'ended',
          endedAt: Date.now(),
          outcome: 'UNKNOWN',
          reason: 'host-restarted',
        })
      })
    }
  }
}
