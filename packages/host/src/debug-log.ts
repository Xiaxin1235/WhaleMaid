import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RunSignal } from './bridge/session-events.js'

/** Local diagnostics never retain messages, tool arguments, results, or raw events. */
export class DebugLog {
  constructor(
    private readonly dataDir: string,
    private readonly signalsEnabled = false,
    private readonly maxBytes = 1024 * 1024,
  ) {}

  signal(signal: RunSignal): void {
    if (!this.signalsEnabled) return
    const { sessionId, kind, at, toolName, endReason } = signal
    this.append('signals.jsonl', { sessionId, kind, at, toolName, endReason })
  }

  host(message: string, error?: unknown): void {
    this.append('host.log', {
      at: Date.now(),
      message,
      ...(error instanceof Error ? { error: error.message } : {}),
    })
  }

  private append(file: string, value: unknown): void {
    try {
      const dir = join(this.dataDir, 'debug')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, file)
      const line = JSON.stringify(value) + '\n'
      let size = 0
      try {
        size = statSync(path).size
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (size > 0 && size + Buffer.byteLength(line) > this.maxBytes) {
        rmSync(path + '.1', { force: true })
        renameSync(path, path + '.1')
      }
      appendFileSync(path, line, { mode: 0o600 })
    } catch {
      // Diagnostic IO failure must not interrupt a DSH event or recurse into logging.
      console.error('[whaledot] diagnostic log unavailable')
    }
  }
}
