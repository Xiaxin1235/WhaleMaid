import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import Schema from '@deepseek-ai/schemastery'
import { createRequire } from 'node:module'
import { RunTracker } from './bridge/run-tracker.js'
import { createSessionEventSource } from './bridge/session-events.js'

export const name = 'whaledot'
// Event observation needs no mandatory service. Availability probes use optional injection.
export const inject: string[] = []

export interface Config {
  dataDir?: string
  debugLogSignals?: boolean
}
export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().description('Data directory; defaults to <DSH_HOME>/whaledot'),
  debugLogSignals: Schema.boolean().default(false),
})

/** All initialization paths, including optional-service callbacks and async IO, degrade locally. */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const report = (error: unknown) => {
    try {
      ctx.logger(name).error('plugin degraded', error)
    } catch {
      console.error('[whaledot] failed to load plugin', error)
    }
  }
  try {
    const logger = ctx.logger(name)
    const dataDir = config.dataDir || join(resolveDshHome(), name)
    const { version } = createRequire(import.meta.url)('dsh-whaledot/package.json') as { version: string }
    const status = {
      version,
      startedAt: Date.now(),
      services: { gateway: false, commands: false, userQuestions: false },
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
    await saveStatus()
    const clock = { now: () => Date.now() }
    const tracker = new RunTracker(clock, () => {})
    const source = createSessionEventSource(ctx, clock.now)
    const stop = source.subscribe((signal) => {
      try {
        tracker.accept(signal)
        if (config.debugLogSignals) logger.info('signal %o', signal)
      } catch (error) {
        report(error)
      }
    })
    ctx.effect(() => stop)
    for (const [service, key] of [
      ['typertGateway', 'gateway'],
      ['commands', 'commands'],
      ['userQuestions', 'userQuestions'],
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
  } catch (error) {
    report(error)
  }
}
