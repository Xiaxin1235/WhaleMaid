import { expect, expectTypeOf, test } from 'vitest'
import {
  ActionIntentSchema,
  AttemptSchema,
  AuthorizationScopeSchema,
  CheckpointSchema,
  DEFAULT_LIMITS,
  EvidenceSchema,
  GoalIdSchema,
  GoalSchema,
  LimitsSchema,
  MemoryRecordSchema,
  NotificationSchema,
  RunSchema,
  ScopePatchSchema,
  StateTransitionSchema,
  SuggestionSchema,
  TaskIdSchema,
  TaskSchema,
  fixedClock,
  sequenceIdGen,
} from './index.js'
import type { GoalId, TaskId } from './index.js'
import { makeGoal, makeScope, makeTask } from '../tests/fixtures.js'

test('test infrastructure is deterministic and each ID sequence is isolated', () => {
  const clock = fixedClock(500)
  expect([clock.now(), clock.now()]).toEqual([500, 500])
  const ids = sequenceIdGen()
  expect([ids.next('task'), ids.next('run')]).toEqual(['task_1', 'run_2'])
  expect(sequenceIdGen().next('task')).toBe('task_1')
})

test('entity IDs are schema-derived, opaque and distinct at compile time', () => {
  expectTypeOf<TaskId>().not.toEqualTypeOf<string>()
  expectTypeOf<TaskId>().not.toEqualTypeOf<GoalId>()
  expectTypeOf(TaskIdSchema.parse('task_1')).toEqualTypeOf<TaskId>()
  expectTypeOf(GoalIdSchema.parse('goal_1')).toEqualTypeOf<GoalId>()
  expect(TaskIdSchema.safeParse('').success).toBe(false)
})

test('all eleven entities parse serialized records and reject invalid ID types', () => {
  const records = [
    [GoalSchema, makeGoal()],
    [AuthorizationScopeSchema, makeScope()],
    [TaskSchema, makeTask()],
    [
      RunSchema,
      {
        run_id: 'run_1',
        taskId: 'task_1',
        sessionId: 'session_1',
        worktreePath: 'C:\\worktree',
        baseCommit: 'abc',
        startedAt: 100,
      },
    ],
    [AttemptSchema, { attempt_id: 'attempt_1', runId: 'run_1', n: 1, startedAt: 100 }],
    [
      CheckpointSchema,
      {
        id: 'checkpoint_1',
        goalId: 'goal_1',
        taskId: 'task_1',
        commit: 'abc',
        kind: 'baseline',
        createdAt: 100,
      },
    ],
    [
      EvidenceSchema,
      {
        id: 'evidence_1',
        runId: 'run_1',
        kind: 'test-report',
        path: 'report.json',
        summary: 'Tests passed',
        verdict: 'PASS',
      },
    ],
    [
      MemoryRecordSchema,
      {
        id: 'memory_1',
        scope: 'project',
        content: 'Fact',
        type: 'fact',
        source: 'user',
        evidenceRef: 'evidence_1',
        valid: true,
        version: 0,
        privacy: 'private',
      },
    ],
    [
      NotificationSchema,
      {
        id: 'notification_1',
        kind: 'decision',
        priority: 'high',
        dedupeKey: 'decision-1',
        goalId: 'goal_1',
        taskId: 'task_1',
        channel: 'dsh-question',
        createdAt: 100,
      },
    ],
    [
      SuggestionSchema,
      {
        id: 'suggestion_1',
        notificationId: 'notification_1',
        label: 'Continue',
        intent: { type: 'continue-goal', goalId: 'goal_1' },
        riskLevel: 'low',
        expiresAt: 200,
        bindTo: { goalId: 'goal_1', taskId: 'task_1', taskVersion: 0, sessionId: 'session_1' },
      },
    ],
    [
      StateTransitionSchema,
      {
        id: 'transition_1',
        entity: 'task',
        entityId: 'task_1',
        from: 'PENDING',
        to: 'READY',
        at: 100,
        source: 'host',
        reason: 'Dependencies satisfied',
      },
    ],
  ] as const
  for (const [schema, record] of records) {
    const serialized = JSON.parse(JSON.stringify(record)) as Record<string, unknown>
    expect(schema.safeParse(serialized).success).toBe(true)
    const identityKey = 'run_id' in record ? 'run_id' : 'attempt_id' in record ? 'attempt_id' : 'id'
    expect(schema.safeParse({ ...serialized, [identityKey]: 42 }).success).toBe(false)
  }
})

test('limits default independently and never share mutable state', () => {
  expect(LimitsSchema.parse({})).toEqual(DEFAULT_LIMITS)
  expect(LimitsSchema.parse({ maxFixRounds: 0 })).toEqual({ ...DEFAULT_LIMITS, maxFixRounds: 0 })
  const { limits, ...scope } = makeScope()
  expect(AuthorizationScopeSchema.parse(scope).limits).toEqual(limits)
  expect(LimitsSchema.safeParse({ maxRunMinutes: -1 }).success).toBe(false)
  expect(LimitsSchema.safeParse({ maxConcurrentWritePerProject: 0 }).success).toBe(false)
  expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true)
})

test('permission schemas exclude danger-full-access, including proposed patches', () => {
  type Preset = ReturnType<typeof AuthorizationScopeSchema.parse>['permissionPreset']
  expectTypeOf<Preset>().toEqualTypeOf<'read-only' | 'workspace-write'>()
  expect(
    AuthorizationScopeSchema.safeParse({ ...makeScope(), permissionPreset: 'danger-full-access' }).success,
  ).toBe(false)
  expect(ScopePatchSchema.safeParse({ permissionPreset: 'danger-full-access' }).success).toBe(false)
  expect(ScopePatchSchema.safeParse({ limits: { maxRunsPerDay: 50 } }).success).toBe(true)
  expect(ScopePatchSchema.safeParse({ status: 'active', hash: 'invented' }).success).toBe(false)
})

test('execution outcome defaults to UNKNOWN; missing evidence cannot become success', () => {
  expect(
    RunSchema.parse({
      run_id: 'run_1',
      taskId: 'task_1',
      sessionId: 'session_1',
      worktreePath: 'C:\\tree',
      baseCommit: 'abc',
      startedAt: 1,
    }).outcome,
  ).toBe('UNKNOWN')
  expect(AttemptSchema.parse({ attempt_id: 'attempt_1', runId: 'run_1', n: 1, startedAt: 1 }).outcome).toBe(
    'UNKNOWN',
  )
  expect(
    EvidenceSchema.safeParse({
      id: 'evidence_1',
      runId: 'run_1',
      kind: 'log',
      summary: 'Unlocated claim',
      verdict: 'PASS',
    }).success,
  ).toBe(false)
})

test('schema rejects malformed data and unexpected action authority', () => {
  expect(TaskSchema.safeParse({ ...makeTask(), state: 'DONE' }).success).toBe(false)
  expect(TaskSchema.safeParse({ ...makeTask(), version: -1 }).success).toBe(false)
  expect(GoalSchema.safeParse({ ...makeGoal(), createdAt: NaN }).success).toBe(false)
  expect(
    ActionIntentSchema.safeParse({ type: 'read-file', path: 'C:\\proj', permission: 'danger-full-access' })
      .success,
  ).toBe(false)
  expect(ActionIntentSchema.safeParse({ type: 'run-command', cmdline: '', cwd: 'C:\\proj' }).success).toBe(
    false,
  )
})
