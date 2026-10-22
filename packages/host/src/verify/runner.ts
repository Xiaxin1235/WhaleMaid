import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { classifyCommand, parseCommandResult } from '@whaledot/core'
import type { CommandResult } from '@whaledot/core'
import { WorktreeManager } from '../execution/worktree.js'

const MAX_LOG = 2 * 1024 * 1024
const MARKER = Buffer.from('\n[WhaleDot: output truncated at 2 MiB]\n')
let batch: Promise<unknown> = Promise.resolve()
let batchesPending = 0
/** Whether independent acceptance or a decision currently owns the host execution slot. */
export function verificationBusy(): boolean {
  return batchesPending > 0
}
/** Execute one verification batch globally; scheduling a batch never starts another model turn. */
export function verificationBatch<T>(work: () => Promise<T>): Promise<T> {
  batchesPending++
  const result = batch.then(work, work).finally(() => {
    batchesPending--
  })
  batch = result.catch(() => undefined)
  return result
}
/** Keep only the explicit build/test environment and exclude credential-like names. */
export function verificationEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(
        ([key, value]) =>
          value !== undefined &&
          /^(?:PATH|PATHEXT|SystemRoot|ComSpec|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|ProgramFiles.*|NUMBER_OF_PROCESSORS|OS|PROCESSOR_.*)$/i.test(
            key,
          ) &&
          !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE/i.test(key),
      ),
    ),
    CI: '1',
  }
}
/** Independent command runner; only exact immutable scope commands reach this adapter. */
export class VerificationRunner {
  private readonly cache = new Map<string, CommandResult>()
  readonly worktrees: WorktreeManager
  constructor(readonly dataDir: string) {
    this.worktrees = new WorktreeManager(dataDir)
  }

  /** Run sequentially in a detached baseline, cache successful observations, always remove the worktree. */
  async baseline(
    project: string,
    commit: string,
    commands: string[],
    runId: string,
    minutes: number,
    authorize: () => void,
  ): Promise<CommandResult[]> {
    const keys = commands.map((command) => JSON.stringify([project.toLowerCase(), commit, command]))
    if (keys.every((key) => this.cache.has(key))) return keys.map((key) => this.cache.get(key)!)
    const parent = join(this.dataDir, 'verification-worktrees')
    await mkdir(parent, { recursive: true })
    const path = await mkdtemp(join(parent, 'baseline-'))
    let added = false
    try {
      authorize()
      await this.worktrees.git(project, ['worktree', 'add', '--detach', path, commit])
      added = true
      const results: CommandResult[] = []
      for (let i = 0; i < commands.length; i++) {
        authorize()
        const result =
          this.cache.get(keys[i]!) ??
          (await this.command(path, commands[i]!, runId, `baseline-${i}`, minutes))
        if (result.status === 'passed' || result.status === 'failed') this.cache.set(keys[i]!, result)
        results.push(result)
      }
      return results
    } finally {
      if (added) await this.worktrees.git(project, ['worktree', 'remove', '--force', path])
      else {
        const { rmdir } = await import('node:fs/promises')
        await rmdir(path)
      }
    }
  }
  /** Execute the confirmed string through cmd.exe, with bounded output and whole-tree timeout cancellation. */
  async command(
    cwd: string,
    command: string,
    runId: string,
    index: string,
    minutes: number,
  ): Promise<CommandResult> {
    if (!/^run_[\w-]+$/.test(runId) || !/^[\w-]+$/.test(index)) throw new Error('invalid-evidence-identity')
    if (classifyCommand(command).class === 'forbidden') throw new Error('command-forbidden')
    const started = Date.now()
    const directory = join(this.dataDir, 'evidence', runId)
    await mkdir(directory, { recursive: true })
    let path = join(
      directory,
      `${index}-${createHash('sha256').update(command).digest('hex').slice(0, 16)}.log`,
    )
    let log = Buffer.alloc(0),
      stdout = '',
      stderr = '',
      truncated = false,
      timedOut = false
    const env = verificationEnv(process.env)
    const child = execFile(
      process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
      process.platform === 'win32' ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command],
      { cwd, env, windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' },
    )
    // execFile's optional callback collector is unnecessary: own bounded streaming collectors retain evidence only.
    child.stdout?.removeAllListeners('data')
    child.stderr?.removeAllListeners('data')
    const collect = (chunk: Buffer | string, stream: 'stdout' | 'stderr') => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (log.length + data.length > MAX_LOG - MARKER.length) truncated = true
      const remaining = Math.max(0, MAX_LOG - MARKER.length - log.length)
      if (remaining) log = Buffer.concat([log, data.subarray(0, remaining)])
      if (stream === 'stdout') stdout = (stdout + data.toString('utf8')).slice(-32768)
      else stderr = (stderr + data.toString('utf8')).slice(-32768)
    }
    child.stdout?.on('data', (data: Buffer) => collect(data, 'stdout'))
    child.stderr?.on('data', (data: Buffer) => collect(data, 'stderr'))
    let killing: Promise<void> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      killing = new Promise<void>((resolve) => {
        if (!child.pid) return resolve()
        if (process.platform === 'win32')
          execFile('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }, () =>
            resolve(),
          )
        else {
          try {
            child.kill('SIGKILL')
          } catch {
            /* already stopped */
          }
          resolve()
        }
      })
    }, minutes * 60000)
    let spawnError = false
    const end = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      child.once('error', () => {
        spawnError = true
      })
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }))
    })
    clearTimeout(timer)
    await killing
    if (truncated) log = Buffer.concat([log, MARKER])
    const originalPath = path
    for (let revision = 1; ; revision++) {
      try {
        await writeFile(path, log, { mode: 0o600, flag: 'wx' })
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        path = originalPath.replace(/\.log$/, `-r${revision}.log`)
      }
    }
    return {
      ...parseCommandResult({ command, ...end, timedOut, spawnError, stdout, stderr }),
      durationMs: Date.now() - started,
      logPath: path,
      hash: createHash('sha256').update(log).digest('hex'),
      tail: (stdout + '\n' + stderr).slice(-8192),
    }
  }
  /** Read only a persisted evidence path and verify its digest before returning the panel tail. */
  async logTail(result: CommandResult): Promise<string> {
    if (!result.logPath || !result.hash) throw new Error('missing-log')
    const content = await readFile(result.logPath)
    if (createHash('sha256').update(content).digest('hex') !== result.hash)
      throw new Error('evidence-log-changed')
    return content.subarray(-8192).toString('utf8')
  }
}
