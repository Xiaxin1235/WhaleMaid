import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  isOwnedCompanion,
  normalizeWindowsPath,
  COMPANION_ARCHIVE_ACTION,
  COMPANION_RESTORE_ACTION,
} from '@whaledot/core'
import type { CompanionArchiveIdentity } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'

/** Verified narrow surface of dsh-workspace 0.2.1-rc.2; no workspace removal or stopActivity capability. */
export interface CompanionArchiveHost {
  workspace(): { path: string; sessionIds: readonly string[] } | undefined
  archived(): readonly string[]
  inspect(id: string): Promise<CompanionArchiveIdentity>
  archive(id: string): Promise<void>
  restore(id: string): Promise<void>
}
export class CompanionArchives {
  private tail: Promise<unknown> = Promise.resolve()
  private stopped = false
  private available = true
  private readonly verified = new Map<string, CompanionArchiveIdentity>()
  constructor(
    readonly store: WhaleStore,
    private readonly host: CompanionArchiveHost,
    private readonly deps: {
      enabled(): boolean
      current(): string | undefined
      owned(): string[]
      dataDir: string
      summarize(id: string): Promise<void>
      log(message: string): void
      now?(): number
      id?(): string
    },
  ) {}
  private queue<T>(run: () => Promise<T>): Promise<T> {
    const work = this.tail.then(run)
    this.tail = work.catch(() => {})
    return work
  }
  private async identity(id: string): Promise<boolean> {
    const meta = await this.host.inspect(id)
    const ok = isOwnedCompanion(
      id,
      this.deps.owned(),
      meta,
      this.host.workspace(),
      join(this.deps.dataDir, 'companion'),
    )
    if (ok) this.verified.set(id, meta)
    else this.verified.delete(id)
    return ok
  }
  private audit(id: string, action: string): void {
    this.store.autopilotEvents.insert({
      id: this.deps.id?.() ?? randomUUID(),
      actor: 'companion',
      sessionId: id,
      action,
      reason: 'succeeded',
      at: this.deps.now?.() ?? Date.now(),
    })
  }
  private diagnose() {
    this.available = false
    this.deps.log('companion archive unavailable; conversation remains usable')
  }
  private async archive(id: string): Promise<void> {
    if (this.stopped || !this.deps.enabled() || id === this.deps.current()) return
    if (!(await this.identity(id)) || this.host.archived().includes(id)) return
    await this.deps.summarize(id)
    if (this.stopped || !this.deps.enabled() || id === this.deps.current() || !(await this.identity(id)))
      return
    // Never stop an active turn to tidy a list. The host rejects active-session archival.
    await this.host.archive(id)
    this.audit(id, COMPANION_ARCHIVE_ACTION)
  }
  /** One startup pass, including recovery of an accidentally archived current companion. */
  startup(): Promise<void> {
    return this.queue(async () => {
      for (const id of this.deps.owned()) {
        if (this.stopped) return
        try {
          if (!(await this.identity(id))) continue
          if (id === this.deps.current()) {
            if (this.host.archived().includes(id)) {
              await this.host.restore(id)
              this.audit(id, COMPANION_RESTORE_ACTION)
            }
          } else await this.archive(id)
        } catch {
          this.diagnose()
        }
      }
    })
  }
  /** Rotation creates the new conversation first, then waits for P15 before archiving its predecessor. */
  rotated(oldId: string | undefined): Promise<void> {
    return this.queue(async () => {
      if (!oldId) return
      try {
        await this.archive(oldId)
      } catch {
        this.diagnose()
      }
    })
  }
  view() {
    try {
      const archived = new Set(this.host.archived()),
        workspace = this.host.workspace()
      const items = [...this.verified]
        .filter(
          ([id, meta]) =>
            id !== this.deps.current() &&
            archived.has(id) &&
            isOwnedCompanion(id, this.deps.owned(), meta, workspace, join(this.deps.dataDir, 'companion')),
        )
        .map(([id, meta]) => ({ id, createdAt: meta.createdAt ?? 0 }))
      return { enabled: this.deps.enabled(), available: this.available, items }
    } catch {
      return { enabled: this.deps.enabled(), available: false, items: [] }
    }
  }
  /** The authenticated owner restores only proven earlier companions, never arbitrary caller ids. */
  restore(id?: string): Promise<{ restored: number; failed: number }> {
    return this.queue(async () => {
      let restored = 0,
        failed = 0
      const ids = id ? [id] : this.view().items.map((item) => item.id)
      for (const target of ids) {
        if (this.stopped) break
        try {
          if (
            target === this.deps.current() ||
            !this.deps.owned().includes(target) ||
            !(await this.identity(target)) ||
            !this.host.archived().includes(target)
          )
            continue
          await this.host.restore(target)
          this.audit(target, COMPANION_RESTORE_ACTION)
          restored++
        } catch {
          failed++
          this.diagnose()
        }
      }
      return { restored, failed }
    })
  }
  async dispose() {
    this.stopped = true
    await this.tail
  }
}

interface WorkspaceArchiveRegistry {
  list(): { path: string; sessionIds: readonly string[] }[]
  readonly archivedSessionIds: readonly string[]
  archiveSession(id: SessionId): Promise<void>
  unarchiveSession(id: SessionId): Promise<void>
}
/** Production adapter over the exact public registry and session inspection interfaces. */
export function dshCompanionArchiveHost(ctx: Context, dataDir: string): CompanionArchiveHost {
  const registry = () => {
    const value = ctx.get('workspaceRegistry') as WorkspaceArchiveRegistry | undefined
    if (!value) throw Error('workspace-registry-unavailable')
    return value
  }
  return {
    workspace: () =>
      registry()
        .list()
        .find((w) => normalizeWindowsPath(w.path) === normalizeWindowsPath(join(dataDir, 'companion'))),
    archived: () => registry().archivedSessionIds,
    async inspect(id) {
      const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
      if (!controller) throw Error('session-controller-unavailable')
      return (await controller.inspect(id as SessionId, AbortSignal.timeout(15000))).meta
    },
    archive: (id) => registry().archiveSession(id as SessionId),
    restore: (id) => registry().unarchiveSession(id as SessionId),
  }
}
