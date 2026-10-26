import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, appendFile, readFile, readdir, rm, lstat, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { redactSecrets } from '@whalemaid/core'
import { CodexRecordSchema } from './contract.js'
import type { CodexArguments, CodexRecord } from './contract.js'

const exec = promisify(execFile)
const ENV_NAMES = new Set([
  'PATH',
  'PATHEXT',
  'USERPROFILE',
  'HOME',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'CODEX_HOME',
])
export function codexEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => ENV_NAMES.has(key.toUpperCase()) && value !== undefined),
  )
}
export type WindowsSandbox = 'elevated' | 'unelevated'
/**
 * User config is ignored, but on Windows `workspace-write` needs a sandbox backend or Codex
 * blocks every write. Carry over only the backend the user already set up; it enforces, never widens.
 */
export function codexArguments(
  cwd: string,
  mode: CodexArguments['mode'],
  windowsSandbox?: WindowsSandbox,
): string[] {
  const backend = windowsSandbox ? ['-c', `windows.sandbox="${windowsSandbox}"`] : []
  return [
    '--ask-for-approval',
    'never',
    'exec',
    '--ignore-user-config',
    ...backend,
    '--json',
    '-C',
    cwd,
    '-s',
    mode,
    '-',
  ]
}
/** Read only `[windows] sandbox` from the user's Codex config; any other key or value is ignored. */
export function windowsSandboxFrom(configToml: string): WindowsSandbox | undefined {
  let inWindows = false
  for (const raw of configToml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const table = /^\[([^\]]+)\]$/.exec(line)
    if (table) {
      inWindows = table[1]!.trim() === 'windows'
      continue
    }
    const value = inWindows && /^sandbox\s*=\s*"(elevated|unelevated)"$/.exec(line)
    if (value) return value[1] as WindowsSandbox
  }
  return undefined
}
/**
 * Prefer the current standalone install: its `codex-resources` holds the Windows sandbox
 * helpers that writable mode needs. The older Programs copy lacks them.
 */
export async function defaultCodexExecutable(env: NodeJS.ProcessEnv): Promise<string> {
  const home = env.CODEX_HOME || (env.USERPROFILE && join(env.USERPROFILE, '.codex'))
  if (home) {
    const current = join(home, 'packages/standalone/current/bin/codex.exe')
    try {
      if ((await lstat(current)).isFile()) return current
    } catch {
      // Fall back to the older install location.
    }
  }
  return join(env.LOCALAPPDATA ?? env.LocalAppData ?? '', 'Programs/OpenAI/Codex/bin/codex.exe')
}
async function userWindowsSandbox(env: NodeJS.ProcessEnv): Promise<WindowsSandbox | undefined> {
  if (process.platform !== 'win32') return undefined
  const home = env.CODEX_HOME || (env.USERPROFILE && join(env.USERPROFILE, '.codex'))
  if (!home) return undefined
  try {
    return windowsSandboxFrom(await readFile(join(home, 'config.toml'), 'utf8'))
  } catch {
    return undefined
  }
}
export function codexRedactor(env: NodeJS.ProcessEnv) {
  const values = [...new Set(Object.values(env).filter((v): v is string => !!v && v.length >= 4))].sort(
    (a, b) => b.length - a.length,
  )
  return (value: string) => {
    let text = redactSecrets(value)
    for (const secret of values) text = text.split(secret).join('[ENV]')
    return text
  }
}
export interface CodexRunInput extends CodexArguments {
  sessionId: string
  cwd: string
  timeoutMs: number
  signal: AbortSignal
}
export interface CodexResult {
  status: string
  message: string
  record: CodexRecord
}
export interface CodexRunnerOptions {
  executable?: string
  env?: NodeJS.ProcessEnv
  /** Test executable prefix, never obtained from model arguments or configuration. */
  prefix?: string[]
  onProgress?: (message: string) => void
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Capture only process identities, never command lines, credentials or process environments. */
async function descendants(pid: number, env: NodeJS.ProcessEnv): Promise<number[]> {
  if (process.platform !== 'win32') return []
  const shell = join(
    env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  )
  // WMI can stall on a fresh Windows runner. Toolhelp reads process identities
  // directly; retain the same fail-closed verification and termination scope.
  const script = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class WhaleMaidProcessTree {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Entry {
    public uint Size, Usage, Pid;
    public IntPtr Heap;
    public uint Module, Threads, Parent;
    public int Priority;
    public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string File;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static int[] Descendants(int root) {
    IntPtr snapshot=CreateToolhelp32Snapshot(2, 0);
    if(snapshot==new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
    var pairs=new List<uint[]>();
    try {
      var entry=new Entry(); entry.Size=(uint)Marshal.SizeOf(typeof(Entry));
      if(!Process32FirstW(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error());
      do { pairs.Add(new uint[]{entry.Pid,entry.Parent}); } while(Process32NextW(snapshot,ref entry));
      int error=Marshal.GetLastWin32Error(); if(error!=18) throw new Win32Exception(error);
    } finally { CloseHandle(snapshot); }
    var ids=new List<int>(); ids.Add(root);
    for(int i=0;i<ids.Count;i++) foreach(var pair in pairs)
      if(pair[1]==ids[i] && pair[0]>0 && pair[0]<=int.MaxValue && !ids.Contains((int)pair[0])) ids.Add((int)pair[0]);
    return ids.ToArray();
  }
}
'@
$ids=[WhaleMaidProcessTree]::Descendants(${pid}); ConvertTo-Json -InputObject @($ids)`
  const { stdout } = await exec(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    env,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  })
  const ids: unknown = JSON.parse(stdout)
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw Error('process-tree-unverified')
  return ids as number[]
}
export async function stopCodexTree(pid: number, env: NodeJS.ProcessEnv): Promise<void> {
  if (!alive(pid)) return
  if (process.platform === 'win32') {
    let ids = [pid],
      verified = true
    try {
      ids = await descendants(pid, env)
    } catch {
      verified = false
    }
    try {
      await exec(
        join(env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows', 'System32/taskkill.exe'),
        ['/PID', String(pid), '/T', '/F'],
        { env, windowsHide: true, timeout: 15000 },
      )
    } catch {
      if (ids.some(alive)) throw Error('process-tree-stop-failed')
    }
    for (let i = 0; i < 30 && ids.some(alive); i++) await new Promise((r) => setTimeout(r, 100))
    if (ids.some(alive)) throw Error('process-tree-still-running')
    if (!verified) throw Error('process-tree-unverified')
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      if (alive(pid)) throw Error('process-tree-stop-failed')
    }
  }
}

/** Standalone execution/logging adapter. It has no dependency on Autopilot or the pet. */
export class CodexRunner {
  private readonly env: NodeJS.ProcessEnv
  private readonly clean: (text: string) => string
  private current: { controller: AbortController; done: Promise<unknown> } | undefined
  constructor(
    readonly dataDir: string,
    private readonly options: CodexRunnerOptions = {},
  ) {
    this.env = codexEnvironment(options.env ?? process.env)
    this.clean = codexRedactor(options.env ?? process.env)
  }
  previewTask(task: string): string {
    return this.clean(task).slice(0, 300)
  }
  async history(): Promise<CodexRecord[]> {
    const root = join(this.dataDir, 'codex-runs')
    const rows: CodexRecord[] = []
    for (const name of await readdir(root).catch(() => [])) {
      if (!/^run_[a-f0-9-]{36}$/.test(name)) continue
      try {
        rows.push(
          CodexRecordSchema.parse(JSON.parse(await readFile(join(root, name, 'record.json'), 'utf8'))),
        )
      } catch {
        /* An incomplete run is not a completed record. */
      }
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 100)
  }
  private async persist(record: CodexRecord): Promise<void> {
    const dir = join(this.dataDir, 'codex-runs', record.id)
    await mkdir(dir, { recursive: true })
    const temp = join(dir, 'record.tmp')
    await writeFile(temp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 })
    await rename(temp, join(dir, 'record.json'))
    const root = resolve(this.dataDir, 'codex-runs')
    const all: { name: string; at: number }[] = []
    for (const name of await readdir(root)) {
      if (!/^run_[a-f0-9-]{36}$/.test(name)) continue
      try {
        all.push({
          name,
          at: JSON.parse(await readFile(join(root, name, 'record.json'), 'utf8')).at as number,
        })
      } catch {
        /* Preserve unfinished logs. */
      }
    }
    for (const entry of all.sort((a, b) => b.at - a.at).slice(100)) {
      const path = resolve(root, entry.name)
      if (
        !path.startsWith(root + (process.platform === 'win32' ? '\\' : '/')) ||
        (await lstat(path)).isSymbolicLink()
      )
        continue
      await rm(path, { recursive: true, force: true })
    }
  }
  private record(input: Pick<CodexRunInput, 'sessionId' | 'cwd' | 'task' | 'mode'>): CodexRecord {
    const id = `run_${randomUUID()}`
    return {
      id,
      at: Date.now(),
      sessionId: input.sessionId,
      mode: input.mode,
      cwd: this.clean(input.cwd),
      task: this.previewTask(input.task),
      status: 'pending',
      exitCode: null,
      elapsedMs: 0,
      files: [],
      logPath: join(this.dataDir, 'codex-runs', id, 'events.jsonl'),
    }
  }
  async skipped(
    input: Pick<CodexRunInput, 'sessionId' | 'cwd' | 'task' | 'mode'>,
    status: string,
  ): Promise<CodexResult> {
    const record = { ...this.record(input), status }
    await mkdir(join(this.dataDir, 'codex-runs', record.id), { recursive: true })
    await writeFile(record.logPath, JSON.stringify({ type: 'not-started', reason: status }) + '\n', {
      mode: 0o600,
    })
    await this.persist(record)
    return { status, message: status, record }
  }
  run(input: CodexRunInput): Promise<CodexResult> {
    if (this.current) return this.skipped(input, 'busy')
    const controller = new AbortController()
    const done = this.execute({ ...input, signal: AbortSignal.any([input.signal, controller.signal]) })
    this.current = { controller, done }
    void done
      .finally(() => {
        this.current = undefined
      })
      .catch(() => {})
    return done
  }
  async dispose(): Promise<void> {
    this.current?.controller.abort()
    await this.current?.done
  }
  private async gitStatus(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await exec('git', ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z'], {
        cwd,
        env: this.env,
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 2 * 1024 * 1024,
      })
      return stdout.split('\0').filter(Boolean)
    } catch {
      return ['[git status unavailable]']
    }
  }
  private async execute(input: CodexRunInput): Promise<CodexResult> {
    const record = this.record(input),
      started = Date.now()
    const before = input.mode === 'workspace-write' ? await this.gitStatus(input.cwd) : []
    await mkdir(join(this.dataDir, 'codex-runs', record.id), { recursive: true })
    await writeFile(record.logPath, '', { mode: 0o600 })
    let writes: Promise<void> = Promise.resolve(),
      logError: unknown
    let final = '',
      stderr = '',
      buffer = '',
      stderrBuffer = '',
      blocked = false,
      exitCode: number | null = null,
      status = 'failed',
      stopReason = '',
      killFailure: unknown
    const decoder = new StringDecoder('utf8'),
      errorDecoder = new StringDecoder('utf8')
    const log = (value: unknown) => {
      const safe = JSON.parse(
        JSON.stringify(value, (_key, v: unknown) => (typeof v === 'string' ? this.clean(v) : v)),
      ) as unknown
      const line = JSON.stringify(safe) + '\n'
      writes = writes
        .then(() => appendFile(record.logPath, line, { mode: 0o600 }))
        .catch((error) => {
          logError = error
        })
    }
    const line = (text: string) => {
      try {
        const event = JSON.parse(text) as {
          type?: string
          item?: { type?: string; text?: string; aggregated_output?: string }
          error?: unknown
        }
        log(event)
        if (
          event.type === 'item.completed' &&
          event.item?.type === 'agent_message' &&
          typeof event.item.text === 'string'
        )
          final = this.clean(event.item.text)
        if (/blocked by policy|sandbox.*denied|access.*denied/i.test(event.item?.aggregated_output ?? ''))
          blocked = true
        if (event.type === 'item.started' && event.item?.type === 'command_execution')
          this.options.onProgress?.('Codex is running a command')
      } catch {
        log({ type: 'unparsed-output', text })
      }
    }
    if (input.signal.aborted) return this.skipped(input, 'cancelled')
    const executable = this.options.executable ?? (await defaultCodexExecutable(this.env))
    const windowsSandbox = input.mode === 'workspace-write' ? await userWindowsSandbox(this.env) : undefined
    if (input.signal.aborted) return this.skipped(input, 'cancelled')
    const child = spawn(
      executable,
      [...(this.options.prefix ?? []), ...codexArguments(input.cwd, input.mode, windowsSandbox)],
      {
        cwd: input.cwd,
        env: this.env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const completion = new Promise<number | null>((resolve, reject) => {
      child.once('close', resolve)
      child.once('error', reject)
    })
    void completion.catch(() => {})
    if (child.pid) record.pid = child.pid
    let killing: Promise<void> | undefined
    const stop = (reason: string) => {
      if (killing || !child.pid) return
      stopReason = reason
      killing = stopCodexTree(child.pid, this.env).catch((error) => {
        log({
          type: 'cleanup-failed',
          error: this.clean(error instanceof Error ? error.message : String(error)),
        })
        killFailure = error
        child.kill()
      })
    }
    const abort = () => stop('cancelled')
    input.signal.addEventListener('abort', abort, { once: true })
    if (input.signal.aborted) abort()
    const timer = setTimeout(() => stop('timeout'), input.timeoutMs)
    child.stdout.on('data', (bytes: Buffer) => {
      buffer += decoder.write(bytes)
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
      }
    })
    const errorLine = (raw: string) => {
      const text = this.clean(raw)
      if (
        /blocked by policy|blocked by read-only sandbox|sandbox.*denied|rejected by user approval settings/i.test(
          text,
        )
      )
        blocked = true
      stderr = (stderr + text + '\n').slice(-32000)
      log({ type: 'stderr', text })
    }
    child.stderr.on('data', (bytes: Buffer) => {
      stderrBuffer += errorDecoder.write(bytes)
      let index: number
      while ((index = stderrBuffer.indexOf('\n')) >= 0) {
        errorLine(stderrBuffer.slice(0, index))
        stderrBuffer = stderrBuffer.slice(index + 1)
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input.task)
    try {
      await this.persist({ ...record, status: 'running' })
      exitCode = await completion
    } catch (error) {
      stderr = error instanceof Error ? this.clean(error.message) : 'spawn-failed'
      if (child.pid && alive(child.pid)) {
        stop('logging-failed')
        await completion.catch(() => {})
      }
    } finally {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', abort)
      await killing
    }
    buffer += decoder.end()
    stderrBuffer += errorDecoder.end()
    if (buffer) line(buffer)
    if (stderrBuffer) errorLine(stderrBuffer)
    status = killFailure
      ? 'cleanup-failed'
      : stopReason ||
        (exitCode === 0
          ? blocked
            ? 'sandbox-blocked'
            : 'completed'
          : /not logged|log in|login|authentication|401/i.test(stderr)
            ? 'not-logged-in'
            : 'failed')
    const after = input.mode === 'workspace-write' ? await this.gitStatus(input.cwd) : []
    record.files = [
      ...new Set([
        ...before.filter((v) => !after.includes(v)).map((v) => 'before: ' + v),
        ...after.filter((v) => !before.includes(v)).map((v) => 'after: ' + v),
      ]),
    ].map(this.clean)
    record.status = status
    record.exitCode = exitCode
    record.elapsedMs = Date.now() - started
    await writes
    if (logError) {
      status = 'logging-failed'
      record.status = status
    }
    await this.persist(record)
    const message = final || this.clean(stderr).slice(-2000) || status
    return {
      status,
      message:
        message.length > 8000 ? message.slice(0, 8000) + '\n[已截断 / truncated: 8000 characters]' : message,
      record,
    }
  }
}
