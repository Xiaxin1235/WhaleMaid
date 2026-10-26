import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { WhaleStore } from '../store/index.js'
import { installCompanionPermission } from './permission.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  // Close the store and context before removing the directory they live in.
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function fixture(preset: string, sessionId = 's_companion') {
  const dir = mkdtempSync(join(tmpdir(), 'companion-permission-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const store = new WhaleStore(dir, { log: vi.fn() })
  cleanups.push(() => store.close())
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  let current = preset
  const presets = {
    current: vi.fn(() => current),
    set: vi.fn((_session: unknown, next: string) => {
      current = next
    }),
  }
  const agent = { session: { id: sessionId, header: { agentPreset: 'whaledot-companion' } } }
  ctx.provide('agents', { list: () => [agent] } as never)
  ctx.provide('permissionPresets', presets as never)
  return { ctx, store, presets }
}

test('her old read-only session moves to workspace-write once, then the user owns the preset', async () => {
  const f = fixture('read-only')
  f.store.setCompanionSession({ sessionId: 's_companion', createdAt: 1, previous: [] })
  installCompanionPermission(f.ctx, f.store, vi.fn())
  await vi.waitFor(() => expect(f.presets.set).toHaveBeenCalledWith(expect.anything(), 'workspace-write'))
  expect(f.store.companionSession()?.writable).toBe(true)
})

test('an already released or newly created session is never touched', async () => {
  const f = fixture('read-only')
  f.store.setCompanionSession({ sessionId: 's_companion', createdAt: 1, previous: [], writable: true })
  installCompanionPermission(f.ctx, f.store, vi.fn())
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(f.presets.set).not.toHaveBeenCalled()
})

test('another preset the user picked is kept; only the flag is recorded', async () => {
  const f = fixture('danger-full-access')
  f.store.setCompanionSession({ sessionId: 's_companion', createdAt: 1, previous: [] })
  installCompanionPermission(f.ctx, f.store, vi.fn())
  await vi.waitFor(() => expect(f.store.companionSession()?.writable).toBe(true))
  expect(f.presets.set).not.toHaveBeenCalled()
})
