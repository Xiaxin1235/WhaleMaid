import type { RunSignal, SessionEventSource } from './session-events.js'

/** P01 is not merged yet; replace with @whaledot/core's Clock when available. */
export interface Clock {
  now(): number
}

export interface RunState {
  runId: string
  sessionId: string
  status: 'running' | 'ended'
  endReason: RunSignal['endReason'] | null
  toolCalls: number
  startedAt: number
  endedAt: number | null
}

/** One watch denotes one execution. Rewatch explicitly to track another turn. */
export class RunTracker {
  private readonly runs = new Map<string, RunState>()
  constructor(
    private readonly clock: Clock,
    private readonly onRunEnded: (run: Readonly<RunState>) => void,
  ) {}

  watch(sessionId: string, runId: string): void {
    if (this.runs.has(sessionId)) throw new Error(`Session already watched: ${sessionId}`)
    if ([...this.runs.values()].some((run) => run.runId === runId))
      throw new Error(`Run already watched: ${runId}`)
    this.runs.set(sessionId, {
      runId,
      sessionId,
      status: 'running',
      endReason: null,
      toolCalls: 0,
      startedAt: this.clock.now(),
      endedAt: null,
    })
  }
  unwatch(sessionId: string): void {
    this.runs.delete(sessionId)
  }
  get(sessionId: string): Readonly<RunState> | undefined {
    const run = this.runs.get(sessionId)
    return run && { ...run }
  }
  subscribe(source: SessionEventSource): () => void {
    return source.subscribe((signal) => this.accept(signal))
  }
  accept(signal: RunSignal): void {
    const run = this.runs.get(signal.sessionId)
    if (!run || run.status === 'ended') return
    switch (signal.kind) {
      case 'turn-start':
        run.startedAt = this.clock.now()
        break
      case 'tool-call':
        run.toolCalls++
        break
      case 'tool-result':
        break
      case 'turn-end':
      case 'session-disposed':
        run.status = 'ended'
        run.endReason = signal.kind === 'session-disposed' ? 'aborted' : (signal.endReason ?? 'unknown')
        run.endedAt = this.clock.now()
        this.onRunEnded({ ...run })
        break
    }
  }
}
