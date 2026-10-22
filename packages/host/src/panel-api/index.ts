import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type {
  ConnectionRpcHandler,
  ConnectionFetchRoute,
  HostConnectionHandle,
} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-config-editor'
import { PANEL_CHANNEL, PANEL_PREFIX } from './contract.js'
import type { PanelStatus } from './contract.js'
import { status, goals, languagePatch, LanguageResponseSchema, failure, panelError } from './handlers.js'

export interface PanelRuntime {
  snapshot(): PanelStatus
  setLanguage(patch: ReturnType<typeof languagePatch>): Promise<void>
}

/** Peer is supplied by Connection after admission, never accepted from a payload. */
export function createPanelHandler(runtime: PanelRuntime): ConnectionRpcHandler {
  return async (method, input, signal, peer) => {
    let result: unknown
    if (!peer || peer.principal.kind !== 'owner' || peer.signal.aborted) {
      return {
        ok: false,
        error: { ...panelError('whaledot/unauthorized', 'Authenticated owner required').error, details: {} },
      }
    }
    try {
      signal.throwIfAborted()
      switch (method) {
        case 'status':
          result = status(input, runtime.snapshot())
          break
        case 'goals':
          result = goals(input)
          break
        case 'language': {
          const patch = languagePatch(input)
          await runtime.setLanguage(patch)
          result = LanguageResponseSchema.parse(patch)
          break
        }
        default:
          return {
            ok: false,
            error: { ...panelError('whaledot/not-found', 'Unknown panel method').error, details: {} },
          }
      }
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, error: { ...failure(error).error, details: {} } }
    }
  }
}

export function installPanelApi(ctx: Context, snapshot: () => PanelStatus): void {
  ctx.inject(['connection'], (child) => {
    const runtime: PanelRuntime = {
      snapshot,
      async setLanguage(patch) {
        const settings = child.get('settings') as Context['settings'] | undefined
        // Match the exact plugin fiber, not a hard-coded profile entry name.
        const editor = child.get('configEditor') as Context['configEditor'] | undefined
        const entry = editor?.entries().find((entry) => entry.fiber === ctx.fiber)
        const form = settings?.describe().find((form) => form.ns === entry?.options.id)
        if (!settings || !form) throw new Error('Settings form unavailable')
        await settings.update(form.ns, patch, form.revision)
      },
    }
    for (const method of ['status', 'goals', 'language'] as const) {
      child.effect(() =>
        child.connection.fetch.register(
          createPanelRoute(method, runtime, (request) => child.connection.admit(request)),
        ),
      )
    }
  })
}

/** Exact Connection routes coexist with Gateway's exclusive /api interceptor. */
export function createPanelRoute(
  method: 'status' | 'goals' | 'language',
  runtime: PanelRuntime,
  admit: HostConnectionHandle['admit'],
): ConnectionFetchRoute {
  const endpoint = `${PANEL_PREFIX}/${method}`
  const envelope = z.strictObject({
    type: z.literal('client-request'),
    rpcId: z.string().min(1).max(128),
    method: z.literal(endpoint),
    payload: z.unknown(),
  })
  const handler = createPanelHandler(runtime)
  return {
    path: `${PANEL_CHANNEL}/${endpoint}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      // The Web bridge already admitted an owner. Reuse its own admission API to obtain
      // the exact live peer (browser or API), never derive identity from the JSON body.
      const admission = admit(request)
      if ('rejection' in admission)
        return Response.json(panelError('whaledot/unauthorized', 'Authenticated owner required'), {
          status: admission.rejection,
        })
      const parsed = envelope.safeParse(await request.json().catch(() => undefined))
      if (!parsed.success)
        return Response.json(panelError('whaledot/invalid-input', 'Invalid panel request'), { status: 400 })
      const result = await handler(method, parsed.data.payload, request.signal, admission.peer)
      return Response.json({ type: 'server-response', rpcId: parsed.data.rpcId, result })
    },
  }
}
