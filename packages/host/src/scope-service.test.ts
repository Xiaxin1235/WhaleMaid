import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { afterEach, expect, test, vi } from 'vitest'
import {
  checkAction,
  fixedClock,
  sequenceIdGen,
  hashScope,
  ActionKindSchema,
  ActionIntentSchema,
} from '@whaledot/core'
import { makeGoal, makeScope } from '../../core/tests/fixtures.js'
import { WhaleStore, sha256 } from './store/index.js'
import { ScopeService, createScopeService, ScopeDraftSchema } from './scope-service.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn()
})
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-scope-'))
  const log = vi.fn(),
    revoked = vi.fn()
  const clock = fixedClock(1000),
    idGen = sequenceIdGen()
  const store = new WhaleStore(dir, { log, clock, idGen })
  store.goals.insert(makeGoal())
  cleanups.push(
    () => rmSync(dir, { recursive: true, force: true }),
    () => store.close(),
  )
  const service = new ScopeService(store, { log, revoked, clock, idGen, hasher: sha256 })
  const draft = ScopeDraftSchema.parse(
    Object.fromEntries(
      Object.entries(makeScope()).filter(([key]) => !['id', 'status', 'grantedAt', 'hash'].includes(key)),
    ),
  )
  return { dir, store, service, draft, revoked, log }
}
test('grant requires a live owner and ignores no extra privilege fields; grants hash and persist', () => {
  const { service, draft, store } = setup()
  for (const peer of [
    undefined,
    { principal: { kind: 'other' }, signal: owner.signal },
    { principal: { kind: 'owner' }, signal: AbortSignal.abort() },
  ]) {
    expect(() => service.grant(draft, peer as PeerScope)).toThrow('owner')
  }
  expect(() => ScopeDraftSchema.parse({ ...draft, hash: '0'.repeat(64) })).toThrow()
  const scope = service.grant(draft, owner)
  expect(scope).toMatchObject({ status: 'active', grantedAt: 1000, id: 'scope_1' })
  expect(hashScope(scope, sha256)).toEqual({ ok: true, value: scope.hash })
  expect(service.activeScopeFor(draft.goalId)).toEqual(scope)
  expect(store.goals.get(draft.goalId)?.scopeId).toBe(scope.id)
})
test('new version supersedes the old grant atomically and preserves all original grant fields', () => {
  const { service, store, draft } = setup()
  const first = service.grant(draft, owner)
  const second = service.grant({ ...draft, allowedPaths: ['C:/other'], supersedes: first.id }, owner)
  const old = store.scopes.get(first.id)!
  expect(old).toEqual({ ...first, status: 'superseded', hash: expect.any(String) })
  expect(hashScope(old, sha256)).toEqual({ ok: true, value: old.hash })
  expect(second.id).not.toBe(first.id)
  expect(second.supersedes).toBe(first.id)
  expect(service.activeScopeFor(draft.goalId)).toEqual(second)
  expect(() => service.grant({ ...draft, supersedes: first.id }, owner)).toThrow('scope-version-conflict')
  expect(() => store.writeScopeLifecycle({ ...second, allowedPaths: ['C:/'], status: 'revoked' })).toThrow(
    'immutable-scope',
  )
})
test('replacement failure rolls back previous status and goal binding', () => {
  const { service, store, draft, dir } = setup()
  const first = service.grant(draft, owner)
  const db = new DatabaseSync(join(dir, 'whaledot.db'))
  try {
    db.exec(
      "CREATE TRIGGER fail_scope BEFORE INSERT ON scopes BEGIN SELECT RAISE(ABORT,'scope write failed'); END",
    )
  } finally {
    db.close()
  }
  expect(() => service.grant({ ...draft, supersedes: first.id }, owner)).toThrow('scope write failed')
  expect(service.activeScopeFor(draft.goalId)).toEqual(first)
  expect(store.scopes.list(draft.goalId)).toEqual([first])
  expect(store.goals.get(draft.goalId)?.scopeId).toBe(first.id)
})
test('revoke is immediate, owner-only, durable, emits after commit and denies every action', () => {
  const { service, store, draft, revoked } = setup()
  const scope = service.grant(draft, owner)
  expect(() => service.revoke(scope.id, undefined as unknown as PeerScope)).toThrow('owner')
  revoked.mockImplementation(() => expect(service.activeScopeFor(draft.goalId)).toBeUndefined())
  const result = service.revoke(scope.id, owner)
  expect(result).toMatchObject({ status: 'revoked', revokedAt: 1000 })
  expect(revoked).toHaveBeenCalledExactlyOnceWith(scope.id)
  service.revoke(scope.id, owner)
  expect(revoked).toHaveBeenCalledTimes(1)
  expect(store.scopes.get(scope.id)).toEqual(result)
  const actions = [
    { type: 'read-file', path: 'C:/proj/file' },
    { type: 'write-file', path: 'C:/proj/file' },
    { type: 'run-command', cmdline: 'pnpm test', cwd: 'C:/proj' },
    { type: 'git', subcommand: 'status', args: [] },
    { type: 'network', url: 'https://example.com', method: 'GET' },
    { type: 'continue-goal', goalId: draft.goalId },
    { type: 'pause-goal', goalId: draft.goalId },
    { type: 'resume-goal', goalId: draft.goalId },
    { type: 'rollback-to-checkpoint', checkpointId: 'checkpoint_1' },
    { type: 'reply-to-session', sessionId: 'session_1', text: 'continue' },
    { type: 'open-workbench' },
    { type: 'expand-scope', goalId: draft.goalId, patch: { allowedPaths: ['C:/'] } },
  ].map((value) => ActionIntentSchema.parse(value))
  expect(actions.map((action) => action.type).sort()).toEqual([...ActionKindSchema.options].sort())
  for (const action of actions) expect(checkAction(result, action).decision).toBe('deny')
})
test('tampered hash or grant content never produces an active authorization', () => {
  const { service, draft, dir, log } = setup()
  const scope = service.grant(draft, owner)
  const db = new DatabaseSync(join(dir, 'whaledot.db'))
  try {
    for (const changed of [
      { ...scope, hash: '0'.repeat(64) },
      { ...scope, allowedPaths: ['C:/'] },
    ]) {
      db.prepare('UPDATE scopes SET data=? WHERE id=?').run(JSON.stringify(changed), scope.id)
      expect(service.activeScopeFor(draft.goalId)).toBeUndefined()
    }
  } finally {
    db.close()
  }
  expect(log).toHaveBeenCalledWith(`scope integrity mismatch ${scope.id}`)
})
test('Cordis event uses the plugin event vocabulary and observes committed revocation', async () => {
  const { store, draft, log } = setup()
  const ctx = new Context()
  try {
    const service = createScopeService(ctx, store, log)
    const scope = service.grant(draft, owner)
    const event = vi.fn((id) => {
      expect(id).toBe(scope.id)
      expect(store.scopes.get(scope.id)?.status).toBe('revoked')
    })
    ctx.on('whaledot/scope-revoked', event)
    service.revoke(scope.id, owner)
    expect(event).toHaveBeenCalledOnce()
    expect(
      checkAction(store.scopes.get(scope.id)!, ActionIntentSchema.parse({ type: 'open-workbench' })).decision,
    ).toBe('deny')
  } finally {
    await ctx.fiber.dispose()
  }
})
