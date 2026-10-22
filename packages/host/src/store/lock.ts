import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const LockSchema = z.strictObject({
  pid: z.int().positive(),
  startedAt: z.int().nonnegative(),
  token: z.string().min(1).optional(),
})

/** Permission errors and PID reuse conservatively count as an active owner. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/** Exclusive file creation, with a separate exclusive guard serializing dead-owner takeover. */
export function acquireWriterLock(dataDir: string, startedAt: number): (() => void) | undefined {
  const path = join(dataDir, 'whaledot.lock')
  const token = randomUUID()
  const content = JSON.stringify({ pid: process.pid, startedAt, token })
  function create(): boolean {
    try {
      writeFileSync(path, content, { flag: 'wx', mode: 0o600 })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw error
    }
  }
  function ownerIsDead(): boolean {
    try {
      const row = LockSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
      // An incomplete/unknown lock is never grounds for stealing it.
      return row.success && !isAlive(row.data.pid)
    } catch {
      return false
    }
  }
  if (!create()) {
    if (!ownerIsDead()) return undefined
    const guard = path + '.reclaim'
    try {
      mkdirSync(guard)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined
      throw error
    }
    try {
      // Recheck after winning the guard; another contender may already have replaced the owner.
      if (!ownerIsDead()) return undefined
      unlinkSync(path)
      if (!create()) return undefined
    } finally {
      rmdirSync(guard)
    }
  }
  return () => {
    try {
      if (readFileSync(path, 'utf8') === content) unlinkSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
