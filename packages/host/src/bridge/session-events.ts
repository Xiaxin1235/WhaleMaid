import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

export interface RunSignal {
  sessionId: string
  kind: 'turn-start' | 'tool-call' | 'tool-result' | 'turn-end' | 'session-disposed'
  at: number
  toolName?: string
  endReason?: 'completed' | 'error' | 'max-tokens' | 'interrupted' | 'blocked' | 'aborted' | 'unknown'
  raw?: unknown
}

export interface SessionEventSource {
  subscribe(cb: (signal: RunSignal) => void): () => void
}

/** DSH 0.2.1-rc.2: dsh-session/lib/types/types.d.ts:166-211,256-389. */
export function mapSessionEvent(sessionId: string, event: SessionEvent): RunSignal | undefined {
  const base = { sessionId, at: event.time }
  switch (event.type) {
    case 'turn/start':
      return { ...base, kind: 'turn-start' }
    case 'tool/call':
      return { ...base, kind: 'tool-call', toolName: event.data.name }
    case 'tool/result':
      return { ...base, kind: 'tool-result' }
    case 'turn/end': {
      const reason = event.data.reason?.kind
      const endReason =
        reason === 'completed' ||
        reason === 'error' ||
        reason === 'max-tokens' ||
        reason === 'interrupted' ||
        reason === 'blocked' ||
        reason === 'aborted'
          ? reason
          : 'unknown'
      return { ...base, kind: 'turn-end', endReason }
    }
    default:
      return undefined
  }
}

/** DSH-specific subscriptions stay here. No message, arguments or result content is retained. */
export function createSessionEventSource(ctx: Context, now: () => number): SessionEventSource {
  return {
    subscribe(cb) {
      const disposers: (() => void)[] = []
      try {
        disposers.push(
          ctx.on('session/event', (session: Session, event: SessionEvent) => {
            const signal = mapSessionEvent(session.id, event)
            if (signal) cb(signal)
          }),
        )
        disposers.push(
          ctx.on('session/disposed', (session: Session) => {
            cb({ sessionId: session.id, kind: 'session-disposed', at: now() })
          }),
        )
      } catch (error) {
        for (const dispose of disposers.reverse()) dispose()
        throw error
      }
      return () => {
        for (const dispose of disposers.splice(0).reverse()) dispose()
      }
    },
  }
}
