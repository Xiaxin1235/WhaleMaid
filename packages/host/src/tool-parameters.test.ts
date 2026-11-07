import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, * as dshTools from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { CodexArgumentsSchema } from './codex/contract.js'
import { CodexRunner } from './codex/runner.js'
import { ConversationCodex } from './codex/service.js'
import { companionTools, COMPANION_TOOL_NAMES } from './companion/tools.js'
import type { CompanionApi } from './companion/service.js'
import { WhaleStore } from './store/index.js'

const cleanups: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function registry(mode: 'native' | 'ptc') {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const sections: { name: string; text: (context: { scope?: Context }) => string }[] = []
  const wire = vi.fn()
  ctx.provide('systemPrompt', {
    tools: wire,
    section(section: (typeof sections)[number]) {
      sections.push(section)
      return () => {}
    },
    getSectionOrder: () => 0,
  } as never)
  // Only the SDK language is needed to assemble the real prompt; no code or model runs.
  ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' } as never)
  const legacy = !('projectToolSchema' in dshTools)
  const tools = Reflect.construct(ToolRuntime, legacy ? [ctx, { mode }] : [ctx]) as ToolRuntime
  if (!legacy) {
    // DSH 0.2.2 mounts independent executors. They are only in the newer SDK test install.
    const pkg = '@deepseek-ai/dsh-tool-executor-' + mode
    const { NativeToolExecutor, PtcExecutor } = await import(pkg)
    if (!ctx.get('tools')) ctx.provide('tools', tools)
    const executor = new (mode === 'native' ? NativeToolExecutor : PtcExecutor)(ctx)
    const definitions = () => (tools as ToolRuntime & { definitions(): ToolDefinition[] }).definitions()
    return {
      ctx,
      tools,
      legacy,
      nativeSchemas: () => executor.describe(definitions()).schemas as ToolDefinition[],
      sdk: () =>
        executor.sections
          .find((section: { name: string }) => section.name === 'tools:sdk')
          .text(definitions()) as string,
    }
  }
  return {
    ctx,
    tools,
    legacy,
    nativeSchemas: () => wire.mock.calls[0]![0]({}).schemas as ToolDefinition[],
    sdk: () => sections.find((section) => section.name === 'tools:sdk')!.text({}),
  }
}

async function codexTool(ctx: Context) {
  const dir = await mkdtemp(join(tmpdir(), 'whalemaid-tool-schema-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }))
  const store = new WhaleStore(join(dir, 'store'), { log: vi.fn() })
  cleanups.push(() => store.close())
  const runner = new CodexRunner(join(dir, 'data'))
  cleanups.push(() => runner.dispose())
  const run = vi.spyOn(runner, 'run')
  const service = new ConversationCodex(ctx, store, { has: () => false }, runner)
  expect(store.codexSettings().enabled).toBe(false)
  return { definition: service.tool(), run }
}

test('lossless schema projection rejects raw Zod metadata before execution', async () => {
  const f = await registry('ptc')
  const { definition, run } = await codexTool(f.ctx)
  definition.parameters = z.toJSONSchema(CodexArgumentsSchema, {
    io: 'input',
  }) as ToolDefinition['parameters']
  expect(Object.getOwnPropertyDescriptor(definition.parameters, '~standard')?.enumerable).toBe(false)
  const native = await registry('native')
  native.tools.register(definition)
  expect(() => native.nativeSchemas()).not.toThrow()
  expect(() => f.tools.register(definition)).not.toThrow()
  const project = () => (f.legacy ? f.sdk() : f.tools.schemas())
  expect(project).toThrow('tool "codex" parameters must be lossless JSON before schema projection')
  expect(run).not.toHaveBeenCalled()
})

test.each(['native', 'ptc'] as const)('%s can assemble the disabled Codex tool', async (mode) => {
  const f = await registry(mode)
  const { definition, run } = await codexTool(f.ctx)
  f.tools.register(definition)
  expect(() => f.tools.schemas()).not.toThrow()
  expect(definition.parameters).toMatchObject({
    type: 'object',
    properties: {
      task: { type: 'string', minLength: 1, maxLength: 8000 },
      mode: { enum: ['read-only', 'workspace-write'], default: 'read-only' },
    },
    required: ['task'],
    additionalProperties: false,
  })
  if (mode === 'ptc') expect(f.sdk()).toContain('codex')
  else expect(f.nativeSchemas().map((tool) => tool.name)).toContain('codex')
  expect(run).not.toHaveBeenCalled()
})

test('all companion tools survive lossless projection and real PTC SDK rendering', async () => {
  const f = await registry('ptc')
  // Tool creation must not read memory, propose actions, or access sessions.
  const api = new Proxy({} as CompanionApi, {
    get() {
      throw new Error('Prompt assembly must not execute a companion capability')
    },
  })
  for (const definition of companionTools(api)) f.tools.register(definition)
  expect(() => f.tools.schemas()).not.toThrow()
  const sdk = f.sdk()
  for (const name of COMPANION_TOOL_NAMES) expect(sdk).toContain(name)
})
