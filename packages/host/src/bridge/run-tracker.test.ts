import { expect, test, vi } from 'vitest'
import { RunTracker } from './run-tracker.js'
import type { RunSignal } from './session-events.js'

function setup() {
  let time = 100
  const ended = vi.fn()
  const tracker = new RunTracker({ now: () => time++ }, ended)
  const send = (kind: RunSignal['kind'], extra = {}) =>
    tracker.accept({ sessionId: 's', kind, at: 9999, ...extra })
  return { tracker, ended, send }
}

test('watched round uses injected clock, counts calls and ends exactly once', () => {
  const { tracker, ended, send } = setup()
  tracker.watch('s', 'run')
  send('turn-start')
  send('tool-call')
  send('tool-result')
  send('tool-call')
  expect(tracker.get('s')).toEqual({
    runId: 'run',
    sessionId: 's',
    status: 'running',
    endReason: null,
    toolCalls: 2,
    startedAt: 101,
    endedAt: null,
  })
  send('turn-end', { endReason: 'completed' })
  send('turn-end', { endReason: 'error' })
  send('session-disposed')
  send('tool-call')
  expect(ended).toHaveBeenCalledExactlyOnceWith({
    runId: 'run',
    sessionId: 's',
    status: 'ended',
    endReason: 'completed',
    toolCalls: 2,
    startedAt: 101,
    endedAt: 102,
  })
  expect(tracker.get('s')).toEqual(ended.mock.calls[0]![0])
})

test('unwatched sessions and unwatched executions retain no state or content', () => {
  const { tracker, ended, send } = setup()
  for (const kind of ['turn-start', 'tool-call', 'tool-result', 'turn-end', 'session-disposed'] as const)
    send(kind, { raw: 'private' })
  expect(tracker.get('s')).toBeUndefined()
  tracker.watch('s', 'run')
  tracker.unwatch('s')
  send('turn-end')
  expect(tracker.get('s')).toBeUndefined()
  expect(ended).not.toHaveBeenCalled()
})

test.each(['unknown', undefined] as const)('unknown or missing end reason is not success: %s', (reason) => {
  const { tracker, ended, send } = setup()
  tracker.watch('s', 'run')
  send('turn-end', { endReason: reason })
  expect(ended.mock.calls[0]![0].endReason).toBe('unknown')
})

test('mid-run disposal ends as aborted without waiting for turn-end', () => {
  const { tracker, ended, send } = setup()
  tracker.watch('s', 'run')
  send('tool-call')
  send('session-disposed')
  expect(ended.mock.calls[0]![0]).toMatchObject({
    status: 'ended',
    endReason: 'aborted',
    toolCalls: 1,
    endedAt: 101,
  })
})

test('watches are isolated; snapshots cannot change tracker; unwatch permits reuse', () => {
  const { tracker, send } = setup()
  tracker.watch('s', 'run')
  tracker.watch('other', 'other-run')
  expect(() => tracker.watch('s', 'new')).toThrow('Session already watched')
  expect(() => tracker.watch('third', 'run')).toThrow('Run already watched')
  const copy = tracker.get('s')!
  Object.assign(copy, { toolCalls: 20 })
  send('tool-call')
  expect(tracker.get('s')!.toolCalls).toBe(1)
  expect(tracker.get('other')!.toolCalls).toBe(0)
  tracker.unwatch('s')
  tracker.watch('s', 'new')
  expect(tracker.get('s')!.toolCalls).toBe(0)
})

test('source subscription returns its cleanup', () => {
  const { tracker, send } = setup()
  const stop = vi.fn()
  const subscribe = vi.fn((cb) => {
    cb({ sessionId: 's', kind: 'tool-call', at: 0 })
    return stop
  })
  tracker.watch('s', 'run')
  expect(tracker.subscribe({ subscribe })).toBe(stop)
  send('turn-end')
  expect(tracker.get('s')!.toolCalls).toBe(1)
})
