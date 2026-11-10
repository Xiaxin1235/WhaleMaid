import { expect, test, vi } from 'vitest'
import { keepStageLease, stageEvent } from './world-stage.js'

test('only the opaque iframe window can announce a compatible stage', () => {
  const frame = {} as Window
  const ready = {
    source: frame,
    origin: 'null',
    data: { protocol: 'stage/1', type: 'ready', actions: ['walk', 'idle', 'sit-work', 'sleep', 'love'] },
  }
  expect(stageEvent(ready, frame)).toMatchObject({ type: 'ready' })
  expect(stageEvent({ ...ready, origin: 'https://harness.example' }, frame)).toBeUndefined()
  expect(stageEvent({ ...ready, source: {} as Window }, frame)).toBeUndefined()
  expect(stageEvent({ ...ready, data: { ...ready.data, protocol: 'stage/2' } }, frame)).toEqual({
    type: 'error',
  })
  expect(stageEvent({ ...ready, data: { ...ready.data, actions: [] } }, frame)).toEqual({ type: 'error' })
})

test('a disabled or missing stage cannot acquire a valid lease', async () => {
  const ready = vi.fn()
  const request = vi.fn(async () => new Response(null, { status: 404 }))
  await expect(keepStageLease(new AbortController().signal, ready, request)).rejects.toThrow(
    'stage-lease-unavailable',
  )
  expect(ready).not.toHaveBeenCalled()
})

test('acknowledges a split event once and returns by aborting the same lease', async () => {
  const lifetime = new AbortController()
  const ready = vi.fn()
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        start(stream) {
          stream.enqueue(encoder.encode('data: sta'))
          stream.enqueue(encoder.encode('ge/1\n\n'))
          init?.signal?.addEventListener('abort', () => stream.close(), { once: true })
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })
  const lease = keepStageLease(lifetime.signal, ready, request)
  await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce())
  expect(request).toHaveBeenCalledWith('/api/coopanion/stage/1/away', {
    method: 'POST',
    signal: lifetime.signal,
  })
  lifetime.abort()
  await lease
  expect(request).toHaveBeenCalledOnce()
})
