import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, test, vi } from 'vitest'
import { apply, Config, name } from './index.js'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.restoreAllMocks()
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'whaledot-'))
  const ctx = new Context()
  cleanup.push(
    () => rm(dir, { recursive: true, force: true }),
    () => ctx.fiber.dispose(),
  )
  return { dir, ctx }
}

test('loads through real Cordis and writes service availability', async () => {
  const { ctx, dir } = await setup()
  ctx.provide('commands', {})
  ctx.provide('typertGateway', {})
  await apply(ctx, { dataDir: dir })
  expect(name).toBe('whaledot')
  expect(Config({})).toEqual({ debugLogSignals: false })
  await expect
    .poll(async () => JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')))
    .toMatchObject({
      version: '0.0.0',
      services: { gateway: true, commands: true, userQuestions: false },
    })
  expect(ctx.logger.buffer.some((row) => row.name === 'whaledot' && row.args[0] === 'plugin loaded')).toBe(
    true,
  )
  // Optional availability is updated when a service appears after apply.
  ctx.provide('userQuestions', {})
  await expect
    .poll(async () => JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')))
    .toMatchObject({ services: { userQuestions: true } })
})

test('synchronous initialization error is contained even if logger is unavailable', async () => {
  const error = new Error('logger unavailable')
  const ctx = {
    logger() {
      throw error
    },
  } as unknown as Context
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(apply(ctx)).resolves.toBeUndefined()
  expect(report).toHaveBeenCalledWith('[whaledot] failed to load plugin', error)
})

test('async filesystem failure degrades without rejecting startup', async () => {
  const { ctx, dir } = await setup()
  const file = join(dir, 'file')
  await writeFile(file, '')
  await expect(apply(ctx, { dataDir: join(file, 'child') })).resolves.toBeUndefined()
  expect(ctx.logger.buffer.some((row) => row.type === 'error' && row.args[0] === 'plugin degraded')).toBe(
    true,
  )
})
