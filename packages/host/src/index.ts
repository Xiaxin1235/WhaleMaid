import { NotificationDeliverer } from './notify/deliverer.js'
import { NotificationRouter } from './notify/router.js'
import { dshInbox } from './notify/inbox-session.js'
import { AutopilotScheduler } from './autopilot/scheduler.js'
import { TaskVerifier } from './verify/verify-task.js'
import { observeSession } from './verify/reconcile.js'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import Schema from '@deepseek-ai/schemastery'
import { createRequire } from 'node:module'
import { TaskExecutor } from './execution/execute-task.js'
import { dshRunner } from './execution/dsh-runner.js'
import { ToolGate, installToolGate } from './execution/tool-gate.js'
import { resolveLocale } from '@whalemaid/core'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSessionEventSource } from './bridge/session-events.js'
import { installPanelApi } from './panel-api/index.js'
import { LanguageSchema } from './panel-api/contract.js'
import type { PanelStatus } from './panel-api/contract.js'
import type { LanguageSetting } from '@whalemaid/core'
import { DebugLog } from './debug-log.js'
import { WhaleStore } from './store/index.js'
import { createScopeService } from './scope-service.js'
import { GoalIntake } from './goal-intake/service.js'
import { dshDraftModel } from './goal-intake/model.js'
import { CompanionService } from './companion/service.js'
import type { CompanionSettings } from './companion/service.js'
import { CompanionSessionManager, dshCompanionHost } from './companion/session.js'
import { CompanionMemory, memoryQuestionAdapter } from './companion/memory.js'
import { MemoryDrafts } from './companion/drafts.js'
import { CompanionActions } from './companion/actions.js'
import { CompanionRecall } from './companion/recall.js'
import { CompanionDailyBrief } from './companion/daily-brief.js'
import { CompanionArchives, dshCompanionArchiveHost } from './companion/archive.js'
import { GoalDecisions } from './notify/goal-decisions.js'
import { EverydayApprovals, installEverydayApprovals } from './everyday-approval/service.js'

export const name = 'whaledot'
// Event observation needs no mandatory service. Availability probes use optional injection.
export const inject: string[] = []

export interface CompanionConfig {
  dailyBrief?: { enabled?: Volatile<boolean> }
  archiveEarlier?: Volatile<boolean>
  recall?: { enabled?: Volatile<boolean>; summarize?: Volatile<boolean> }
  actions?: { enabled?: boolean }
  memory?: {
    enabled?: boolean
    suggest?: boolean
    maxChars?: number
    draftProjectLessons?: Volatile<boolean>
  }
  enabled?: boolean
  personaPath?: string
  shareSessionTitles?: boolean
  readSessionContent?: boolean
  excludedSessions?: string[]
}
export interface Config {
  maxConcurrentRuns?: number
  dataDir?: string
  debugLogSignals?: boolean
  language?: Volatile<LanguageSetting>
  companion?: CompanionConfig
}
type ConfigInput = Omit<Config, 'language' | 'companion'> & {
  language?: LanguageSetting
  companion?: Omit<CompanionConfig, 'memory' | 'recall' | 'archiveEarlier' | 'dailyBrief'> & {
    dailyBrief?: { enabled?: boolean }
    archiveEarlier?: boolean
    recall?: { enabled?: boolean; summarize?: boolean }
    memory?: { enabled?: boolean; suggest?: boolean; maxChars?: number; draftProjectLessons?: boolean }
  }
}
export const Config: Schema<ConfigInput, Config> = Schema.object({
  maxConcurrentRuns: Schema.number().min(1).step(1).default(1),
  dataDir: Schema.string().description('Data directory; defaults to <DSH_HOME>/whaledot'),
  debugLogSignals: Schema.boolean().default(false),
  language: Schema.union(['auto', 'zh-CN', 'en'])
    .default('auto')
    .volatile()
    .description('WhaleMaid language / 语言'),
  companion: Schema.object({
    dailyBrief: Schema.object({ enabled: Schema.boolean().default(true).volatile() }).default({}),
    archiveEarlier: Schema.boolean().default(true).volatile(),
    recall: Schema.object({
      enabled: Schema.boolean().default(true).volatile(),
      summarize: Schema.boolean().default(true).volatile(),
    }).default({}),
    actions: Schema.object({ enabled: Schema.boolean().default(true) }).default({}),
    memory: Schema.object({
      enabled: Schema.boolean().default(true),
      suggest: Schema.boolean().default(true),
      maxChars: Schema.number().min(256).max(2000).step(1).default(2000),
      draftProjectLessons: Schema.boolean().default(false).volatile(),
    }).default({}),
    enabled: Schema.boolean().default(true).description('Companion session “大肥鱼”'),
    personaPath: Schema.string().description('Custom persona file (optional)'),
    shareSessionTitles: Schema.boolean().default(true).description('Let the companion see session titles'),
    readSessionContent: Schema.boolean().default(true).description('Let the companion read session content'),
    excludedSessions: Schema.array(String).default([]).description('Session ids or title keywords to hide'),
  }).default({}),
})

/** All initialization paths, including optional-service callbacks and async IO, degrade locally. */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const dataDir = config.dataDir || join(resolveDshHome(), name)
  const debug = new DebugLog(dataDir, config.debugLogSignals)
  const report = (error: unknown) => {
    debug.host('plugin degraded', error)
    try {
      ctx.logger(name).error('plugin degraded', error)
    } catch {
      console.error('[whaledot] failed to load plugin', error)
    }
  }
  try {
    const logger = ctx.logger(name)
    // `auto` follows the language chosen in DSH's own settings (the `locale` form), as the pet plugin does;
    // the host process locale is only a last resort, since Desktop's runtime often reports en-US.
    const hostLocale = (): string => {
      try {
        const settings = ctx.get('settings') as Context['settings'] | undefined
        const value = settings
          ?.describe({ redactSecrets: true })
          .find((entry) => entry.ns === 'locale')?.value
        const preference =
          value && typeof value === 'object' && 'preference' in value
            ? (value as { preference?: unknown }).preference
            : undefined
        if (typeof preference === 'string' && /^(zh|en)/i.test(preference)) return preference
      } catch (error) {
        debug.host('dsh locale unavailable', error)
      }
      return Intl.DateTimeFormat().resolvedOptions().locale
    }
    const { version } = createRequire(import.meta.url)('dsh-whalemaid/package.json') as { version: string }
    const status = {
      version,
      startedAt: Date.now(),
      dataDir,
      services: {
        gateway: false,
        commands: false,
        userQuestions: false,
        approval: false,
        permissionPresets: false,
        tools: false,
      },
    }
    // Ordered snapshots prevent late service notifications overwriting newer availability.
    let writes = Promise.resolve()
    const saveStatus = (): Promise<void> => {
      const snapshot = JSON.stringify(status, null, 2) + '\n'
      writes = writes
        .then(() => writeFileAtomic(join(dataDir, 'status.json'), snapshot, { mode: 0o600 }))
        .catch(report)
      return writes
    }
    await mkdir(dataDir, { recursive: true })
    const store = new WhaleStore(dataDir, { log: (message, error) => debug.host(message, error) })
    let managed = false
    ctx.effect(() => () => {
      if (!managed) store.close()
    })
    const scopes = createScopeService(ctx, store, (message, error) => debug.host(message, error))
    const intake = new GoalIntake(store, scopes, dshDraftModel(ctx))

    const execution = new TaskExecutor(
      store,
      scopes,
      dshRunner(ctx),
      dataDir,
      () => resolveLocale(config.language?.get() ?? 'auto', hostLocale()),
      (message, error) => debug.host(message, error),
      observeSession(ctx),
    )

    const verification = new TaskVerifier(store, scopes, dataDir, observeSession(ctx), () =>
      resolveLocale(config.language?.get() ?? 'auto', hostLocale()),
    )
    const everydayApprovals = new EverydayApprovals(ctx, store, execution.registry)
    installEverydayApprovals(ctx, everydayApprovals)
    const autopilot = new AutopilotScheduler(
      store,
      scopes,
      {
        execute: (goalId, admit) => execution.executeNextTask(goalId, { kind: 'background' }, admit),
        verify: (taskId) => verification.verifyTask(taskId),
        reconcile: (taskId) => verification.reconcileTask(taskId),
        requestDecision: (taskId) => verification.requestDecision(taskId),
        planner: dshDraftModel(ctx),
        stop: () => verification.dispose(),
      },
      {
        maxConcurrentRuns: config.maxConcurrentRuns ?? 1,
        locale: () => resolveLocale(config.language?.get() ?? 'auto', hostLocale()),
        log: (message, error) => debug.host(message, error),
      },
    )
    const notificationLocale = () => resolveLocale(config.language?.get() ?? 'auto', hostLocale())
    const notificationRouter = new NotificationRouter(
      store,
      scopes,
      verification,
      notificationLocale,
      (id) => autopilot.mark(id),
      new GoalDecisions(store, scopes, (id) => execution.stopGoal(id)),
    )
    const notificationInbox = dshInbox(ctx, store)
    const notifier = new NotificationDeliverer(
      store,
      scopes,
      notificationInbox,
      notificationRouter,
      notificationLocale,
      (message, error) => debug.host(message, error),
    )
    const companionConfig = (): CompanionSettings => ({
      personaPath: config.companion?.personaPath || undefined,
      shareSessionTitles: config.companion?.shareSessionTitles ?? true,
      readSessionContent: config.companion?.readSessionContent ?? true,
      excludedSessions: config.companion?.excludedSessions ?? [],
    })
    const companionSessions = new CompanionSessionManager(store, dshCompanionHost(ctx), {
      dataDir,
      enabled: () => config.companion?.enabled ?? true,
      title: () => (notificationLocale() === 'zh-CN' ? '大肥鱼' : 'Da Fei Yu'),
      log: (message, error) => debug.host(message, error),
      afterReady: async (previous, fresh) => {
        if (fresh) await archives.rotated(previous)
        else await archives.startup()
      },
    })
    const companion = new CompanionService(ctx, store, {
      locale: notificationLocale,
      settings: companionConfig,
      facts: (n) => notifier.facts(n),
      companionSessionId: () => companionSessions.sessionId(),
      ownedSessions: () => execution.registry.ownedSessionIds(),
      log: (message, error) => debug.host(message, error),
    })
    await companion.loadPersona()
    const memory = new CompanionMemory(store, {
      locale: notificationLocale,
      settings: () => ({
        enabled: config.companion?.memory?.enabled ?? true,
        suggest: config.companion?.memory?.suggest ?? true,
        maxChars: config.companion?.memory?.maxChars ?? 2000,
        draftProjectLessons: config.companion?.memory?.draftProjectLessons?.get() ?? false,
      }),
      owns: (id) => companionSessions.allSessionIds().includes(id),
      ask: memoryQuestionAdapter(ctx),
    })
    companion.memory = memory
    const recall = new CompanionRecall(store, dshDraftModel(ctx), {
      locale: notificationLocale,
      settings: () => ({
        enabled: (config.companion?.enabled ?? true) && (config.companion?.recall?.enabled?.get() ?? true),
        summarize: config.companion?.recall?.summarize?.get() ?? true,
      }),
      sessionIds: () => companionSessions.allSessionIds(),
      currentSession: () => companionSessions.sessionId(),
      owns: (id) => companionSessions.allSessionIds().includes(id),
      async read(id, signal) {
        const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
        if (!controller) throw Error('session-controller-unavailable')
        const inspected = await controller.inspect(id as SessionId, signal)
        if (inspected.meta.agentPreset !== 'whaledot-companion' || inspected.meta.origin)
          throw Error('companion-only')
        return inspected.events
      },
      log: (message) => debug.host(message),
    })
    companion.recall = recall
    const brief = new CompanionDailyBrief(store, scopes, {
      enabled: () =>
        (config.companion?.enabled ?? true) && (config.companion?.dailyBrief?.enabled?.get() ?? true),
      locale: notificationLocale,
      owns: (id) => companionSessions.allSessionIds().includes(id),
    })
    companion.brief = brief
    const archives = new CompanionArchives(store, dshCompanionArchiveHost(ctx, dataDir), {
      enabled: () => (config.companion?.enabled ?? true) && (config.companion?.archiveEarlier?.get() ?? true),
      current: () => companionSessions.sessionId(),
      owned: () => companionSessions.allSessionIds(),
      dataDir,
      summarize: (id) => recall.summarize(id),
      log: (message) => debug.host(message),
    })
    const companionActions = new CompanionActions(store, {
      enabled: () => config.companion?.actions?.enabled ?? true,
      locale: notificationLocale,
      owns: (id) => companionSessions.allSessionIds().includes(id),
      confirm: (exec, question) => memory.confirm(exec, question),
      intake,
      autopilot,
      setPaused: (paused) => store.setPaused(paused),
    })
    companion.actions = companionActions
    const proposalInbox = notificationInbox
    const memoryDrafts = new MemoryDrafts(
      memory,
      dshDraftModel(ctx),
      {
        async ask(proposal, question, signal) {
          if (proposal.goalId) return proposalInbox.ask(proposal.goalId, question, signal)
          await companionSessions.ensure()
          signal.throwIfAborted()
          const id = companionSessions.sessionId() as SessionId | undefined
          const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
          if (!id || !controller) throw Error('companion-unavailable')
          // A cold owned companion has no live root. Public rename resumes it without a model prompt.
          await controller.rename({
            sessionId: id,
            title: notificationLocale() === 'zh-CN' ? '大肥鱼' : 'Da Fei Yu',
          })
          const agent = (ctx.get('agents') as Context['agents'] | undefined)?.get(id)
          if (!agent) throw Error('companion-unavailable')
          return memoryQuestionAdapter(ctx)(agent, question, signal)
        },
      },
      (message, error) => debug.host(message, error),
    )
    ctx.provide('whaledotCompanion', companion)
    execution.setAdmission((via, own) => autopilot.hasCapacity(own, via.kind === 'background'))
    managed = true
    ctx.effect(() => async () => {
      companionActions.dispose()
      intake.dispose()
      await Promise.all([
        execution.dispose(),
        autopilot.dispose(),
        notifier.dispose(),
        memoryDrafts.dispose(),
        recall.dispose(),
        archives.dispose(),
      ])
      store.close()
    })
    installToolGate(
      ctx,
      new ToolGate(
        execution.registry,
        () => resolveLocale(config.language?.get() ?? 'auto', hostLocale()),
        (id) =>
          (ctx.get('sessions') as Context['sessions'] | undefined)?.get(id as SessionId)?.header
            .parentSession,
      ),
    )
    ctx.on('whaledot/scope-revoked', (id) => execution.revoke(id))
    await saveStatus()
    installPanelApi(
      ctx,
      (): PanelStatus => {
        const paused = store.paused()
        return {
          ...status,
          services: { ...status.services },
          coopanion: ctx.get('coopanion') !== undefined,
          language: LanguageSchema.parse(config.language?.get() ?? 'auto'),
          store: store.status(),
          paused,
          companion: companionSessions.status(),
        }
      },
      {
        goals: () => store.goals.list(),
        setPaused: (paused) => store.setPaused(paused),
        takeoverStore: () => {
          store.takeover()
          execution.registry.recover()
          autopilot.start()
          notifier.start()
        },
        intake,
        execution,
        verification,
        autopilot,
        notifier,
        notificationRouter,
        revokeScope: (scopeId, peer) => {
          scopes.revoke(scopeId, peer)
        },
        rebuildCompanion: () => companionSessions.rebuild(),
        memory,
        memoryDrafts,
        recall,
        archives,
        brief,
        everydayApprovals,
      },
    )
    const clock = { now: () => Date.now() }
    const source = createSessionEventSource(ctx, clock.now)
    const stop = source.subscribe((signal) => {
      try {
        execution.accept(signal)
        debug.signal(signal)
      } catch (error) {
        report(error)
      }
    })
    ctx.effect(() => stop)
    for (const [service, key] of [
      ['typertGateway', 'gateway'],
      ['commands', 'commands'],
      ['userQuestions', 'userQuestions'],
      ['approval', 'approval'],
      ['permissionPresets', 'permissionPresets'],
      ['tools', 'tools'],
    ] as const) {
      const child = ctx.inject([service], (childCtx) => {
        try {
          status.services[key] = true
          void saveStatus()
          childCtx.effect(() => () => {
            status.services[key] = false
            return saveStatus()
          })
        } catch (error) {
          report(error)
        }
      })
      void Promise.resolve(child).catch(report)
    }
    autopilot.start()
    notifier.start()
    memoryDrafts.start()
    // Session creation needs the controller and the agent registry; wait for both without blocking load.
    const companionReady = ctx.inject(['sessionController', 'agents'], () => {
      if (store.status().state === 'ok') {
        recall.start()
        void companionSessions.ensure()
      }
    })
    void Promise.resolve(companionReady).catch(report)
    logger.info('plugin loaded')
    debug.host('plugin loaded')
  } catch (error) {
    report(error)
  }
}
