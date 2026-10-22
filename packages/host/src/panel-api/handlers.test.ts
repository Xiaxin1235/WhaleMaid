import { expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { goals, status, languagePatch, failure } from './handlers.js'
import { createPanelHandler } from './index.js'

import { snapshot } from '../../tests/panel-fixture.js'

test('status validates requests and makes a detached, validated snapshot', () => {
  expect(status({}, snapshot)).toEqual(snapshot)
  expect(status({}, snapshot).services).not.toBe(snapshot.services)
  expect(() => status({ peer: 'owner' }, snapshot)).toThrow()
  expect(() => status({}, { ...snapshot, startedAt: NaN })).toThrow()
})
test('goals returns core-compatible empty list and rejects writes', () => {
  expect(goals({})).toEqual([])
  expect(() => goals({ title: 'create' })).toThrow()
})
test('only language can be patched', () => {
  expect(languagePatch({ language: 'en' })).toEqual({ language: 'en' })
  for (const input of [{ language: 'ja' }, { language: 'en', dataDir: '/other' }, {}, { paused: true }]) {
    expect(() => languagePatch(input)).toThrow()
  }
})
test('expected failures use stable error codes without leaking host exception details', () => {
  expect(failure(Object.assign(new Error('private path'), { code: 'SETTINGS_CONFLICT' })).error.code).toBe(
    'whaledot/settings-conflict',
  )
  expect(failure(new Error('private path'))).toEqual({
    error: { code: 'whaledot/unavailable', message: 'Panel service unavailable' },
  })
})

test('missing/disposed/non-owner peer cannot read or mutate; payload cannot impersonate owner', async () => {
  const read = vi.fn(() => snapshot),
    write = vi.fn()
  const handler = createPanelHandler({ snapshot: read, setLanguage: write })
  const signal = new AbortController().signal
  for (const peer of [
    undefined,
    { principal: { kind: 'other' }, signal },
    { principal: { kind: 'owner' }, signal: AbortSignal.abort() },
  ]) {
    const reply = await handler(
      'language',
      { language: 'en', peer: { kind: 'owner' } },
      signal,
      peer as PeerScope,
    )
    expect(reply).toMatchObject({ ok: false, error: { code: 'whaledot/unauthorized' } })
  }
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})
test('authenticated owner can read and change language, but cannot create goals or change other fields', async () => {
  const write = vi.fn(),
    signal = new AbortController().signal
  const handler = createPanelHandler({ snapshot: () => snapshot, setLanguage: write })
  const peer = { principal: { kind: 'owner' }, signal } as PeerScope
  expect(await handler('status', {}, signal, peer)).toEqual({ ok: true, value: snapshot })
  expect(await handler('goals', {}, signal, peer)).toEqual({ ok: true, value: [] })
  expect(await handler('language', { language: 'en' }, signal, peer)).toEqual({
    ok: true,
    value: { language: 'en' },
  })
  expect(await handler('language', { language: 'en', paused: false }, signal, peer)).toMatchObject({
    ok: false,
    error: { code: 'whaledot/invalid-input' },
  })
  expect(await handler('create', {}, signal, peer)).toMatchObject({
    ok: false,
    error: { code: 'whaledot/not-found' },
  })
  expect(write).toHaveBeenCalledExactlyOnceWith({ language: 'en' })
})
