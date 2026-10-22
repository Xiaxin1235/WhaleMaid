import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import Schema from '@deepseek-ai/schemastery'
import { createRequire } from 'node:module'
import { RunTracker } from './bridge/run-tracker.js'
import { createSessionEventSource } from './bridge/session-events.js'
import { installPanelApi } from './panel-api/index.js'
import { LanguageSchema } from './panel-api/contract.js'
import type { PanelStatus } from './panel-api/contract.js'
import type { LanguageSetting } from '@whaledot/core'
import { DebugLog } from './debug-log.js'
import { WhaleStore } from './store/index.js'
import { createScopeService } from './scope-service.js'

export const name = 'whaledot'
// Event observation needs no mandatory service. Availability probes use optional injection.
export const inject: string[] = []

export interface Config {
  dataDir?: string
  debugLogSignals?: boolean
  language?: Volatile<LanguageSetting>
}
export const Config: Schema<Omit<Config, 'language'> & { language?: LanguageSetting }, Config> =
  Schema.object({
    dataDir: Schema.string().description('Data directory; defaults to <DSH_HOME>/whaledot'),
    debugLogSignals: Schema.boolean().default(false),
    language: Schema.union(['auto', 'zh-CN', 'en'])
      .default('auto')
      .volatile()
      .description('WhaleDot language / 语言'),
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
    const { version } = createRequire(import.meta.url)('dsh-whaledot/package.json') as { version: string }
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
    ctx.effect(() => () => store.close())
    const scopes = createScopeService(ctx, store, (message, error) => debug.host(message, error))
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
        }
      },
      {
        goals: () => store.goals.list(),
        setPaused: (paused) => store.setPaused(paused),
        takeoverStore: () => store.takeover(),
        revokeScope: (scopeId, peer) => {
          scopes.revoke(scopeId, peer)
        },
      },
    )
    const clock = { now: () => Date.now() }
    const tracker = new RunTracker(clock, () => {})
    const source = createSessionEventSource(ctx, clock.now)
    const stop = source.subscribe((signal) => {
      try {
        tracker.accept(signal)
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
    logger.info('plugin loaded')
    debug.host('plugin loaded')
  } catch (error) {
    report(error)
  }
}
