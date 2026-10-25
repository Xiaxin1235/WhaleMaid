import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { WhaleStore } from '../store/index.js'
import { COMPANION_PRESET } from './service.js'
import { companionSessionIds } from '@whaledot/core'

export type CompanionState =
  | { state: 'disabled' }
  | { state: 'starting' }
  | { state: 'ready'; sessionId: string }
  | { state: 'error'; message: string }

/** The DSH calls the companion lifecycle needs; production wraps `sessionController` and friends. */
export interface CompanionHost {
  exists(id: string): Promise<boolean>
  create(id: string, cwd: string, title: string): Promise<string>
  pinReadOnly(id: string): void
}

/** Create once, reuse across restarts, recreate when the user deleted it. Never sends a prompt. */
export class CompanionSessionManager {
  private current: CompanionState = { state: 'starting' }
  private pending: Promise<CompanionState> | undefined

  constructor(
    private readonly store: WhaleStore,
    private readonly host: CompanionHost,
    private readonly options: {
      dataDir: string
      enabled: () => boolean
      title: () => string
      log: (message: string, error?: unknown) => void
      afterReady?: (previousId: string | undefined, fresh: boolean) => Promise<void>
    },
  ) {}

  status(): CompanionState {
    return this.options.enabled() ? this.current : { state: 'disabled' }
  }
  sessionId(): string | undefined {
    return this.current.state === 'ready' ? this.current.sessionId : this.store.companionSession()?.sessionId
  }
  /** Every session WhaleDot ever used as the companion, so the gate keeps owning old ones after a rebuild. */
  allSessionIds(): string[] {
    const record = this.store.companionSession()
    return companionSessionIds(record, this.store.autopilotEvents.list())
  }

  ensure(): Promise<CompanionState> {
    if (!this.options.enabled()) return Promise.resolve({ state: 'disabled' })
    this.pending ??= this.run(false).finally(() => (this.pending = undefined))
    return this.pending
  }
  /** Start a fresh companion session; the old one stays in Harness and in the gate's ownership. */
  rebuild(): Promise<CompanionState> {
    if (!this.options.enabled()) return Promise.resolve({ state: 'disabled' })
    const after = this.pending ?? Promise.resolve(this.current)
    this.pending = after.then(() => this.run(true)).finally(() => (this.pending = undefined))
    return this.pending
  }

  private async run(fresh: boolean): Promise<CompanionState> {
    try {
      this.current = { state: 'starting' }
      const record = this.store.companionSession()
      if (record && !fresh && (await this.host.exists(record.sessionId))) {
        this.host.pinReadOnly(record.sessionId)
        return await this.ready(record.sessionId, record.sessionId, fresh)
      }
      const cwd = join(this.options.dataDir, 'companion')
      await mkdir(cwd, { recursive: true })
      const id = randomUUID()
      // Own the identity before it exists, so its first tool call is already gated.
      this.store.setCompanionSession({
        sessionId: id,
        createdAt: Date.now(),
        previous: record ? [record.sessionId, ...record.previous].slice(0, 20) : [],
      })
      const created = await this.host.create(id, cwd, this.options.title())
      if (created !== id) throw new Error('companion-identity-mismatch')
      this.host.pinReadOnly(id)
      return await this.ready(id, record?.sessionId, fresh)
    } catch (error) {
      this.options.log('companion session unavailable', error)
      return (this.current = {
        state: 'error',
        message: error instanceof Error ? error.message.slice(0, 200) : 'companion-unavailable',
      })
    }
  }
  private async ready(id: string, previousId: string | undefined, fresh: boolean): Promise<CompanionState> {
    this.current = { state: 'ready', sessionId: id }
    try {
      await this.options.afterReady?.(previousId, fresh)
    } catch (error) {
      this.options.log('companion list cleanup unavailable', error)
    }
    return this.current
  }
}

/** The one `ctx.workspaceRegistry` call used here (dsh-workspace 0.2.1-rc.2, `create(path, title?)`). */
interface WorkspaceRegistryLike {
  create(path: string, title?: string): Promise<{ id: string }>
}

/** Production adapter over DSH's public session controller, agent registry and permission presets. */
export function dshCompanionHost(ctx: Context): CompanionHost {
  const controller = () => {
    const c = ctx.get('sessionController') as Context['sessionController'] | undefined
    if (!c) throw new Error('session-controller-unavailable')
    return c
  }
  return {
    async exists(id) {
      try {
        const inspected = await controller().inspect(id as SessionId)
        return inspected.meta.agentPreset === COMPANION_PRESET
      } catch (error) {
        if (
          error instanceof Error &&
          ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name)
        )
          return false
        throw error
      }
    },
    async create(id, cwd, title) {
      // The Web UI only lets the user type into a blank session that belongs to a workspace, so the
      // companion's own directory becomes a workspace named after her (create returns an existing one).
      const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
      const workspace = registry ? await registry.create(cwd, title) : undefined
      const created = await controller().create({
        sessionId: id as SessionId,
        ...(workspace ? { workspaceId: workspace.id as never } : { cwd }),
        agentPreset: COMPANION_PRESET,
      })
      if (created.agentPreset !== undefined && created.agentPreset !== COMPANION_PRESET)
        throw new Error('companion-preset-not-applied')
      await controller().rename({ sessionId: created.sessionId, title })
      return created.sessionId
    },
    pinReadOnly(id) {
      const agent = (ctx.get('agents') as Context['agents'] | undefined)?.get(id as SessionId)
      const presets = ctx.get('permissionPresets') as Context['permissionPresets'] | undefined
      // A cold session has no agent yet; DSH applies the stored preset when it resumes.
      if (!agent || !presets) return
      if (presets.current(agent.session) !== 'read-only') presets.set(agent.session, 'read-only')
    },
  }
}
