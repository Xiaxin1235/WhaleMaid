import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, test, vi } from 'vitest'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import { sequenceIdGen, GoalIdSchema } from '@whalemaid/core'
import { confirmed, draft } from '../../../core/tests/draft-fixtures.js'
import { WhaleStore, sha256 } from '../store/index.js'
import { ScopeService } from '../scope-service.js'
import { GoalIntake } from './service.js'
import { inspectProject, projectPath } from './project.js'
import { dshDraftModel } from './model.js'
import type { Context } from '@deepseek-ai/cordis'
import { createPanelHandler } from '../panel-api/index.js'
import { PANEL_METHODS } from '../panel-api/contract.js'
import { snapshot } from '../../tests/panel-fixture.js'
const peer = { principal: { kind: 'owner' }, signal: new AbortController().signal } as PeerScope
const cleanup: (() => void)[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-intake-')),
    project = join(dir, 'project')
  mkdirSync(project)
  const clock = { now: () => 1000 },
    idGen = sequenceIdGen(),
    log = vi.fn()
  const store = new WhaleStore(join(dir, 'data'), { clock, idGen, log })
  const scopes = new ScopeService(store, { clock, idGen, log, revoked: vi.fn(), hasher: sha256 })
  const model = { generate: vi.fn(async () => '```json\n' + JSON.stringify(draft) + '\n```') }
  const intake = new GoalIntake(store, scopes, model, clock, idGen)
  cleanup.push(
    () => rmSync(dir, { recursive: true, force: true }),
    () => store.close(),
    () => intake.dispose(),
  )
  return { dir, project, clock, store, scopes, model, intake }
}
test('project facts inspect common metadata, Git cleanliness, and never run project scripts', async () => {
  const { project } = setup()
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      scripts: { test: 'exit 1', lint: 'exit 1', typecheck: 'exit 1' },
      packageManager: 'npm@11',
    }),
  )
  writeFileSync(join(project, 'pyproject.toml'), '[project]\nname="fixture"')
  expect((await inspectProject(project)).candidateCommands.map((item) => item.command)).toEqual([
    'npm test',
    'npm run lint',
    'npm run typecheck',
    'pytest',
  ])
  execFileSync('git', ['init', project], { windowsHide: true })
  const facts = await inspectProject(project)
  expect(facts).toMatchObject({ isGit: true, clean: false })
})
test('draft concurrency, cancellation, failure and expiry do not create domain records', async () => {
  const { project, intake, model, clock, store } = setup()
  let resolve!: (value: string) => void
  model.generate.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        resolve = done
      }),
  )
  const first = intake.start({ text: 'Improve tests', projectRoot: project }, peer)
  expect(() => intake.start({ text: 'other', projectRoot: project }, peer)).toThrow('draft-busy')
  await expect.poll(() => model.generate.mock.calls.length).toBe(1)
  resolve('```json\n' + JSON.stringify(draft) + '\n```')
  await expect.poll(() => intake.status(first, peer).state).toBe('ready')
  expect(store.goals.list()).toEqual([])
  clock.now = () => 601001
  expect(() => intake.status(first, peer)).toThrow('draft-expired')
  model.generate.mockRejectedValueOnce(new Error('model-not-configured'))
  const missing = intake.start({ text: 'x', projectRoot: project }, peer)
  await expect.poll(() => intake.status(missing, peer).state).toBe('failed')
  expect(intake.status(missing, peer).error).toBe('model-not-configured')
  expect(intake.cancel(missing, peer)).toEqual({ cancelled: true })
})

test('cancel during project inspection prevents the subsequent model call and releases the draft slot', async () => {
  const { project, intake, store, scopes, model, clock } = setup()
  const facts = await inspectProject(project)
  let resolve!: (value: typeof facts) => void
  const pending = new GoalIntake(
    store,
    scopes,
    model,
    clock,
    sequenceIdGen(),
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  cleanup.push(() => pending.dispose())
  const job = pending.start({ text: 'Analyze', projectRoot: project }, peer)
  pending.cancel(job, peer)
  expect(() => pending.start({ text: 'other', projectRoot: project }, peer)).toThrow('draft-busy')
  resolve(facts)
  await new Promise<void>((done) => setImmediate(done))
  expect(model.generate).not.toHaveBeenCalled()
  const next = pending.start({ text: 'another proposal', projectRoot: project }, peer)
  pending.cancel(next, peer)
  resolve(facts)
  await new Promise<void>((done) => setImmediate(done))
  expect(() => intake.start({ text: 'x'.repeat(4001), projectRoot: project }, peer)).toThrow()
  expect(() => intake.start({ text: 'x', projectRoot: project, extra: true }, peer)).toThrow()
})
test('confirmation uses one transaction and rollback includes goal, scope and initial tasks', async () => {
  const { project, store, scopes, intake } = setup()
  const grant = vi.spyOn(scopes, 'grant').mockImplementationOnce(() => {
    throw new Error('simulated grant failure')
  })
  await expect(intake.confirm(confirmed(project), peer)).rejects.toThrow('simulated grant failure')
  expect(store.goals.list()).toEqual([])
  grant.mockRestore()
  const result = await intake.confirm(confirmed(project), peer)
  const detail = intake.detail({ goalId: result.goal.id }, peer)
  expect(detail.goal.status).toBe('active')
  expect(detail.tasks.map((task) => task.state)).toEqual(['PENDING', 'PENDING', 'PENDING'])
  expect(detail.tasks[0]?.kind).toBe('analyze')
  expect(intake.setPaused({ goalId: result.goal.id, paused: true }, peer).goal.status).toBe('paused')
  scopes.revoke(result.scope.id, peer)
  expect(intake.detail({ goalId: result.goal.id }, peer)).toMatchObject({
    activeScope: null,
    scope: { status: 'revoked' },
  })
})

test('failure after grant and first task insert rolls back the released scope savepoint too', async () => {
  const { project, store, intake, scopes } = setup()
  const grant = vi.spyOn(scopes, 'grant')
  const insert = store.tasks.insert
  let calls = 0
  vi.spyOn(store.tasks, 'insert').mockImplementation((task) => {
    if (++calls === 2) throw new Error('second task write failed')
    insert(task)
  })
  await expect(intake.confirm(confirmed(project), peer)).rejects.toThrow('second task write failed')
  const goalId = GoalIdSchema.parse(grant.mock.calls[0]![0].goalId)
  expect(store.goals.list()).toEqual([])
  expect(store.scopes.list(goalId)).toEqual([])
  expect(store.tasks.list(goalId)).toEqual([])
})

test('candidate detection handles pytest.ini, pnpm scripts, and broken package metadata', async () => {
  const { project } = setup()
  writeFileSync(join(project, 'pytest.ini'), '[pytest]\n')
  writeFileSync(join(project, 'package.json'), '{broken')
  expect((await inspectProject(project)).candidateCommands.map((item) => item.command)).toEqual(['pytest'])
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ scripts: { test: 'never run', lint: 'never run' } }),
  )
  expect((await inspectProject(project)).candidateCommands.map((item) => item.command)).toEqual([
    'pnpm test',
    'pnpm lint',
    'pytest',
  ])
})
test('missing/file roots, escaping symlinks, non-Git writes, extra fields and forbidden commands are refused', async () => {
  const { dir, project, intake } = setup()
  writeFileSync(join(project, 'file.txt'), 'fixture')
  await expect(inspectProject(join(project, 'missing'))).rejects.toThrow()
  await expect(inspectProject(join(project, 'file.txt'))).rejects.toThrow('project-not-directory')
  const outside = join(dir, 'outside')
  mkdirSync(outside)
  symlinkSync(outside, join(project, 'escape'), 'junction')
  await expect(projectPath(project, 'escape/child.txt')).rejects.toThrow('symlink-outside-project')
  await expect(inspectProject(join(project, 'escape'))).rejects.toThrow('project-symlink-root')
  await expect(
    intake.confirm({ ...confirmed(project), permissionPreset: 'workspace-write' }, peer),
  ).rejects.toThrow('non-git-read-only')
  await expect(intake.confirm({ ...confirmed(project), extra: true }, peer)).rejects.toThrow()
  await expect(
    intake.confirm({ ...confirmed(project), verifyCommands: ['git reset --hard'] }, peer),
  ).rejects.toThrow('forbidden-verify-command')
  await expect(intake.confirm(confirmed(project), undefined as unknown as PeerScope)).rejects.toThrow('owner')
})
test('all new routes deny unauthenticated callers before dispatch', async () => {
  const { intake } = setup()
  const handler = createPanelHandler({
    snapshot: () => snapshot,
    setLanguage: vi.fn(),
    goals: () => [],
    setPaused: vi.fn(),
    revokeScope: vi.fn(),
    takeoverStore: vi.fn(),
    intake,
  })
  for (const method of PANEL_METHODS)
    expect(await handler(method, {}, peer.signal, undefined as unknown as PeerScope)).toMatchObject({
      ok: false,
      error: { code: 'whaledot/unauthorized' },
    })
})

test('P07 owner reauthorization replaces hash, disables autopilot, and retains tasks and exact verification commands', async () => {
  const { project, intake, store } = setup()
  execFileSync('git', ['init', project], { windowsHide: true })
  const form = {
    ...confirmed(project),
    permissionPreset: 'workspace-write' as const,
    verifyCommands: ['pnpm test'],
  }
  const created = await intake.confirm(form, peer)
  const goal = store.goals.get(created.goal.id)!
  store.goals.update({ ...goal, autopilot: { enabled: true }, version: goal.version + 1 }, goal.version)
  const tasksBefore = store.tasks.list(goal.id)
  await expect(
    intake.reauthorize(
      { ...form, goalId: goal.id, scopeHash: created.scope.hash, commandMode: 'trusted' },
      peer,
    ),
  ).rejects.toThrow('trusted-requires-risk-confirmation')
  const result = await intake.reauthorize(
    {
      ...form,
      goalId: goal.id,
      scopeHash: created.scope.hash,
      commandMode: 'trusted',
      trustedConfirmed: true,
    },
    peer,
  )
  expect(result.scope?.commandMode).toBe('trusted')
  expect(result.scope?.hash).not.toBe(created.scope.hash)
  expect(result.scope?.verifyCommands).toEqual(['pnpm test'])
  expect(result.goal.autopilot.enabled).toBe(false)
  expect(store.tasks.list(goal.id)).toEqual(tasksBefore)
  await expect(
    intake.reauthorize({ ...form, goalId: goal.id, scopeHash: created.scope.hash }, peer),
  ).rejects.toThrow('scope-version-conflict')
  await expect(
    intake.reauthorize({ ...form, goalId: goal.id, scopeHash: result.scope!.hash }, {
      ...peer,
      principal: { kind: 'companion' },
    } as unknown as PeerScope),
  ).rejects.toThrow('owner')
  const back = await intake.reauthorize({ ...form, goalId: goal.id, scopeHash: result.scope!.hash }, peer)
  expect(back.scope?.commandMode).toBe('confirmed')
  expect(back.goal.autopilot.enabled).toBe(false)
})
test('DSH adapter sends one empty-tools request, requires terminal success and supports missing-model fallback', async () => {
  const options: unknown[] = []
  const ctx = {
    get(name: string) {
      return name === 'agentDefaultModel'
        ? { currentSelection: () => ({ provider: 'test', model: 'test' }) }
        : {
            async *stream(input: unknown) {
              options.push(input)
              yield { type: 'text-delta', index: 0, text: 'draft' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            },
          }
    },
  } as unknown as Context
  expect(await dshDraftModel(ctx).generate('prompt', peer.signal)).toBe('draft')
  expect(options).toHaveLength(1)
  expect(options[0]).toMatchObject({ tools: [], provider: 'test', model: 'test' })
  await expect(
    dshDraftModel({ get: () => undefined } as unknown as Context).generate('x', peer.signal),
  ).rejects.toThrow('model-not-configured')
})

test('incomplete, failed and tool-producing model streams are refused without retry', async () => {
  for (const [chunk, error] of [
    [{ type: 'text-delta', index: 0, text: 'unfinished' }, 'model-call-incomplete'],
    [{ type: 'finish', reason: { kind: 'error' } }, 'model-call-failed'],
    [
      { type: 'tool-call-delta', index: 0, id: 'tool_1', name: 'read', argumentsDelta: '{}' },
      'draft-tools-forbidden',
    ],
  ] as const) {
    let calls = 0
    const ctx = {
      get(name: string) {
        return name === 'agentDefaultModel'
          ? { currentSelection: () => ({ provider: 'test', model: 'test' }) }
          : {
              async *stream() {
                calls++
                yield chunk
              },
            }
      },
    } as unknown as Context
    await expect(dshDraftModel(ctx).generate('prompt', peer.signal)).rejects.toThrow(error)
    expect(calls).toBe(1)
  }
})
