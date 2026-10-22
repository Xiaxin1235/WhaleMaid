import { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { expect, test, vi } from 'vitest'
import { createSessionEventSource, mapSessionEvent } from './session-events.js'

// Exact-version npm declarations supplement Desktop's missing declarations:
// .dsh-ref/0.2.1-rc.2/@deepseek-ai/dsh-session/lib/types/types.d.ts:166-211,256-389,490-510.
// Session envelope is { type, seq, time, data }; surface events require surfaceOp.
function event(type: string, data: unknown): SessionEvent {
  return {
    type,
    seq: 1,
    time: 123,
    data,
    ...(type === 'tool/result' ? { surfaceOp: 'append' } : {}),
  } as SessionEvent
}

test('maps real turn and tool payload shapes without retaining private content', () => {
  expect(mapSessionEvent('s', event('turn/start', { turn: 1 }))).toEqual({
    sessionId: 's',
    kind: 'turn-start',
    at: 123,
  })
  expect(
    mapSessionEvent(
      's',
      event('tool/call', { turn: 1, step: 1, callId: 'c', name: 'read_file', arguments: '{"private":true}' }),
    ),
  ).toEqual({ sessionId: 's', kind: 'tool-call', at: 123, toolName: 'read_file' })
  // ToolResultMessage has no tool name; call identity is message.toolCallId.
  expect(
    mapSessionEvent(
      's',
      event('tool/result', {
        turn: 1,
        step: 1,
        message: { id: 'm', role: 'tool', toolCallId: 'c', content: [{ type: 'text', text: 'private' }] },
      }),
    ),
  ).toEqual({ sessionId: 's', kind: 'tool-result', at: 123 })
  expect(mapSessionEvent('s', event('step/start', { turn: 1, step: 1 }))).toBeUndefined()
})

test.each(['completed', 'error', 'max-tokens', 'interrupted', 'blocked', 'aborted'])(
  'normalizes end reason %s',
  (kind) => {
    expect(mapSessionEvent('s', event('turn/end', { turn: 1, reason: { kind } }))!.endReason).toBe(kind)
  },
)

test.each([{ kind: 'forked' }, { kind: 'future' }, undefined, 'completed'])(
  'unknown reasons remain unknown: %o',
  (reason) => {
    expect(mapSessionEvent('s', event('turn/end', { turn: 1, reason }))!.endReason).toBe('unknown')
  },
)

test('subscribes to Cordis events and releases both subscriptions', async () => {
  const ctx = new Context()
  const session = { id: 's' } as Session
  const cb = vi.fn()
  const stop = createSessionEventSource(ctx, () => 456).subscribe(cb)
  ctx.emit('session/event', session, event('turn/start', { turn: 1 }))
  ctx.emit('session/disposed', session)
  expect(cb.mock.calls.map((call) => call[0])).toEqual([
    { sessionId: 's', kind: 'turn-start', at: 123 },
    { sessionId: 's', kind: 'session-disposed', at: 456 },
  ])
  stop()
  stop()
  ctx.emit('session/disposed', session)
  expect(cb).toHaveBeenCalledTimes(2)
  await ctx.fiber.dispose()
})

test('subscription setup rolls back an earlier listener on failure', () => {
  const dispose = vi.fn()
  const on = vi
    .fn()
    .mockReturnValueOnce(dispose)
    .mockImplementationOnce(() => {
      throw new Error('failed')
    })
  expect(() => createSessionEventSource({ on } as unknown as Context, Date.now).subscribe(() => {})).toThrow(
    'failed',
  )
  expect(dispose).toHaveBeenCalledOnce()
})
