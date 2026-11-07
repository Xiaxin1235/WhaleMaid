import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'

interface Inspection {
  readonly meta: SessionHeader
  readonly events: readonly SessionEvent[]
}

interface QueryObservation extends Disposable {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
}

/** 0.2.1 uses SessionController.inspect. 0.2.2 moves point observations to SessionQueryEngine. */
export async function inspectSession(ctx: Context, id: SessionId, signal?: AbortSignal): Promise<Inspection> {
  const controller = ctx.get('sessionController') as
    { inspect?: (id: SessionId, signal?: AbortSignal) => Promise<Inspection> } | undefined
  if (controller?.inspect) return controller.inspect(id, signal)
  const query = ctx.get('sessionQuery') as
    | {
        observeSession?: (
          id: SessionId,
          options: { signal?: AbortSignal; projectionMode: 'none' },
        ) => Promise<QueryObservation>
      }
    | undefined
  if (!query?.observeSession) throw Error('session-inspection-unavailable')
  using observation = await query.observeSession(id, {
    projectionMode: 'none',
    ...(signal ? { signal } : {}),
  })
  return { meta: observation.header, events: observation.events }
}

/** Only documented absence codes permit replacement or an absent-session result. */
export function isMissingSession(error: unknown): boolean {
  return (
    error instanceof Error &&
    (['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name) ||
      ('code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND'))
  )
}
