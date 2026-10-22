import { describe, expect, test } from 'vitest'
import { DEFAULT_LIMITS } from './model/authorization.js'
import { GoalIdSchema, TaskIdSchema } from './model/ids.js'
import { mergeProposedTasks, readyTasks, selectNextTask, taskKey, validateDag } from './goal-graph.js'
import { makeGoal, makeTask } from '../tests/fixtures.js'

const id = (value: string) => TaskIdSchema.parse(value)

describe('task dependency graph', () => {
  test('empty and disconnected DAGs are valid', () => {
    expect(validateDag([])).toEqual({ ok: true, value: undefined })
    expect(validateDag([makeTask('a'), makeTask('b')]).ok).toBe(true)
  })
  test('accepts a diamond and repeated dependency references', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', { dependsOn: [id('a')] }),
      makeTask('c', { dependsOn: [id('a'), id('a')] }),
      makeTask('d', { dependsOn: [id('b'), id('c')] }),
    ]
    expect(validateDag(tasks).ok).toBe(true)
  })
  test('rejects duplicate IDs', () => {
    expect(validateDag([makeTask('a'), makeTask('a')])).toEqual({
      ok: false,
      error: { code: 'duplicate-task-id', taskId: 'a' },
    })
  })
  test('rejects dangling references', () => {
    expect(validateDag([makeTask('a', { dependsOn: [id('missing')] })])).toEqual({
      ok: false,
      error: { code: 'dangling-dependency', taskId: 'a', dependencyId: 'missing' },
    })
  })
  test('rejects cross-goal dependencies', () => {
    expect(
      validateDag([
        makeTask('a'),
        makeTask('b', { goalId: GoalIdSchema.parse('other'), dependsOn: [id('a')] }),
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: 'cross-goal-dependency' },
    })
  })
  test.each([
    [makeTask('a', { dependsOn: [id('a')] })],
    [makeTask('a', { dependsOn: [id('b')] }), makeTask('b', { dependsOn: [id('a')] })],
    [
      makeTask('a', { dependsOn: [id('c')] }),
      makeTask('b', { dependsOn: [id('a')] }),
      makeTask('c', { dependsOn: [id('b')] }),
    ],
  ])('rejects cycles: %o', (...tasks) => {
    expect(validateDag(tasks)).toMatchObject({ ok: false, error: { code: 'cycle' } })
    expect(readyTasks(tasks)).toEqual([])
    expect(selectNextTask(makeGoal(), tasks, [], DEFAULT_LIMITS)).toEqual({
      task: null,
      reason: 'invalid-graph',
    })
  })
  test('promotes only PENDING tasks whose dependencies all succeeded', () => {
    const tasks = [
      makeTask('a', { state: 'SUCCEEDED' }),
      makeTask('b', { dependsOn: [id('a')] }),
      makeTask('c', { dependsOn: [id('b')] }),
      makeTask('d', { state: 'READY' }),
      makeTask('e'),
    ]
    expect(readyTasks(tasks).map((task) => task.id)).toEqual(['b', 'e'])
  })
  test('UNKNOWN and failed prerequisites do not imply success', () => {
    for (const state of ['UNKNOWN', 'FAILED'] as const) {
      expect(readyTasks([makeTask('a', { state }), makeTask('b', { dependsOn: [id('a')] })])).toEqual([])
    }
  })
})

describe('task selection', () => {
  const goal = makeGoal()
  test.each([
    [makeTask('dangling', { state: 'READY', dependsOn: [id('missing')] })],
    [makeTask('duplicate'), makeTask('duplicate')],
    [
      makeTask('foreign', { goalId: GoalIdSchema.parse('other') }),
      makeTask('dependent', { dependsOn: [id('foreign')] }),
    ],
  ])('distinguishes corrupt graphs from an idle queue: %o', (...tasks) => {
    expect(selectNextTask(goal, tasks, [], DEFAULT_LIMITS)).toEqual({ task: null, reason: 'invalid-graph' })
  })
  test.each(['draft', 'paused', 'succeeded', 'cancelled'] as const)(
    'does not schedule %s goals',
    (status) => {
      expect(
        selectNextTask({ ...goal, status }, [makeTask('a', { state: 'READY' })], [], DEFAULT_LIMITS),
      ).toEqual({ task: null, reason: 'goal-not-active' })
    },
  )
  test('requires READY, correct goal and succeeded dependencies', () => {
    const tasks = [
      makeTask('pending'),
      makeTask('other', { state: 'READY', goalId: GoalIdSchema.parse('other') }),
      makeTask('blocked', { state: 'READY', dependsOn: [id('pending')] }),
    ]
    expect(selectNextTask(goal, tasks, [], DEFAULT_LIMITS)).toEqual({ task: null, reason: 'no-ready-task' })
  })
  test('chooses oldest first and preserves input order on ties', () => {
    const tasks = [
      makeTask('new', { state: 'READY', createdAt: 200 }),
      makeTask('old', { state: 'READY', createdAt: 100 }),
      makeTask('tie', { state: 'READY', createdAt: 100 }),
    ]
    const snapshot = structuredClone(tasks)
    expect(selectNextTask(goal, tasks, [], DEFAULT_LIMITS).task?.id).toBe('old')
    expect(tasks).toEqual(snapshot)
  })
  test.each(['RUNNING', 'VERIFYING', 'UNKNOWN', 'WAITING_APPROVAL', 'PAUSED'] as const)(
    'a %s writer reserves the project write slot',
    (state) => {
      const writer = makeTask('writer', { state, goalId: GoalIdSchema.parse('another-goal') })
      expect(selectNextTask(goal, [makeTask('a', { state: 'READY' })], [writer], DEFAULT_LIMITS)).toEqual({
        task: null,
        reason: 'write-slot-busy',
      })
    },
  )
  test.each(['analyze', 'research'] as const)('selects %s work while a writer is in flight', (kind) => {
    const tasks = [makeTask('edit', { state: 'READY' }), makeTask('read', { state: 'READY', kind })]
    expect(
      selectNextTask(goal, tasks, [makeTask('running', { state: 'RUNNING' })], DEFAULT_LIMITS).task?.id,
    ).toBe('read')
  })
  test('readers and completed writers do not occupy a write slot', () => {
    const running = [
      makeTask('reader', { state: 'RUNNING', kind: 'analyze' }),
      makeTask('done', { state: 'SUCCEEDED' }),
    ]
    expect(selectNextTask(goal, [makeTask('a', { state: 'READY' })], running, DEFAULT_LIMITS).task?.id).toBe(
      'a',
    )
  })
  test('does not launch a stale READY snapshot of an in-flight task', () => {
    expect(
      selectNextTask(
        goal,
        [makeTask('a', { state: 'READY', kind: 'analyze' })],
        [makeTask('a', { state: 'RUNNING', kind: 'analyze' })],
        DEFAULT_LIMITS,
      ).task,
    ).toBeNull()
  })
  test('P01 caps parallel writers at one', () => {
    expect(
      selectNextTask(goal, [makeTask('a', { state: 'READY' })], [makeTask('running', { state: 'RUNNING' })], {
        ...DEFAULT_LIMITS,
        maxConcurrentWritePerProject: 10,
      }).reason,
    ).toBe('write-slot-busy')
  })
})

describe('proposal deduplication', () => {
  const goalId = makeGoal().id
  test('normalizes Unicode, case and whitespace and separates kind/goal', () => {
    expect(taskKey(goalId, '  ＦＩＸ\n  Tests ', 'edit')).toBe(taskKey(goalId, 'fix tests', 'edit'))
    expect(taskKey(goalId, 'fix tests', 'edit')).not.toBe(taskKey(goalId, 'fix tests', 'test'))
    expect(taskKey(goalId, 'fix tests', 'edit')).not.toBe(
      taskKey(GoalIdSchema.parse('other'), 'fix tests', 'edit'),
    )
  })
  test('retains existing records and drops title/key and ID collisions without mutating input', () => {
    const existing = [makeTask('a', { title: 'Fix tests' })]
    const proposed = [
      makeTask('b', { title: 'FIX  TESTS', key: 'model-forged-key' }),
      makeTask('c', { title: 'New task' }),
      makeTask('d', { title: 'new task' }),
      makeTask('a', { title: 'reused ID' }),
    ]
    const snapshot = structuredClone([existing, proposed])
    const result = mergeProposedTasks(goalId, existing, proposed)
    expect(result.tasks.map((task) => task.id)).toEqual(['a', 'c'])
    expect(result.tasks[0]).toBe(existing[0])
    expect(result.tasks[1]?.key).toBe(taskKey(goalId, 'New task', 'edit'))
    expect(result.rejected).toEqual(
      [proposed[0], proposed[2], proposed[3]].map((task) => ({ task, reason: 'duplicate' })),
    )
    expect(validateDag(result.tasks).ok).toBe(true)
    expect([existing, proposed]).toEqual(snapshot)
  })
  test('model proposals cannot declare execution success, user authorship or prior attempts', () => {
    const proposed = makeTask('proposal', {
      state: 'SUCCEEDED',
      attempts: 10,
      version: 99,
      createdBy: 'user',
    })
    const result = mergeProposedTasks(goalId, [], [proposed])
    expect(result.tasks[0]).toMatchObject({
      state: 'PENDING',
      attempts: 0,
      version: 0,
      createdBy: 'planner',
    })
    expect(result.rejected).toEqual([])
    expect(validateDag(result.tasks).ok).toBe(true)
    expect(proposed.state).toBe('SUCCEEDED')
  })
  test('rejects foreign, dangling and cyclic proposals individually while accepting the remaining DAG', () => {
    const existing = [makeTask('base', { state: 'SUCCEEDED', version: 4 })]
    const proposed = [
      makeTask('foreign', { goalId: GoalIdSchema.parse('other') }),
      makeTask('bad-dependency', { dependsOn: [id('missing')] }),
      makeTask('self-cycle', { dependsOn: [id('self-cycle')] }),
      makeTask('valid', { dependsOn: [id('base')] }),
      makeTask('valid-child', { dependsOn: [id('valid')] }),
      makeTask('duplicate-child', { title: 'VALID-CHILD' }),
      makeTask('valid-child', { title: 'Reused accepted ID' }),
    ]
    const before = structuredClone([existing, proposed])
    expect(validateDag(existing).ok).toBe(true)
    const result = mergeProposedTasks(goalId, existing, proposed)
    expect(result.tasks.map((task) => task.id)).toEqual(['base', 'valid', 'valid-child'])
    expect(result.tasks[0]).toBe(existing[0])
    expect(result.rejected).toEqual([
      { task: proposed[0], reason: 'foreign-goal' },
      { task: proposed[1], reason: 'dangling-dependency' },
      { task: proposed[2], reason: 'cycle' },
      { task: proposed[5], reason: 'duplicate' },
      { task: proposed[6], reason: 'duplicate' },
    ])
    expect(validateDag(result.tasks).ok).toBe(true)
    expect([existing, proposed]).toEqual(before)
  })
  test('forward dependencies are rejected in order without reserving their key or ID', () => {
    const proposed = [
      makeTask('child', { dependsOn: [id('parent')] }),
      makeTask('parent'),
      makeTask('child', { dependsOn: [id('parent')] }),
    ]
    const result = mergeProposedTasks(goalId, [], proposed)
    expect(result.rejected).toEqual([{ task: proposed[0], reason: 'dangling-dependency' }])
    expect(result.tasks.map((task) => task.id)).toEqual(['parent', 'child'])
    expect(validateDag(result.tasks).ok).toBe(true)
  })
  test('rejects a dependency on another goal without disturbing existing records', () => {
    const existing = [makeTask('foreign', { goalId: GoalIdSchema.parse('other') })]
    const proposed = [makeTask('dependent', { dependsOn: [id('foreign')] }), makeTask('independent')]
    expect(validateDag(existing).ok).toBe(true)
    const result = mergeProposedTasks(goalId, existing, proposed)
    expect(result.rejected).toEqual([{ task: proposed[0], reason: 'foreign-goal' }])
    expect(result.tasks.map((task) => task.id)).toEqual(['foreign', 'independent'])
    expect(validateDag(result.tasks).ok).toBe(true)
  })
  test('an empty proposal batch retains a valid existing DAG', () => {
    const existing = [makeTask('base')]
    const result = mergeProposedTasks(goalId, existing, [])
    expect(result).toEqual({ tasks: existing, rejected: [] })
    expect(result.tasks).not.toBe(existing)
    expect(validateDag(result.tasks).ok).toBe(true)
  })
})
