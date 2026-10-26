import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
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
  expect(Config({}).language?.get()).toBe('auto')
  expect(Config({}).debugLogSignals).toBe(false)
  expect(Config({}).companion?.memory?.draftProjectLessons?.get()).toBe(false)
  expect(
    Config({
      companion: { memory: { draftProjectLessons: true } },
    }).companion?.memory?.draftProjectLessons?.get(),
  ).toBe(true)
  await expect
    .poll(async () => JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')))
    .toMatchObject({
      version: '1.1.0',
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

test('status updates replace the file inode with a complete snapshot', async () => {
  const { ctx, dir } = await setup()
  const path = join(dir, 'status.json')
  const previous = '{"previous":"complete snapshot"}\n'
  await writeFile(path, previous)
  const before = await stat(path, { bigint: true })
  await apply(ctx, { dataDir: dir })
  expect((await stat(path, { bigint: true })).ino).not.toBe(before.ino)
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    version: '1.1.0',
    services: { gateway: false, commands: false, userQuestions: false },
  })
  expect(await readdir(dir)).toEqual(
    expect.arrayContaining(['debug', 'status.json', 'whaledot.db', 'whaledot.lock']),
  )
})

test('atomic replacement failure is logged without rejecting startup or leaving temporary files', async () => {
  const { ctx, dir } = await setup()
  await mkdir(join(dir, 'status.json'))
  await expect(apply(ctx, { dataDir: dir })).resolves.toBeUndefined()
  expect(await readdir(dir)).toEqual(expect.arrayContaining(['debug', 'status.json', 'whaledot.db']))
  expect(await readdir(join(dir, 'status.json'))).toEqual([])
  expect(ctx.logger.buffer.some((row) => row.type === 'error' && row.args[0] === 'plugin degraded')).toBe(
    true,
  )
})

test('host declares compatible dependency ranges for home paths and schemastery', () => {
  const manifest = createRequire(import.meta.url)('dsh-whalemaid/package.json') as {
    dependencies: Record<string, string>
  }
  expect(manifest.dependencies).toMatchObject({
    '@deepseek-ai/dsh-home-paths': '^0.2.1-rc.2',
    '@deepseek-ai/schemastery': '^3.18.4',
  })
})

test('synchronous initialization error is contained even if logger is unavailable', async () => {
  const { dir } = await setup()
  const error = new Error('logger unavailable')
  const ctx = {
    logger() {
      throw error
    },
  } as unknown as Context
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(apply(ctx, { dataDir: dir })).resolves.toBeUndefined()
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
