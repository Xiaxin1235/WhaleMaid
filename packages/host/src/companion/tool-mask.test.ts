import { afterEach, expect, test, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installCompanionToolMask } from './tool-mask.js'

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function fixture(preset: string, registered: string[]) {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const lift = vi.fn()
  const scopeTools = {
    get: vi.fn((name: string) => (registered.includes(name) ? { name } : undefined)),
    restrict: vi.fn(() => lift),
  }
  const agent = { session: { id: 's', header: { agentPreset: preset } }, ctx: { get: () => scopeTools } }
  ctx.provide('agents', { list: () => [agent] } as never)
  ctx.provide('tools', { register: vi.fn(() => vi.fn()) } as never)
  return { ctx, scopeTools, lift, registered }
}

test('her session only sees the registered companion tools', async () => {
  const f = fixture('whaledot-companion', [
    'whaledot_goals_overview',
    'whaledot_propose_goal',
    'bash',
    'glob',
  ])
  installCompanionToolMask(
    f.ctx,
    new Set(['whaledot_propose_goal', 'whaledot_goals_overview', 'ask_user_question']),
  )
  await vi.waitFor(() => expect(f.scopeTools.restrict).toHaveBeenCalled())
  expect(f.scopeTools.restrict).toHaveBeenCalledWith({
    allow: ['whaledot_goals_overview', 'whaledot_propose_goal'],
  })
})

test('other sessions are left alone', async () => {
  const f = fixture('standard', ['bash', 'whaledot_goals_overview'])
  installCompanionToolMask(f.ctx, new Set(['whaledot_goals_overview']))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(f.scopeTools.restrict).not.toHaveBeenCalled()
})

test('nothing registered yet means no mask rather than an empty allow list', async () => {
  const f = fixture('whaledot-companion', ['bash'])
  installCompanionToolMask(f.ctx, new Set(['whaledot_goals_overview']))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(f.scopeTools.restrict).not.toHaveBeenCalled()
})
