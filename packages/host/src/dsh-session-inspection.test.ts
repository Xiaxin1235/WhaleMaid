import { expect, test, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { inspectSession, isMissingSession } from './dsh-session-inspection.js'

const id = 'session-fixture' as SessionId
const context = (services: Record<string, unknown>) => ({ get: (key: string) => services[key] }) as Context

test('old controller inspection receives the session identity and cancellation signal', async () => {
  const signal = new AbortController().signal
  const value = { meta: { id }, events: [] }
  const inspect = vi.fn(async () => value)
  const observeSession = vi.fn()
  expect(
    await inspectSession(
      context({ sessionController: { inspect }, sessionQuery: { observeSession } }),
      id,
      signal,
    ),
  ).toBe(value)
  expect(inspect).toHaveBeenCalledWith(id, signal)
  expect(observeSession).not.toHaveBeenCalled()
})

test('new query observes the same event cut without projections and disposes the lease', async () => {
  const signal = new AbortController().signal
  const header = { id }
  const events = [{ type: 'turn/end' }]
  const dispose = vi.fn()
  const observeSession = vi.fn(async () => ({ header, events, [Symbol.dispose]: dispose }))
  expect(await inspectSession(context({ sessionQuery: { observeSession } }), id, signal)).toEqual({
    meta: header,
    events,
  })
  expect(observeSession).toHaveBeenCalledWith(id, { signal, projectionMode: 'none' })
  expect(dispose).toHaveBeenCalledOnce()
})

test('only known absence is treated as missing; other query errors propagate', async () => {
  const absent = Object.assign(Error('not found'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
  const corrupt = Object.assign(Error('invalid transcript'), { code: 'SESSION_QUERY_CORRUPT_SESSION' })
  const observeSession = vi.fn().mockRejectedValue(corrupt)
  expect(isMissingSession(absent)).toBe(true)
  expect(isMissingSession(Object.assign(Error(), { name: 'ApiSessionNotFound' }))).toBe(true)
  expect(isMissingSession(corrupt)).toBe(false)
  await expect(inspectSession(context({ sessionQuery: { observeSession } }), id)).rejects.toBe(corrupt)
  await expect(inspectSession(context({}), id)).rejects.toThrow('session-inspection-unavailable')
})
