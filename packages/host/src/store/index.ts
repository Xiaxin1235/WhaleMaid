import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  AuthorizationScopeSchema,
  ProjectGoalSchema,
  TaskSchema,
  StateTransitionSchema,
  RunSchema,
  CheckpointSchema,
  EvidenceSchema,
  VerificationSchema,
  AutopilotEventSchema,
  PlannerStateSchema,
  NotificationSchema,
  SuggestionSchema,
  NotificationPreferencesSchema,
  UserNoteSchema,
  NotificationChoiceSchema,
  InboxSessionSchema,
  DeliveryRecordSchema,
  MemorySchema,
  MemoryProposalSchema,
  CompanionJournalSchema,
  journalOverflow,
  memoryScopeKey,
  canActivateMemory,
  hashScope,
  transition,
  DailyGoalChangesSchema,
} from '@whalemaid/core'
import type { AuthorizationScope, Clock, IdGen, ScopeHasher } from '@whalemaid/core'
import type {
  GoalRepo,
  ScopeRepo,
  TaskRepo,
  TransitionRepo,
  RunRepo,
  CheckpointRepo,
  EvidenceRepo,
} from './repos.js'
import { acquireWriterLock } from './lock.js'

export const CompanionSessionRecordSchema = z.strictObject({
  sessionId: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  previous: z.array(z.string().min(1).max(200)).max(20).default([]),
  /** Set once her session has been moved off the old read-only pin; after that the user owns the preset. */
  writable: z.boolean().optional(),
})
export type CompanionSessionRecord = z.infer<typeof CompanionSessionRecordSchema>
import { MIGRATIONS } from './migrations.js'
import type { Migration } from './migrations.js'
import { EverydayApprovalPanelSchema, EverydayApprovalRecordSchema } from '../everyday-approval/contract.js'
import type { EverydayApprovalRecord } from '../everyday-approval/contract.js'
import { CodexSettingsSchema } from '../codex/contract.js'

export const productionClock: Clock = { now: () => Date.now() }
export const productionIdGen: IdGen = { next: (prefix) => `${prefix}_${randomUUID()}` }
export const sha256: ScopeHasher = { hash: (content) => createHash('sha256').update(content).digest('hex') }

export interface StoreStatus {
  state: 'ok' | 'read-only' | 'error'
  corruptRows: number
  message?: string
}
export interface StoreOptions {
  clock?: Clock
  idGen?: IdGen
  migrations?: readonly Migration[]
  log(message: string, error?: unknown): void
}

/** Owns one SQLite handle and writer lock. All domain writes validate core schemas. */
export class WhaleStore {
  private db: DatabaseSync | undefined
  private unlock: (() => void) | undefined
  private state: StoreStatus['state'] = 'error'
  private message: string | undefined
  private readonly corrupt = new Set<string>()
  private readonly clock: Clock
  private readonly idGen: IdGen
  private transactionDepth = 0
  readonly goals: GoalRepo
  readonly scopes: ScopeRepo
  readonly tasks: TaskRepo
  readonly transitions: TransitionRepo
  readonly checkpoints: CheckpointRepo
  readonly evidence: EvidenceRepo
  readonly runs: RunRepo

  private readonly listeners = new Set<() => void>()
  private changeQueued = false
  /** Observe durable state changes; listeners re-read state, rather than trusting event payloads. */
  watchChanges(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private changed(): void {
    if (this.changeQueued || !this.listeners.size) return
    this.changeQueued = true
    queueMicrotask(() => {
      this.changeQueued = false
      for (const listener of this.listeners) {
        try {
          listener()
        } catch (error) {
          this.options.log('state observer failed', error)
        }
      }
    })
  }
  readonly autopilotEvents
  readonly plannerState
  readonly verifications
  readonly notifications
  readonly suggestions
  readonly userNotes
  readonly notificationChoices
  readonly inboxSessions
  readonly notificationDeliveries
  readonly memories
  readonly memoryProposals
  readonly journal

  constructor(
    private readonly dataDir: string,
    private readonly options: StoreOptions,
  ) {
    this.clock = options.clock ?? productionClock
    this.idGen = options.idGen ?? productionIdGen
    this.journal = {
      get: (id: string) => this.one('companion_journal', id, CompanionJournalSchema),
      list: () => this.rows('companion_journal', CompanionJournalSchema),
      insert: (input: import('@whalemaid/core').CompanionJournal) => {
        const row = CompanionJournalSchema.parse(input)
        this.transaction(() => {
          this.writer()
            .prepare('INSERT INTO companion_journal(id,kind,created_at,status,data) VALUES(?,?,?,?,?)')
            .run(row.id, row.kind, row.createdAt, row.status, JSON.stringify(row))
          const excess = journalOverflow(
            this.writer()
              .prepare('SELECT id,created_at FROM companion_journal WHERE kind=?')
              .all(row.kind)
              .map((r) => ({ id: String(r.id), createdAt: Number(r.created_at) })),
          )
          for (const id of excess) this.writer().prepare('DELETE FROM companion_journal WHERE id=?').run(id)
          this.changed()
        })
      },
      delete: (id?: string) => {
        this.transaction(() => {
          this.setRecallState('journal-revision', (this.recallState('journal-revision', z.int()) ?? 0) + 1)
          for (const row of this.journal
            .list()
            .filter((r) => r.status === 'active' && (!id || r.id === id))) {
            this.writer()
              .prepare('UPDATE companion_journal SET status=?,data=? WHERE id=?')
              .run('deleted', JSON.stringify({ ...row, status: 'deleted' }), row.id)
          }
          this.changed()
        })
      },
    }
    const ledger = <T extends { id: string; goalId: string }>(table: string, schema: z.ZodType<T>) => ({
      get: (id: string) => this.one(table, id, schema),
      list: (goalId?: string) =>
        goalId ? this.rows(table, schema, 'goal_id', goalId) : this.rows(table, schema),
      insert: (input: T) => {
        const row = schema.parse(input)
        this.writer()
          .prepare(`INSERT INTO ${table}(id,goal_id,data) VALUES(?,?,?)`)
          .run(row.id, row.goalId, JSON.stringify(row))
        this.changed()
      },
      update: (input: T) => {
        const row = schema.parse(input)
        this.writer().prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(row), row.id)
        this.changed()
      },
    })
    this.userNotes = ledger('user_notes', UserNoteSchema)
    this.notificationChoices = ledger('notification_choices', NotificationChoiceSchema)
    this.inboxSessions = ledger('inbox_sessions', InboxSessionSchema)
    this.notificationDeliveries = ledger('notification_deliveries', DeliveryRecordSchema)
    this.memoryProposals = {
      get: (id: string) => this.one('memory_proposals', id, MemoryProposalSchema),
      list: () => this.rows('memory_proposals', MemoryProposalSchema),
      insert: (input: import('@whalemaid/core').MemoryProposal) => {
        const p = MemoryProposalSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO memory_proposals(id,scope_key,status,version,data) VALUES(?,?,?,?,?)')
          .run(p.id, memoryScopeKey(p.scope), p.status, p.version, JSON.stringify(p))
        this.changed()
      },
      update: (input: import('@whalemaid/core').MemoryProposal, version: number) => {
        const p = MemoryProposalSchema.parse(input)
        if (p.version !== version + 1) throw Error('stale-version')
        const r = this.writer()
          .prepare('UPDATE memory_proposals SET status=?,version=?,data=? WHERE id=? AND version=?')
          .run(p.status, p.version, JSON.stringify(p), p.id, version)
        if (r.changes !== 1) throw Error('stale-version')
        this.changed()
      },
    }
    this.memories = {
      get: (id: string) => this.one('memories', id, MemorySchema),
      list: (scopeKey?: string, options: { includeArchived?: boolean } = {}) =>
        this.rows('memories', MemorySchema).filter(
          (m) =>
            (!scopeKey || memoryScopeKey(m.scope) === scopeKey) &&
            (options.includeArchived || m.status === 'active'),
        ),
      insert: (input: import('@whalemaid/core').Memory) => {
        const row = MemorySchema.parse(input)
        if (row.status === 'active' && !canActivateMemory(this.rows('memories', MemorySchema), row))
          throw Error('scope-full')
        this.writer()
          .prepare('INSERT INTO memories(id,scope_key,status,version,data) VALUES(?,?,?,?,?)')
          .run(row.id, memoryScopeKey(row.scope), row.status, row.version, JSON.stringify(row))
        this.changed()
      },
      update: (input: import('@whalemaid/core').Memory, expectedVersion: number) => {
        const row = MemorySchema.parse(input)
        if (row.version !== expectedVersion + 1) throw Error('stale-version')
        if (row.status === 'active' && !canActivateMemory(this.rows('memories', MemorySchema), row))
          throw Error('scope-full')
        const result = this.writer()
          .prepare('UPDATE memories SET scope_key=?,status=?,version=?,data=? WHERE id=? AND version=?')
          .run(
            memoryScopeKey(row.scope),
            row.status,
            row.version,
            JSON.stringify(row),
            row.id,
            expectedVersion,
          )
        if (result.changes !== 1) throw Error('stale-version')
        this.changed()
      },
      delete: (id: string) => {
        this.writer().prepare('DELETE FROM memories WHERE id=?').run(id)
        this.changed()
      },
    }
    this.goals = {
      get: (id) => this.one('goals', id, ProjectGoalSchema),
      list: () => this.rows('goals', ProjectGoalSchema),
      insert: (input) => {
        const row = ProjectGoalSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO goals(id,version,data) VALUES(?,?,?)')
          .run(row.id, row.version, JSON.stringify(row))
        this.changed()
      },
      update: (input, expectedVersion) => {
        const row = ProjectGoalSchema.parse(input)
        if (row.version !== expectedVersion + 1) throw new Error('stale-version')
        this.transaction(() => {
          const previous = this.goals.get(row.id)
          const result = this.writer()
            .prepare('UPDATE goals SET version=?,data=? WHERE id=? AND version=?')
            .run(row.version, JSON.stringify(row), row.id, expectedVersion)
          if (result.changes !== 1) throw new Error('stale-version')
          if (previous && previous.status !== row.status) {
            const at = this.clock.now()
            const changes = this.recallState('daily-brief-goal-changes', DailyGoalChangesSchema) ?? []
            this.setRecallState('daily-brief-goal-changes', [
              ...changes.filter((v) => v.at > at - 7 * 86400000),
              { goalId: row.id, status: row.status, at },
            ])
          }
          this.changed()
        })
      },
    }
    this.scopes = {
      get: (id) => this.one('scopes', id, AuthorizationScopeSchema),
      list: (id) => this.rows('scopes', AuthorizationScopeSchema, 'goal_id', id),
    }
    this.autopilotEvents = {
      list: (id?: string) =>
        id
          ? this.rows('autopilot_events', AutopilotEventSchema, 'goal_id', id)
          : this.rows('autopilot_events', AutopilotEventSchema),
      insert: (input: import('@whalemaid/core').AutopilotEvent) => {
        const row = AutopilotEventSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO autopilot_events(id,goal_id,data) VALUES(?,?,?)')
          .run(row.id, row.goalId ?? null, JSON.stringify(row))
      },
    }
    this.plannerState = {
      get: (id: string) => this.one('planner_state', id, PlannerStateSchema),
      put: (input: import('@whalemaid/core').PlannerState) => {
        const row = PlannerStateSchema.parse(input)
        this.writer()
          .prepare(
            'INSERT INTO planner_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          )
          .run(row.id, JSON.stringify(row))
      },
    }
    this.verifications = {
      get: (id: string) => this.one('verifications', id, VerificationSchema),
      list: () => this.rows('verifications', VerificationSchema),
      insert: (input: import('@whalemaid/core').Verification) => {
        const row = VerificationSchema.parse(input)
        this.writer()
          .prepare(
            'INSERT INTO verifications(id,task_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          )
          .run(row.id, row.taskId, JSON.stringify(row))
      },
    }
    this.notifications = {
      get: (id: string) => this.one('notifications', id, NotificationSchema),
      list: () => this.rows('notifications', NotificationSchema),
      insert: (input: import('@whalemaid/core').Notification) => {
        const row = NotificationSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO notifications(id,data) VALUES(?,?)')
          .run(row.id, JSON.stringify(row))
        this.changed()
      },
      update: (input: import('@whalemaid/core').Notification) => {
        const row = NotificationSchema.parse(input)
        this.writer().prepare('UPDATE notifications SET data=? WHERE id=?').run(JSON.stringify(row), row.id)
        this.changed()
      },
    }
    this.suggestions = {
      get: (id: string) => this.one('suggestions', id, SuggestionSchema),
      update: (input: import('@whalemaid/core').Suggestion) => {
        const row = SuggestionSchema.parse(input)
        this.writer().prepare('UPDATE suggestions SET data=? WHERE id=?').run(JSON.stringify(row), row.id)
        this.changed()
      },
      list: () => this.rows('suggestions', SuggestionSchema),
      insert: (input: import('@whalemaid/core').Suggestion) => {
        const row = SuggestionSchema.parse(input)
        this.writer().prepare('INSERT INTO suggestions(id,data) VALUES(?,?)').run(row.id, JSON.stringify(row))
      },
      consume: (notificationId: string, at: number) => {
        for (const row of this.rows('suggestions', SuggestionSchema).filter(
          (row) => row.notificationId === notificationId,
        ))
          this.writer()
            .prepare('UPDATE suggestions SET data=? WHERE id=?')
            .run(JSON.stringify({ ...row, consumedAt: at }), row.id)
      },
    }
    this.tasks = {
      update: (input, expectedVersion) => {
        const row = TaskSchema.parse(input)
        const old = this.tasks.get(row.id)
        if (
          !old ||
          row.version !== expectedVersion + 1 ||
          row.state !== old.state ||
          row.goalId !== old.goalId
        )
          throw new Error('stale-version')
        const result = this.writer()
          .prepare('UPDATE tasks SET version=?,data=? WHERE id=? AND version=?')
          .run(row.version, JSON.stringify(row), row.id, expectedVersion)
        if (result.changes !== 1) throw new Error('stale-version')
        this.changed()
      },
      get: (id) => this.one('tasks', id, TaskSchema),
      list: (id) => this.rows('tasks', TaskSchema, 'goal_id', id),
      insert: (input) => {
        const row = TaskSchema.parse(input)
        if (row.state !== 'PENDING' || row.version !== 0)
          throw new Error('New tasks must start at PENDING version 0')
        this.writer()
          .prepare('INSERT INTO tasks(id,goal_id,task_key,version,state,data) VALUES(?,?,?,?,?,?)')
          .run(row.id, row.goalId, row.key, row.version, row.state, JSON.stringify(row))
        this.changed()
      },
      transition: (id, to, meta) =>
        this.transaction(() => {
          const task = this.tasks.get(id)
          if (!task) return { ok: false, error: { code: 'task-not-found' } } as const
          const next = transition(task, to, meta, { clock: this.clock, idGen: this.idGen })
          if (!next.ok) return next
          const row = TaskSchema.parse(next.value.task)
          const result = this.writer()
            .prepare('UPDATE tasks SET state=?,version=?,data=? WHERE id=? AND version=?')
            .run(row.state, row.version, JSON.stringify(row), id, meta.expectedVersion)
          if (result.changes !== 1)
            return {
              ok: false,
              error: {
                code: 'stale-version',
                expectedVersion: meta.expectedVersion,
                actualVersion: task.version,
              },
            } as const
          const record = StateTransitionSchema.parse(next.value.record)
          this.writer()
            .prepare('INSERT INTO state_transitions(id,task_id,data) VALUES(?,?,?)')
            .run(record.id, record.entityId, JSON.stringify(record))
          this.changed()
          return next
        }),
    }
    this.transitions = { list: (id) => this.rows('state_transitions', StateTransitionSchema, 'task_id', id) }
    this.checkpoints = {
      list: (id) => this.rows('checkpoints', CheckpointSchema, 'goal_id', id),
      insert: (input) => {
        const row = CheckpointSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO checkpoints(id,goal_id,task_id,data) VALUES(?,?,?,?)')
          .run(row.id, row.goalId, row.taskId, JSON.stringify(row))
      },
    }
    this.evidence = {
      list: (id) => this.rows('evidence', EvidenceSchema, 'run_id', id),
      insert: (input) => {
        const row = EvidenceSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO evidence(id,run_id,data) VALUES(?,?,?)')
          .run(row.id, row.runId, JSON.stringify(row))
      },
    }
    this.runs = {
      all: () => this.rows('runs', RunSchema),
      get: (id) => this.one('runs', id, RunSchema),
      list: (id) => this.rows('runs', RunSchema, 'task_id', id),
      insert: (input) => {
        const row = RunSchema.parse(input)
        this.writer()
          .prepare('INSERT INTO runs(id,task_id,data) VALUES(?,?,?)')
          .run(row.run_id, row.taskId, JSON.stringify(row))
        this.changed()
      },
      update: (input) => {
        const row = RunSchema.parse(input)
        const result = this.writer()
          .prepare('UPDATE runs SET data=? WHERE id=? AND task_id=?')
          .run(JSON.stringify(row), row.run_id, row.taskId)
        if (result.changes !== 1) throw new Error('run-not-found')
        this.changed()
      },
    }
    this.open()
  }

  /** Detached status; corruptRows counts distinct invalid stored rows observed this startup. */
  status(): StoreStatus {
    return {
      state: this.state,
      corruptRows: this.corrupt.size,
      ...(this.message ? { message: this.message } : {}),
    }
  }

  /** Only the authenticated panel's explicit owner confirmation may call this recovery path. */
  takeover(): void {
    if (this.state !== 'read-only') throw new Error('store-not-read-only')
    const path = join(this.dataDir, 'whaledot.lock')
    const snapshot = existsSync(path) ? readFileSync(path, 'utf8') : undefined
    this.db?.close()
    this.db = undefined
    this.options.log('owner confirmed store takeover')
    this.open(snapshot)
    if (this.status().state !== 'ok') throw new Error('store-takeover-failed')
    this.message = undefined
    this.options.log('store takeover completed')
  }

  /** Synchronous transactions must contain no async work or external side effects. */
  transaction<T>(work: () => T): T {
    const db = this.writer()
    const nested = this.transactionDepth > 0
    const savepoint = `whaledot_${this.transactionDepth}`
    db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
    this.transactionDepth++
    try {
      const result = work()
      if (result instanceof Promise) throw new Error('Async store transaction is not supported')
      db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
      return result
    } catch (error) {
      db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK')
      throw error
    } finally {
      this.transactionDepth--
    }
  }

  /** Lifecycle writes change only status/revokedAt and their digest; grants are append-only. */
  replaceScope(nextInput: AuthorizationScope, previousInput?: AuthorizationScope): void {
    const next = AuthorizationScopeSchema.parse(nextInput)
    const digest = hashScope(next, sha256)
    if (
      next.status !== 'active' ||
      !digest.ok ||
      next.hash !== digest.value ||
      (previousInput
        ? next.supersedes !== previousInput.id ||
          next.goalId !== previousInput.goalId ||
          previousInput.status !== 'superseded'
        : next.supersedes !== undefined)
    )
      throw new Error('invalid-scope-version')
    this.transaction(() => {
      if (previousInput) this.writeScopeLifecycle(previousInput)
      this.writer()
        .prepare('INSERT INTO scopes(id,goal_id,status,data) VALUES(?,?,?,?)')
        .run(next.id, next.goalId, next.status, JSON.stringify(next))
      const goal = this.goals.get(next.goalId)
      if (!goal) throw new Error('goal-not-found')
      this.goals.update(
        {
          ...goal,
          scopeId: next.id,
          ...(previousInput ? { autopilot: { enabled: false } } : {}),
          version: goal.version + 1,
        },
        goal.version,
      )
    })
  }

  /** Revocation and replacement never accept modified grant fields. */
  writeScopeLifecycle(input: AuthorizationScope): void {
    const row = AuthorizationScopeSchema.parse(input)
    const previous = this.scopes.get(row.id)
    if (!previous || previous.status !== 'active' || row.status === 'active')
      throw new Error('scope-inactive')
    const immutable = z
      .strictObject(AuthorizationScopeSchema.shape)
      .omit({ status: true, revokedAt: true, hash: true })
    const content = immutable.parse(
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => !['status', 'revokedAt', 'hash'].includes(key)),
      ),
    )
    const nextContent = immutable.parse(
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !['status', 'revokedAt', 'hash'].includes(key)),
      ),
    )
    if (JSON.stringify(content) !== JSON.stringify(nextContent)) throw new Error('immutable-scope')
    const digest = hashScope(row, sha256)
    if (!digest.ok || digest.value !== row.hash) throw new Error('invalid-scope-hash')
    const result = this.writer()
      .prepare("UPDATE scopes SET status=?,data=? WHERE id=? AND status='active'")
      .run(row.status, JSON.stringify(row), row.id)
    if (result.changes !== 1) throw new Error('scope-inactive')
  }

  codexSettings(): ReturnType<typeof CodexSettingsSchema.parse> {
    const value =
      this.one('kv_settings', 'codex.settings', CodexSettingsSchema) ?? CodexSettingsSchema.parse({})
    return { ...value, enabled: this.state === 'ok' && value.enabled }
  }
  setCodexSettings(input: unknown): void {
    const value = CodexSettingsSchema.parse(input)
    this.writer()
      .prepare(
        "INSERT INTO kv_settings(id,data) VALUES('codex.settings',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(value))
    this.changed()
  }
  everydayApprovalState(): ReturnType<typeof EverydayApprovalPanelSchema.parse> {
    const value = this.one('kv_settings', 'everyday-approval', EverydayApprovalPanelSchema)
    return { enabled: this.state === 'ok' && (value?.enabled ?? false), records: value?.records ?? [] }
  }
  setEverydayApprovalEnabled(enabled: boolean): void {
    this.writeEverydayApproval({ ...this.everydayApprovalState(), enabled: z.boolean().parse(enabled) })
  }
  recordEverydayApproval(input: EverydayApprovalRecord): void {
    const value = this.everydayApprovalState()
    if (!value.enabled) throw new Error('everyday-approval-disabled')
    this.writeEverydayApproval({
      ...value,
      records: [...value.records, EverydayApprovalRecordSchema.parse(input)].slice(-1000),
    })
  }
  private writeEverydayApproval(input: unknown): void {
    const value = EverydayApprovalPanelSchema.parse(input)
    this.writer()
      .prepare(
        "INSERT INTO kv_settings(id,data) VALUES('everyday-approval',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(value))
    this.changed()
  }

  /** Persist notification preferences in the existing settings ledger; malformed settings mute delivery. */
  notificationPreferences(): import('@whalemaid/core').NotificationPreferences {
    if (!this.db || this.state === 'error') return { maxPerHour: 4, muted: true }
    const row = this.db.prepare("SELECT * FROM kv_settings WHERE id='notifications.preferences'").get()
    return row
      ? (this.decode('kv_settings', row, NotificationPreferencesSchema) ?? { maxPerHour: 4, muted: true })
      : { maxPerHour: 4, muted: false }
  }
  /** Owner-facing adapter validates before calling this durable mutation. */
  setNotificationPreferences(input: unknown): void {
    const row = NotificationPreferencesSchema.parse(input)
    this.writer()
      .prepare(
        "INSERT INTO kv_settings(id,data) VALUES('notifications.preferences',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(row))
    this.changed()
  }
  /** The companion session WhaleMaid created, if any; malformed rows read as absent. */
  companionSession(): CompanionSessionRecord | undefined {
    if (!this.db || this.state === 'error') return undefined
    const row = this.db.prepare("SELECT * FROM kv_settings WHERE id='companion.session'").get()
    return row ? this.decode('kv_settings', row, CompanionSessionRecordSchema) : undefined
  }
  setCompanionSession(input: CompanionSessionRecord): void {
    const row = CompanionSessionRecordSchema.parse(input)
    this.writer()
      .prepare(
        "INSERT INTO kv_settings(id,data) VALUES('companion.session',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(row))
    this.changed()
  }
  paused(): boolean {
    if (!this.db || this.state === 'error') return true
    const row = this.db.prepare("SELECT * FROM kv_settings WHERE id='autopilot.paused'").get()
    if (!row) return false
    const parsed = this.decode('kv_settings', row, z.boolean())
    return parsed ?? true
  }

  /** Auxiliary memory usage, references and draft deduplication; never interpreted as confirmed content. */
  memoryMeta(): { calls: number[]; references: Record<string, number>; drafts: Record<string, number> } {
    return (
      this.one(
        'kv_settings',
        'memory.meta',
        z.object({
          calls: z.array(z.number()),
          references: z.record(z.string(), z.number()),
          drafts: z.record(z.string(), z.number()),
        }),
      ) ?? { calls: [], references: {}, drafts: {} }
    )
  }
  /** Recall-only durable cursors and attempt counters; never part of confirmed memory. */
  recallState<T>(id: string, schema: z.ZodType<T>): T | undefined {
    return this.one('companion_recall_state', id, schema)
  }
  setRecallState(id: string, input: unknown): void {
    this.writer()
      .prepare(
        'INSERT INTO companion_recall_state(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(id, JSON.stringify(input))
  }
  setMemoryMeta(input: ReturnType<WhaleStore['memoryMeta']>): void {
    this.writer()
      .prepare(
        "INSERT INTO kv_settings(id,data) VALUES('memory.meta',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(input))
  }

  /** Writes are durable before callers observe the new pause value. */
  pauseVersion(): number {
    return this.one('kv_settings', 'autopilot.pause-version', z.int().nonnegative()) ?? 0
  }
  setPaused(paused: boolean): void {
    const value = z.boolean().parse(paused)
    this.transaction(() => {
      this.writer()
        .prepare(
          "INSERT INTO kv_settings(id,data) VALUES('autopilot.pause-version',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .run(JSON.stringify(this.pauseVersion() + 1))
      this.writer()
        .prepare(
          "INSERT INTO kv_settings(id,data) VALUES('autopilot.paused',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .run(JSON.stringify(value))
      this.changed()
    })
  }

  close(): void {
    this.listeners.clear()
    try {
      this.db?.close()
    } finally {
      this.db = undefined
      this.unlock?.()
      this.unlock = undefined
      this.state = 'error'
      this.message = 'Store closed'
    }
  }

  private writer(): DatabaseSync {
    if (this.state !== 'ok' || !this.db) throw new Error('store-unavailable')
    return this.db
  }

  private open(confirmedLock?: string): void {
    try {
      mkdirSync(this.dataDir, { recursive: true })
      this.unlock = acquireWriterLock(this.dataDir, this.clock.now(), confirmedLock)
      const path = join(this.dataDir, 'whaledot.db')
      const existed = existsSync(path) && statSync(path).size > 0
      if (!this.unlock) {
        this.state = 'read-only'
        this.message = '另一个 DSH 正在使用 WhaleMaid 数据'
        if (!existed) return
        this.db = new DatabaseSync(path, { readOnly: true })
        this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
        this.checkHistory(this.options.migrations ?? MIGRATIONS, true)
        return
      }
      this.db = new DatabaseSync(path)
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
      const migrations = this.options.migrations ?? MIGRATIONS
      const applied = this.checkHistory(migrations, false)
      const pending = migrations.filter((migration) => migration.version > applied)
      if (pending.length) {
        if (existed) this.backup()
        this.db.exec('BEGIN IMMEDIATE')
        try {
          this.db.exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
          )
          for (const migration of pending) {
            migration.up(this.db)
            this.db
              .prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)')
              .run(migration.version, this.clock.now())
          }
          this.db.exec('COMMIT')
        } catch (error) {
          this.db.exec('ROLLBACK')
          throw error
        }
      }
      this.state = 'ok'
    } catch (error) {
      this.close()
      this.message = error instanceof Error ? error.message : 'Store unavailable'
      this.options.log('store degraded', error)
    }
  }

  private checkHistory(migrations: readonly Migration[], requireCurrent: boolean): number {
    for (let i = 0; i < migrations.length; i++) {
      if (migrations[i]?.version !== i + 1) throw new Error('Unordered store migrations')
    }
    const hasTable = this.db!.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'").get()
    const history = hasTable
      ? this.db!.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      : []
    if (
      history.some((row, index) => row.version !== index + 1) ||
      history.length > migrations.length ||
      (requireCurrent && history.length !== migrations.length)
    )
      throw new Error('Incompatible store migration history')
    return history.length
  }

  private backup(): void {
    const dir = join(this.dataDir, 'backups')
    mkdirSync(dir, { recursive: true })
    const filename = `whaledot-${String(this.clock.now()).padStart(16, '0')}-${randomUUID()}.db`
    // VACUUM INTO includes committed WAL pages, unlike copying the main database file.
    this.db!.prepare('VACUUM INTO ?').run(join(dir, filename))
    const files = readdirSync(dir)
      .filter((name) => /^whaledot-\d{16}-[a-f0-9-]+\.db$/.test(name))
      .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs || b.localeCompare(a))
    for (const file of files.slice(5)) rmSync(join(dir, file))
  }

  private rows<T>(table: string, schema: z.ZodType<T>, column?: string, value?: string): T[] {
    if (!this.db) throw new Error('store-unavailable')
    // table/column are private constants, never derived from input or stored content.
    const rows = column
      ? this.db.prepare(`SELECT * FROM ${table} WHERE ${column}=? ORDER BY rowid`).all(value!)
      : this.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    return rows.flatMap((row) => {
      const parsed = this.decode(table, row, schema)
      return parsed === undefined ? [] : [parsed]
    })
  }

  private one<T>(table: string, id: string, schema: z.ZodType<T>): T | undefined {
    if (!this.db) throw new Error('store-unavailable')
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)
    return row && this.decode(table, row, schema)
  }

  private decode<T>(table: string, row: Record<string, unknown>, schema: z.ZodType<T>): T | undefined {
    try {
      const parsed = schema.parse(JSON.parse(String(row.data)))
      if (parsed && typeof parsed === 'object') {
        const fields = parsed as Record<string, unknown>
        const checks = {
          id:
            fields.id ??
            fields.run_id ??
            (['kv_settings', 'companion_recall_state'].includes(table) ? row.id : undefined),
          goal_id: table === 'autopilot_events' ? (fields.goalId ?? null) : fields.goalId,
          task_id: fields.taskId ?? fields.entityId,
          task_key: fields.key,
          version: fields.version,
          state: fields.state,
          status: fields.status,
          ...(table === 'companion_journal' ? { kind: fields.kind, created_at: fields.createdAt } : {}),
          ...(['memories', 'memory_proposals'].includes(table)
            ? {
                scope_key: memoryScopeKey(
                  (table === 'memories' ? MemorySchema : MemoryProposalSchema).parse(parsed).scope,
                ),
              }
            : {}),
        }
        for (const [column, value] of Object.entries(checks)) {
          if (column in row && row[column] !== value) throw new Error('Record index mismatch')
        }
      }
      return parsed
    } catch {
      const key = `${table}:${String(row.id)}`
      if (!this.corrupt.has(key)) {
        this.corrupt.add(key)
        this.options.log(`corrupt record ${key}`)
      }
      return undefined
    }
  }
}

export type {
  GoalRepo,
  ScopeRepo,
  TaskRepo,
  TransitionRepo,
  RunRepo,
  CheckpointRepo,
  EvidenceRepo,
} from './repos.js'
