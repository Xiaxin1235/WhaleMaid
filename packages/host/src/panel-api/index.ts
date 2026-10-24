import type { NotificationDeliverer } from '../notify/deliverer.js'
import type { CompanionMemory } from '../companion/memory.js'
import type { MemoryDrafts } from '../companion/drafts.js'
import { MemoryTextSchema, MemoryScopeSchema } from '@whaledot/core'
import type { NotificationRouter } from '../notify/router.js'
import { NotificationPreferencesSchema } from '@whaledot/core'
import {
  NotificationCenterRequestSchema,
  NotificationCenterSchema,
  RouteSuggestionSchema,
  ReminderSchema,
} from './contract.js'
import type { AutopilotScheduler } from '../autopilot/scheduler.js'
import { exportTrace } from '../autopilot/trace.js'
import { SetAutopilotSchema, TraceRequestSchema, TraceResponseSchema } from './contract.js'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type {
  ConnectionRpcHandler,
  ConnectionFetchRoute,
  HostConnectionHandle,
  PeerScope,
} from '@deepseek-ai/dsh-client-connection'
import type { ProjectGoal, ScopeId } from '@whaledot/core'
import type { TaskVerifier } from '../verify/verify-task.js'
import { VerifyTaskSchema, ResolveDecisionSchema, VerificationLogSchema } from './contract.js'
import type { TaskExecutor } from '../execution/execute-task.js'
import type { GoalIntake } from '../goal-intake/service.js'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-config-editor'
import {
  ExecuteNextSchema,
  ExecuteResultSchema,
  PANEL_CHANNEL,
  PANEL_PREFIX,
  PausedSchema,
  RevokeScopeSchema,
  TakeoverSchema,
  StatusSchema,
  CompanionRebuildSchema,
  PANEL_METHODS,
  DraftStartedSchema,
  DraftStatusSchema,
  ProjectFactsSchema,
  GoalDetailSchema,
  ConfirmResultSchema,
} from './contract.js'
import type { PanelMethod } from './contract.js'
import type { PanelStatus } from './contract.js'
import { status, goals, languagePatch, LanguageResponseSchema, failure, panelError } from './handlers.js'

export interface PanelRuntime {
  memoryDrafts?: MemoryDrafts
  setDraftProjectLessons?: (enabled: boolean) => Promise<void>
  memory?: CompanionMemory
  snapshot(): PanelStatus
  setLanguage(patch: ReturnType<typeof languagePatch>): Promise<void>
  goals(): ProjectGoal[]
  setPaused(paused: boolean): void
  revokeScope(scopeId: ScopeId, peer: PeerScope): void
  takeoverStore(): void
  notifier?: NotificationDeliverer
  notificationRouter?: NotificationRouter
  autopilot?: AutopilotScheduler
  verification?: TaskVerifier
  execution?: TaskExecutor
  intake?: GoalIntake
  rebuildCompanion?: () => Promise<unknown>
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
        case 'memory-proposals': {
          const query = z.strictObject({ goalId: z.string().optional() }).parse(input)
          result = runtime.memoryDrafts!.list().filter((p) => !query.goalId || p.goalId === query.goalId)
          break
        }
        case 'memory-proposal-resolve': {
          const q = z
            .strictObject({
              id: z.string().min(1),
              choice: z.enum(['confirm', 'decline']),
              text: MemoryTextSchema.optional(),
            })
            .parse(input)
          result = runtime.memoryDrafts!.resolve(q.id, q.choice, q.text, 'panel')
          break
        }
        case 'memories-consolidate': {
          const q = z.strictObject({ scope: MemoryScopeSchema }).parse(input)
          result = await runtime.memoryDrafts!.consolidate(q.scope)
          break
        }
        case 'memory-draft-settings': {
          const q = z.strictObject({ enabled: z.boolean() }).parse(input)
          await runtime.setDraftProjectLessons!(q.enabled)
          result = q
          break
        }
        case 'memories-list': {
          const query = z.strictObject({ includeArchived: z.boolean().optional() }).parse(input)
          result = runtime.memory!.panelList(query.includeArchived)
          break
        }
        case 'memory-update': {
          const q = z
            .strictObject({ id: z.string().min(1), version: z.int().positive(), text: MemoryTextSchema })
            .parse(input)
          result = runtime.memory!.update(q.id, q.version, { text: q.text })
          break
        }
        case 'memory-archive':
        case 'memory-restore': {
          const q = z.strictObject({ id: z.string().min(1), version: z.int().positive() }).parse(input)
          result = runtime.memory!.update(q.id, q.version, {
            status: method === 'memory-archive' ? 'archived' : 'active',
          })
          break
        }
        case 'memory-delete': {
          const q = z
            .strictObject({ id: z.string().min(1), version: z.int().positive(), confirm: z.literal(true) })
            .parse(input)
          const row = runtime.memory!.store.memories.get(q.id)
          if (!row || row.version !== q.version) throw Error('stale-version')
          runtime.memory!.store.memories.delete(q.id)
          result = { deleted: true }
          break
        }
        case 'memories-export': {
          const q = z.strictObject({ format: z.enum(['markdown', 'json']) }).parse(input)
          result = runtime.memory!.export(q.format)
          break
        }
        case 'notification-center': {
          const query = NotificationCenterRequestSchema.parse(input)
          result = NotificationCenterSchema.parse(runtime.notifier!.center(query.goalId))
          break
        }
        case 'notification-preferences': {
          const preferences = NotificationPreferencesSchema.parse(input)
          runtime.notifier!.store.setNotificationPreferences(preferences)
          result = preferences
          break
        }
        case 'route-suggestion': {
          const r = await runtime.notificationRouter!.route({
            ...RouteSuggestionSchema.parse(input),
            source: 'panel',
            peer,
          })
          result = r
          break
        }
        case 'remind-notification':
          runtime.notificationRouter!.remind(ReminderSchema.parse(input).notificationId)
          result = { ok: true }
          break
        case 'notification-navigation': {
          z.strictObject({}).parse(input)
          result =
            runtime
              .notifier!.store.notificationChoices.list()
              .filter(
                (c) =>
                  c.source === 'inbox' &&
                  c.result === 'succeeded' &&
                  ['open-panel', 'view-diff'].includes(c.action) &&
                  c.at > Date.now() - 300000,
              )
              .at(-1) ?? null
          break
        }
        case 'set-autopilot':
          result = runtime.autopilot!.setAutopilot(SetAutopilotSchema.parse(input))
          break
        case 'export-trace':
          result = TraceResponseSchema.parse(
            exportTrace(runtime.autopilot!.store, TraceRequestSchema.parse(input).goalId),
          )
          break
        case 'verify-task':
          result = await runtime.verification!.verifyTask(VerifyTaskSchema.parse(input).taskId)
          break
        case 'reconcile-task':
          result = await runtime.verification!.reconcileTask(VerifyTaskSchema.parse(input).taskId)
          break
        case 'resolve-decision': {
          const { notificationId, choice } = ResolveDecisionSchema.parse(input)
          const r = await runtime.notificationRouter!.routeChoice(notificationId, choice, peer)
          if (!r.ok)
            return {
              ok: false,
              error: {
                ...panelError('whaledot/notification-choice-rejected', r.reason ?? 'option-rejected').error,
                details: {},
              },
            }
          result = r
          break
        }
        case 'verification-log': {
          const { runId, phase, index } = VerificationLogSchema.parse(input)
          result = await runtime.verification!.logTail(runId, phase, index)
          break
        }

        case 'execute-next': {
          const { goalId } = ExecuteNextSchema.parse(input)
          result = ExecuteResultSchema.parse(
            await runtime.execution!.executeNextTask(goalId, { kind: 'panel', peer }),
          )
          break
        }
        case 'draft-goal':
          result = DraftStartedSchema.parse(runtime.intake!.start(input, peer))
          break
        case 'draft-status':
          result = DraftStatusSchema.parse(runtime.intake!.status(input, peer))
          break
        case 'cancel-draft':
          result = runtime.intake!.cancel(input, peer)
          break
        case 'project-facts':
          result = ProjectFactsSchema.parse(await runtime.intake!.project(input, peer))
          break
        case 'confirm-goal':
          result = ConfirmResultSchema.parse(await runtime.intake!.confirm(input, peer))
          break
        case 'goal-detail':
          result = GoalDetailSchema.parse(runtime.intake!.detail(input, peer))
          break
        case 'set-goal-paused':
          result = GoalDetailSchema.parse(runtime.intake!.setPaused(input, peer))
          break
        case 'status':
          result = status(input, runtime.snapshot())
          break
        case 'goals':
          result = goals(input, runtime.goals())
          break
        case 'set-paused': {
          const patch = PausedSchema.parse(input)
          runtime.setPaused(patch.paused)
          result = PausedSchema.parse(patch)
          break
        }
        case 'companion-rebuild': {
          CompanionRebuildSchema.parse(input)
          if (!runtime.rebuildCompanion) throw new Error('companion-unavailable')
          await runtime.rebuildCompanion()
          result = StatusSchema.parse(runtime.snapshot())
          break
        }
        case 'takeover-store': {
          TakeoverSchema.parse(input)
          runtime.takeoverStore()
          result = StatusSchema.parse(runtime.snapshot())
          break
        }
        case 'revoke-scope': {
          const patch = RevokeScopeSchema.parse(input)
          runtime.revokeScope(patch.scopeId, peer)
          result = RevokeScopeSchema.parse(patch)
          break
        }
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

export function installPanelApi(
  ctx: Context,
  snapshot: () => PanelStatus,
  storage: Pick<
    PanelRuntime,
    | 'goals'
    | 'setPaused'
    | 'revokeScope'
    | 'takeoverStore'
    | 'intake'
    | 'execution'
    | 'verification'
    | 'autopilot'
    | 'notifier'
    | 'notificationRouter'
    | 'rebuildCompanion'
    | 'memory'
    | 'memoryDrafts'
  >,
): void {
  ctx.inject(['connection'], (child) => {
    const runtime: PanelRuntime = {
      snapshot,
      ...storage,
      async setDraftProjectLessons(enabled) {
        const settings = child.get('settings') as Context['settings'] | undefined
        const editor = child.get('configEditor') as Context['configEditor'] | undefined
        const entry = editor?.entries().find((entry) => entry.fiber === ctx.fiber)
        const form = settings?.describe().find((form) => form.ns === entry?.options.id)
        if (!form || !settings) throw Error('settings-unavailable')
        const value = z
          .object({
            companion: z
              .object({ memory: z.object({}).passthrough().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .parse(form.value)
        await settings.update(
          form.ns,
          {
            companion: {
              ...value.companion,
              memory: { ...value.companion?.memory, draftProjectLessons: enabled },
            },
          },
          form.revision,
        )
      },
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
    for (const method of PANEL_METHODS) {
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
  method: PanelMethod,
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
