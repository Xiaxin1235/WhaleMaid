import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'

export interface SessionObservation {
  exists: boolean
  running: boolean
  finalReplyNonempty: boolean
  endReason?: string
}
export type ObserveSession = (id: string) => Promise<SessionObservation>
/** Inspect cold durable sessions without activating an Agent, resuming it, or submitting input. */
export function observeSession(ctx: Context): ObserveSession {
  return async (id) => {
    const agents = ctx.get('agents') as Context['agents'] | undefined
    const live = agents?.get(id as SessionId)
    const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
    if (!controller || !agents) throw new Error('session-inspection-unavailable')
    try {
      const inspected = await controller.inspect(id as SessionId)
      const firstEnd = inspected.events.find((event) => event.type === 'turn/end')
      const events = firstEnd
        ? inspected.events.filter((event) => event.seq <= firstEnd.seq)
        : inspected.events
      const lastAssistant = events.filter((event) => event.type === 'assistant/message').at(-1)
      const lastEnd = events.filter((event) => event.type === 'turn/end').at(-1)
      const reply =
        lastAssistant?.type === 'assistant/message' &&
        !lastAssistant.data.interrupted &&
        !lastAssistant.data.message.content.some((part) => part.type === 'tool-call') &&
        lastAssistant.data.message.content.some((part) => part.type === 'text' && part.text.trim().length > 0)
      return {
        exists: true,
        running: live?.status === 'running',
        finalReplyNonempty: !!reply,
        ...(lastEnd?.type === 'turn/end' ? { endReason: lastEnd.data.reason.kind } : {}),
      }
    } catch (error) {
      // Only a documented missing session is absence; IO/format errors remain UNKNOWN.
      if (
        error instanceof Error &&
        ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name)
      )
        return { exists: false, running: false, finalReplyNonempty: false }
      throw error
    }
  }
}
