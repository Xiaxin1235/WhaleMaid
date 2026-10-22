import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vitest'
import { fixedClock, sequenceIdGen, RunSchema, DEFAULT_PROTECTED_NAMES, hashScope } from '@whaledot/core'
import { makeGoal, makeTask } from '../../../core/tests/fixtures.js'
import { makeScope } from '../../../core/tests/fixtures.js'
import { WhaleStore, sha256 } from './index.js'
import { MIGRATIONS } from './migrations.js'
import type { Migration } from './migrations.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-store-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
function open(dir = directory(), migrations?: readonly Migration[]) {
  const log = vi.fn()
  const store = new WhaleStore(dir, {
    clock: fixedClock(1000),
    idGen: sequenceIdGen(),
    log,
    ...(migrations ? { migrations } : {}),
  })
  cleanups.push(() => store.close())
  return { store, dir, log }
}
function sql(dir: string, callback: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(join(dir, 'whaledot.db'))
  try {
    callback(db)
  } finally {
    db.close()
  }
}
function seed(store: WhaleStore) {
  store.goals.insert(makeGoal())
  store.tasks.insert(makeTask())
}

test('migrations are ordered/idempotent; PRAGMAs and all required tables exist', () => {
  const { store, dir } = open()
  expect(store.status()).toEqual({ state: 'ok', corruptRows: 0 })
  sql(dir, (db) => {
    expect(db.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name)
    expect(tables.sort()).toEqual(
      [
        'schema_migrations',
        'goals',
        'scopes',
        'tasks',
        'state_transitions',
        'runs',
        'attempts',
        'checkpoints',
        'evidence',
        'notifications',
        'suggestions',
        'kv_settings',
      ].sort(),
    )
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual(
      MIGRATIONS.map(({ version }) => ({ version })),
    )
  })
  store.close()
  expect(open(dir).store.status().state).toBe('ok')
  expect(readdirSync(dir)).not.toContain('backups')
})

test('close/reopen preserves goals, tasks, runs, transitions and global pause', () => {
  const { store, dir } = open()
  seed(store)
  expect(store.paused()).toBe(false)
  store.setPaused(true)
  expect(
    store.tasks.transition(makeTask().id, 'READY', { expectedVersion: 0, source: 'test', reason: 'ready' })
      .ok,
  ).toBe(true)
  const run = RunSchema.parse({
    run_id: 'run_1',
    taskId: 'task_1',
    sessionId: 'session_1',
    worktreePath: 'C:/proj',
    baseCommit: 'abc',
    startedAt: 100,
  })
  store.runs.insert(run)
  store.runs.update({ ...run, endedAt: 200, outcome: 'PASS' })
  store.close()
  const reopened = open(dir).store
  expect(reopened.goals.get(makeGoal().id)).toEqual(makeGoal())
  expect(reopened.tasks.list(makeGoal().id)[0]).toMatchObject({ state: 'READY', version: 1 })
  expect(reopened.transitions.list(makeTask().id)).toHaveLength(1)
  expect(reopened.runs.get(run.run_id)).toMatchObject({ endedAt: 200, outcome: 'PASS' })
  expect(reopened.runs.list(makeTask().id)).toHaveLength(1)
  expect(reopened.paused()).toBe(true)
})

test('live PID yields read-only access and cannot mutate or steal writer lock', () => {
  const { store, dir } = open()
  seed(store)
  const lock = readFileSync(join(dir, 'whaledot.lock'), 'utf8')
  const reader = open(dir).store
  expect(reader.status()).toMatchObject({ state: 'read-only', message: '另一个 DSH 正在使用 WhaleDot 数据' })
  expect(reader.goals.list()).toHaveLength(1)
  expect(() => reader.setPaused(true)).toThrow('store-unavailable')
  expect(() => reader.goals.insert(makeGoal())).toThrow('store-unavailable')
  expect(() =>
    reader.tasks.transition(makeTask().id, 'READY', { expectedVersion: 0, source: 'x', reason: 'x' }),
  ).toThrow('store-unavailable')
  reader.close()
  expect(readFileSync(join(dir, 'whaledot.lock'), 'utf8')).toBe(lock)
  expect(store.status().state).toBe('ok')
})

test('explicit takeover recovers a reused live PID and reopens the same repository handles', () => {
  const dir = directory()
  writeFileSync(join(dir, 'whaledot.lock'), JSON.stringify({ pid: process.pid, startedAt: 1 }))
  const { store, log } = open(dir)
  expect(store.status().state).toBe('read-only')
  store.takeover()
  expect(store.status().state).toBe('ok')
  store.goals.insert(makeGoal())
  expect(store.goals.list()).toHaveLength(1)
  expect(log).toHaveBeenCalledWith('store takeover completed')
})

test('a dead PID can be taken over, while malformed locks remain untouched', () => {
  const dir = directory()
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true })
  expect(child.status).toBe(0)
  writeFileSync(join(dir, 'whaledot.lock'), JSON.stringify({ pid: child.pid, startedAt: 1 }))
  const { store } = open(dir)
  expect(store.status().state).toBe('ok')
  expect(JSON.parse(readFileSync(join(dir, 'whaledot.lock'), 'utf8')).pid).toBe(process.pid)
  store.close()
  writeFileSync(join(dir, 'whaledot.lock'), 'partial')
  expect(open(dir).store.status().state).toBe('read-only')
  expect(readFileSync(join(dir, 'whaledot.lock'), 'utf8')).toBe('partial')
})

test('migration failure rolls back schema and data, closes DB, releases lock and degrades', () => {
  const { store, dir } = open()
  store.goals.insert(makeGoal())
  store.close()
  const bad: Migration = {
    version: MIGRATIONS.length + 1,
    up(db) {
      db.exec('CREATE TABLE should_rollback(id TEXT); DELETE FROM goals;')
      throw new Error('migration failed')
    },
  }
  const failed = open(dir, [...MIGRATIONS, bad])
  expect(failed.store.status()).toMatchObject({ state: 'error', message: 'migration failed' })
  expect(failed.log).toHaveBeenCalledWith('store degraded', expect.any(Error))
  expect(() => failed.store.goals.list()).toThrow('store-unavailable')
  sql(dir, (db) => {
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='should_rollback'").get()).toBeUndefined()
    expect(db.prepare('SELECT COUNT(*) AS n FROM goals').get()?.n).toBe(1)
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual(
      MIGRATIONS.map(({ version }) => ({ version })),
    )
  })
  expect(open(dir).store.status().state).toBe('ok')
  const backups = readdirSync(join(dir, 'backups'))
  expect(backups).toHaveLength(1)
  const backup = new DatabaseSync(join(dir, 'backups', backups[0]!), { readOnly: true })
  try {
    expect(backup.prepare('SELECT COUNT(*) AS n FROM goals').get()?.n).toBe(1)
  } finally {
    backup.close()
  }
})

test('pending migrations back up committed WAL data and retain only five recent backups', () => {
  const { store, dir } = open()
  store.goals.insert(makeGoal())
  store.close()
  for (let version = 2; version <= 8; version++) {
    const migrations = [
      ...MIGRATIONS,
      ...Array.from({ length: version - 1 }, (_, i) => ({
        version: i + MIGRATIONS.length + 1,
        up(db: DatabaseSync) {
          db.exec(`CREATE TABLE extra_${i + 2}(id TEXT)`)
        },
      })),
    ]
    const next = open(dir, migrations).store
    expect(next.status().state).toBe('ok')
    expect(next.goals.list()).toHaveLength(1)
    next.close()
  }
  expect(readdirSync(join(dir, 'backups'))).toHaveLength(5)
})

test('migration backup includes data that is still in a committed WAL', () => {
  const { store, dir } = open()
  store.close()
  const external = new DatabaseSync(join(dir, 'whaledot.db'))
  try {
    external.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0')
    external
      .prepare('INSERT INTO goals(id,version,data) VALUES(?,?,?)')
      .run(makeGoal().id, 0, JSON.stringify(makeGoal()))
    expect(readFileSync(join(dir, 'whaledot.db-wal')).length).toBeGreaterThan(0)
    const migrated = open(dir, [...MIGRATIONS, { version: MIGRATIONS.length + 1, up() {} }]).store
    expect(migrated.status().state).toBe('ok')
    const filename = readdirSync(join(dir, 'backups'))[0]!
    const backup = new DatabaseSync(join(dir, 'backups', filename), { readOnly: true })
    try {
      expect(backup.prepare('SELECT id FROM goals').all()).toEqual([{ id: makeGoal().id }])
    } finally {
      backup.close()
    }
  } finally {
    external.close()
  }
})

test('stale versions and SQL CAS misses do not write transitions', () => {
  const { store, dir } = open()
  seed(store)
  const meta = { expectedVersion: 0, source: 'test', reason: 'ready' }
  expect(store.tasks.transition(makeTask().id, 'READY', { ...meta, expectedVersion: 1 })).toMatchObject({
    ok: false,
    error: { code: 'stale-version' },
  })
  sql(dir, (db) =>
    db.exec('CREATE TRIGGER ignore_update BEFORE UPDATE ON tasks BEGIN SELECT RAISE(IGNORE); END'),
  )
  expect(store.tasks.transition(makeTask().id, 'READY', meta)).toMatchObject({
    ok: false,
    error: { code: 'stale-version' },
  })
  expect(store.tasks.get(makeTask().id)).toEqual(makeTask())
  expect(store.transitions.list(makeTask().id)).toEqual([])
})

test('transition insertion failure rolls back task update; successful retry commits both', () => {
  const { store, dir } = open()
  seed(store)
  sql(dir, (db) =>
    db.exec(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON state_transitions BEGIN SELECT RAISE(ABORT,'simulated fault'); END",
    ),
  )
  const meta = { expectedVersion: 0, source: 'test', reason: 'ready' }
  expect(() => store.tasks.transition(makeTask().id, 'READY', meta)).toThrow('simulated fault')
  expect(store.tasks.get(makeTask().id)).toEqual(makeTask())
  expect(store.transitions.list(makeTask().id)).toEqual([])
  sql(dir, (db) => db.exec('DROP TRIGGER fail_insert'))
  expect(store.tasks.transition(makeTask().id, 'READY', meta)).toMatchObject({ ok: true })
  expect(store.tasks.get(makeTask().id)).toMatchObject({ state: 'READY', version: 1 })
  expect(store.transitions.list(makeTask().id)[0]).toMatchObject({ from: 'PENDING', to: 'READY', at: 1000 })
  expect(() => store.tasks.insert(makeTask('task_2', { state: 'READY' }))).toThrow('PENDING')
  expect(() =>
    store.tasks.insert(makeTask('task_3', { goalId: makeGoal({ id: 'absent' as never }).id })),
  ).toThrow('FOREIGN KEY')
})

test('bad JSON, schema-invalid rows, and mismatched indexes are skipped and counted once', () => {
  const { store, dir, log } = open()
  store.goals.insert(makeGoal())
  sql(dir, (db) => {
    db.prepare('INSERT INTO goals VALUES(?,?,?)').run('broken_json', 0, '{')
    db.prepare('INSERT INTO goals VALUES(?,?,?)').run('broken_schema', 0, '{}')
    db.prepare('INSERT INTO goals VALUES(?,?,?)').run('wrong_id', 0, JSON.stringify(makeGoal()))
  })
  expect(store.goals.list()).toEqual([makeGoal()])
  expect(store.goals.list()).toHaveLength(1)
  expect(store.status().corruptRows).toBe(3)
  expect(log.mock.calls.filter(([message]) => message.startsWith('corrupt record'))).toHaveLength(3)
  sql(dir, (db) => db.prepare("INSERT INTO kv_settings VALUES('autopilot.paused','\"false\"')").run())
  expect(store.paused()).toBe(true)
  expect(store.status().corruptRows).toBe(4)
})

test('v1 scopes receive nested secret defaults, an audit marker and a valid recomputed hash', () => {
  const { store, dir } = open(directory(), MIGRATIONS.slice(0, 1))
  seed(store)
  const old = { ...makeScope() } as Record<string, unknown>
  delete old.protectedNames
  sql(dir, (db) =>
    db
      .prepare('INSERT INTO scopes(id,goal_id,status,data) VALUES(?,?,?,?)')
      .run('scope_1', 'goal_1', 'active', JSON.stringify(old)),
  )
  store.close()
  const migrated = open(dir).store
  const scope = migrated.scopes.get(makeScope().id)!
  expect(scope.protectedNames).toEqual([...DEFAULT_PROTECTED_NAMES])
  expect(scope.legacyAuthorization).toBe(true)
  expect(hashScope(scope, sha256)).toEqual({ ok: true, value: scope.hash })
})
