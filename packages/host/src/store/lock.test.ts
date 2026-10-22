import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { acquireWriterLock } from './lock.js'

test('stale reclaim guard expires, fresh guard and changed confirmation remain untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-reclaim-'))
  const dead = spawnSync(process.execPath, ['-e', ''], { windowsHide: true })
  const path = join(dir, 'whaledot.lock'),
    guard = path + '.reclaim'
  try {
    writeFileSync(path, JSON.stringify({ pid: dead.pid, startedAt: 1 }))
    mkdirSync(guard)
    expect(acquireWriterLock(dir, Date.now())).toBeUndefined()
    utimesSync(guard, new Date(0), new Date(0))
    const release = acquireWriterLock(dir, Date.now())
    expect(release).toBeTypeOf('function')
    release!()
    writeFileSync(path, 'new owner')
    expect(acquireWriterLock(dir, Date.now(), 'old owner')).toBeUndefined()
    expect(readFileSync(path, 'utf8')).toBe('new owner')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test.each([false, true])('two real processes elect exactly one writer (dead lock: %s)', async (deadLock) => {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-lock-'))
  const children: ReturnType<typeof spawn>[] = []
  try {
    if (deadLock) {
      const dead = spawnSync(process.execPath, ['-e', ''], { windowsHide: true })
      writeFileSync(join(dir, 'whaledot.lock'), JSON.stringify({ pid: dead.pid, startedAt: 1 }))
    }
    const start = () =>
      new Promise<string>((resolve, reject) => {
        // lock.ts uses only erasable TS syntax supported by the project's Node 24 runtime.
        const code = `import { acquireWriterLock } from ${JSON.stringify(new URL('./lock.ts', import.meta.url).href)};
        const release = acquireWriterLock(${JSON.stringify(dir)}, 1);
        console.log(release ? 'writer' : 'reader');
        if (release) setTimeout(() => { release(); process.exit(0) }, 10000);`
        const child = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true })
        children.push(child)
        child.once('error', reject)
        child.stdout!.once('data', (data: Buffer) => resolve(data.toString().trim()))
        child.once('exit', (code) => {
          if (code) reject(new Error(`Lock process exited: ${code}`))
        })
      })
    expect((await Promise.all([start(), start()])).sort()).toEqual(['reader', 'writer'])
  } finally {
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null) return resolve()
            child.once('exit', () => resolve())
            child.kill()
          }),
      ),
    )
    rmSync(dir, { recursive: true, force: true })
  }
})
