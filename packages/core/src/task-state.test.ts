import { describe, expect, test, vi } from 'vitest'
import { fixedClock, sequenceIdGen } from './infra.js'
import { TaskStateSchema } from './model/common.js'
import type { TaskState } from './model/common.js'
import { RunIdSchema } from './model/ids.js'
import { StateTransitionSchema } from './model/transition.js'
import { TASK_TRANSITIONS, transition } from './task-state.js'
import { makeTask } from '../tests/fixtures.js'

// Independent policy expectation: tests cover the complete 11 x 11 transition space.
const legal: Record<TaskState, readonly TaskState[]> = {
  PENDING: ['READY', 'BLOCKED', 'PAUSED', 'CANCELLED'],
  READY: ['RUNNING', 'WAITING_APPROVAL', 'BLOCKED', 'PAUSED', 'CANCELLED'],
  RUNNING: ['VERIFYING', 'FAILED', 'UNKNOWN', 'PAUSED', 'WAITING_APPROVAL'],
  VERIFYING: ['WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'BLOCKED', 'PAUSED'],
  WAITING_APPROVAL: ['SUCCEEDED', 'READY', 'VERIFYING', 'BLOCKED', 'PAUSED', 'CANCELLED'],
  BLOCKED: ['READY', 'PAUSED', 'CANCELLED'],
  FAILED: ['WAITING_APPROVAL', 'SUCCEEDED', 'READY', 'PAUSED', 'CANCELLED'],
  UNKNOWN: ['VERIFYING', 'FAILED', 'BLOCKED'],
  PAUSED: ['READY', 'VERIFYING', 'UNKNOWN', 'CANCELLED'],
  SUCCEEDED: [],
  CANCELLED: [],
}

describe('task transition policy', () => {
  for (const from of TaskStateSchema.options) {
    for (const to of TaskStateSchema.options) {
      test(`${from} -> ${to}`, () => {
        const task = makeTask('task_1', { state: from, version: 7 })
        const snapshot = structuredClone(task)
        const idGen = sequenceIdGen()
        const result = transition(
          task,
          to,
          {
            expectedVersion: 7,
            source: 'host',
            reason: 'Reconciled external state',
            runId: RunIdSchema.parse('run_1'),
          },
          { clock: fixedClock(1234), idGen },
        )
        if (legal[from].includes(to)) {
          expect(result.ok).toBe(true)
          if (!result.ok) throw new Error('Expected legal transition')
          expect(result.value.task).toEqual({ ...task, state: to, version: 8 })
          expect(result.value.record).toEqual({
            id: 'transition_1',
            entity: 'task',
            entityId: task.id,
            from,
            to,
            at: 1234,
            source: 'host',
            reason: 'Reconciled external state',
            runId: 'run_1',
          })
          expect(StateTransitionSchema.safeParse(result.value.record).success).toBe(true)
          expect(result.value.task).not.toBe(task)
        } else {
          expect(result).toEqual({ ok: false, error: { code: 'invalid-transition', from, to } })
          expect(idGen.next('next')).toBe('next_1')
        }
        expect(task).toEqual(snapshot)
      })
    }
  }

  test('public table matches the policy and is immutable', () => {
    expect(TASK_TRANSITIONS).toEqual(legal)
    expect(Object.isFrozen(TASK_TRANSITIONS)).toBe(true)
    for (const destinations of Object.values(TASK_TRANSITIONS))
      expect(Object.isFrozen(destinations)).toBe(true)
  })

  test('stale versions consume neither time nor IDs', () => {
    const clock = { now: vi.fn() }
    const idGen = { next: vi.fn() }
    expect(
      transition(
        makeTask('task_1', { version: 2 }),
        'READY',
        {
          expectedVersion: 1,
          source: 'host',
          reason: 'start',
        },
        { clock, idGen },
      ),
    ).toEqual({ ok: false, error: { code: 'stale-version', expectedVersion: 1, actualVersion: 2 } })
    expect(clock.now).not.toHaveBeenCalled()
    expect(idGen.next).not.toHaveBeenCalled()
  })

  test.each([
    { source: '', reason: 'start' },
    { source: 'host', reason: '  ' },
  ])('rejects blank metadata: %o', (meta) => {
    expect(
      transition(
        makeTask(),
        'READY',
        { ...meta, expectedVersion: 0 },
        {
          clock: fixedClock(1),
          idGen: sequenceIdGen(),
        },
      ),
    ).toEqual({ ok: false, error: { code: 'invalid-metadata' } })
  })

  test('optional run ID is absent rather than undefined', () => {
    const result = transition(
      makeTask(),
      'READY',
      { expectedVersion: 0, source: 'host', reason: 'ready' },
      {
        clock: fixedClock(1),
        idGen: sequenceIdGen(),
      },
    )
    if (!result.ok) throw new Error('Expected success')
    expect(result.value.record).not.toHaveProperty('runId')
  })

  test.each([NaN, -1, 0.1, Infinity])('invalid injected clock %s is an invariant violation', (timestamp) => {
    expect(() =>
      transition(
        makeTask(),
        'READY',
        { expectedVersion: 0, source: 'host', reason: 'ready' },
        {
          clock: fixedClock(timestamp),
          idGen: sequenceIdGen(),
        },
      ),
    ).toThrow('safe integers')
  })

  test('version overflow is an invariant violation', () => {
    expect(() =>
      transition(
        makeTask('task_1', { version: Number.MAX_SAFE_INTEGER }),
        'READY',
        {
          expectedVersion: Number.MAX_SAFE_INTEGER,
          source: 'host',
          reason: 'ready',
        },
        { clock: fixedClock(1), idGen: sequenceIdGen() },
      ),
    ).toThrow('safe integers')
  })
})
