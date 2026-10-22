import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { randomUUID } from 'node:crypto'
export type ExecutionVia = { kind: 'panel'; peer: PeerScope } | { kind: 'background' }
export interface LaunchRequest {
  cwd: string
  preset: 'read-only' | 'workspace-write'
  title: string
  prompt: string
  via: ExecutionVia
  register(sessionId: string): void
  check(): void
}
export interface DshRunner {
  launch(request: LaunchRequest): Promise<string>
  cancel(sessionId: string): void
}
/** Trusted host-local service calls require no cached browser identity. Owner admission is checked only for this launch. */
export function dshRunner(ctx: Context): DshRunner {
  return {
    async launch(request) {
      if (
        request.via.kind === 'panel' &&
        (request.via.peer.principal.kind !== 'owner' || request.via.peer.signal.aborted)
      )
        throw new Error('owner-required')
      const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
      const presets = ctx.get('permissionPresets') as Context['permissionPresets'] | undefined
      if (!controller || !presets || !ctx.get('tools')) throw new Error('execution-services-unavailable')
      request.check()
      const created = await controller.create({ cwd: request.cwd, sessionId: randomUUID() as SessionId })
      const sessions = ctx.get('sessions') as Context['sessions'] | undefined
      const session = sessions?.get(created.sessionId)
      if (!session) throw new Error('session-not-live')
      presets.set(session, request.preset)
      if (presets.current(session) !== request.preset) throw new Error('permission-preset-mismatch')
      await controller.rename({ sessionId: created.sessionId, title: request.title })
      request.check()
      request.register(created.sessionId)
      request.check()
      // Exactly one send. An ambiguous receipt is reconciled as UNKNOWN, never retried.
      await controller.prompt(
        {
          sessionId: created.sessionId,
          requestId: randomUUID() as Parameters<typeof controller.prompt>[0]['requestId'],
          mode: 'queue',
          content: [{ type: 'text', text: request.prompt }],
        },
        new AbortController().signal,
      )
      return created.sessionId
    },
    cancel(sessionId) {
      const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
      controller?.cancel({ sessionId: sessionId as SessionId })
    },
  }
}
