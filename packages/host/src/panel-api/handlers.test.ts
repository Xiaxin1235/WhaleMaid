import { expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { goals, status, languagePatch, failure } from './handlers.js'
import { createPanelHandler } from './index.js'

import { snapshot } from '../../tests/panel-fixture.js'
import { ScopeIdSchema } from '@whalemaid/core'

test('status validates requests and makes a detached, validated snapshot', () => {
  expect(status({}, snapshot)).toEqual(snapshot)
  expect(status({}, snapshot).services).not.toBe(snapshot.services)
  expect(() => status({ peer: 'owner' }, snapshot)).toThrow()
  expect(() => status({}, { ...snapshot, startedAt: NaN })).toThrow()
})
test('goals returns core-compatible empty list and rejects writes', () => {
  expect(goals({}, [])).toEqual([])
  expect(() => goals({ title: 'create' }, [])).toThrow()
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
  const handler = createPanelHandler({
    snapshot: read,
    setLanguage: write,
    goals: () => [],
    setPaused: write,
    revokeScope: write,
    takeoverStore: write,
  })
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
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    setLanguage: write,
    goals: () => [],
    setPaused: write,
    revokeScope: write,
    takeoverStore: write,
  })
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

test('pause and revoke require live owner and strict payloads before any mutation', async () => {
  const setPaused = vi.fn(),
    revokeScope = vi.fn()
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    setLanguage: vi.fn(),
    goals: () => [],
    setPaused,
    revokeScope,
    takeoverStore: vi.fn(),
  })
  const signal = new AbortController().signal
  const peer = { principal: { kind: 'owner' }, signal } as PeerScope
  for (const method of ['set-paused', 'revoke-scope']) {
    expect(await handler(method, { peer: 'owner' }, signal, undefined as unknown as PeerScope)).toMatchObject(
      {
        ok: false,
        error: { code: 'whaledot/unauthorized' },
      },
    )
  }
  for (const input of [{}, { paused: 'true' }, { paused: true, extra: 1 }]) {
    expect(await handler('set-paused', input, signal, peer)).toMatchObject({
      ok: false,
      error: { code: 'whaledot/invalid-input' },
    })
  }
  for (const input of [{}, { scopeId: 1 }, { scopeId: 'scope_1', paused: true }]) {
    expect(await handler('revoke-scope', input, signal, peer)).toMatchObject({
      ok: false,
      error: { code: 'whaledot/invalid-input' },
    })
  }
  expect(setPaused).not.toHaveBeenCalled()
  expect(revokeScope).not.toHaveBeenCalled()
  expect(await handler('set-paused', { paused: true }, signal, peer)).toEqual({
    ok: true,
    value: { paused: true },
  })
  expect(setPaused).toHaveBeenCalledExactlyOnceWith(true)
  expect(await handler('revoke-scope', { scopeId: 'scope_1' }, signal, peer)).toEqual({
    ok: true,
    value: { scopeId: 'scope_1' },
  })
  expect(revokeScope).toHaveBeenCalledExactlyOnceWith(ScopeIdSchema.parse('scope_1'), peer)
  expect(await handler('grant', {}, signal, peer)).toMatchObject({
    ok: false,
    error: { code: 'whaledot/not-found' },
  })
})

test('store takeover accepts only authenticated explicit confirmation', async () => {
  const takeoverStore = vi.fn()
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    setLanguage: vi.fn(),
    goals: () => [],
    setPaused: vi.fn(),
    revokeScope: vi.fn(),
    takeoverStore,
  })
  const signal = new AbortController().signal
  const peer = { principal: { kind: 'owner' }, signal } as PeerScope
  for (const input of [{}, { confirm: false }, { confirm: true, extra: 1 }]) {
    expect(await handler('takeover-store', input, signal, peer)).toMatchObject({ ok: false })
  }
  expect(
    await handler('takeover-store', { confirm: true }, signal, undefined as unknown as PeerScope),
  ).toMatchObject({ ok: false })
  expect(takeoverStore).not.toHaveBeenCalled()
  expect(await handler('takeover-store', { confirm: true }, signal, peer)).toEqual({
    ok: true,
    value: snapshot,
  })
  expect(takeoverStore).toHaveBeenCalledOnce()
})

test('notification routing preserves rejection reasons and wire data cannot impersonate inbox source', async () => {
  const signal = new AbortController().signal,
    peer = { principal: { kind: 'owner' }, signal } as PeerScope
  const route = vi.fn(async () => ({ ok: false, reason: 'option-stale-or-consumed' })),
    routeChoice = vi.fn(async () => ({ ok: false, reason: 'option-authorization-changed' }))
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    setLanguage: vi.fn(),
    goals: () => [],
    setPaused: vi.fn(),
    revokeScope: vi.fn(),
    takeoverStore: vi.fn(),
    notificationRouter: { route, routeChoice } as unknown as import('../notify/router.js').NotificationRouter,
  })
  expect(await handler('route-suggestion', { suggestionId: 'suggestion_test' }, signal, peer)).toEqual({
    ok: true,
    value: { ok: false, reason: 'option-stale-or-consumed' },
  })
  expect(route).toHaveBeenCalledWith({ suggestionId: 'suggestion_test', source: 'panel', peer })
  expect(
    await handler('route-suggestion', { suggestionId: 'suggestion_test', source: 'inbox' }, signal, peer),
  ).toMatchObject({ ok: false, error: { code: 'whaledot/invalid-input' } })
  expect(route).toHaveBeenCalledOnce()
  expect(
    await handler('resolve-decision', { notificationId: 'notification_test', choice: 'retry' }, signal, peer),
  ).toMatchObject({
    ok: false,
    error: { code: 'whaledot/notification-choice-rejected', message: 'option-authorization-changed' },
  })
})
