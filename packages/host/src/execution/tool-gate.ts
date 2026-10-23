import { realpath, lstat, readdir } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution, PreToolDecision } from '@deepseek-ai/dsh-tools'
import {
  t,
  authorizationOfRun,
  checkAction,
  isPathAllowed,
  toolCallToIntents,
  EvidenceIdSchema,
} from '@whaledot/core'
import type { Run, Locale, ActionIntent } from '@whaledot/core'
import { productionIdGen } from '../store/index.js'
import type { RunRegistry } from './registry.js'

/** Resolve a nonexistent target through its nearest existing ancestor, retaining the missing suffix. */
export async function resolveRealTarget(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Dangling links must not be treated as harmless missing files.
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('dangling-symlink')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await resolveRealTarget(parent), basename(path))
  }
}
export interface GateExecution {
  name: string
  arguments: unknown
  agent?: { session: { id: string; header?: { parentSession?: string } } }
  rootCallId?: unknown
  parent?: unknown
  token?: unknown
}
/** The registry is the only authority for ownership. No argument of unrelated sessions is observed. */
export class ToolGate {
  private readonly roots = new Map<unknown, string>()
  private readonly tokens = new Map<unknown, string>()
  constructor(
    private readonly registry: RunRegistry,
    private readonly locale: () => Locale,
    private readonly parentOf: (id: string) => string | undefined = () => undefined,
  ) {
    registry.onClosed((sessionId) => {
      for (const map of [this.roots, this.tokens])
        for (const [key, owner] of map) if (owner === sessionId) map.delete(key)
    })
  }
  /** Number of ephemeral tool lineage bindings, for runtime diagnostics. */
  trackedEntries(): number {
    return this.roots.size + this.tokens.size
  }
  private owner(exec: GateExecution): string | undefined {
    let id = exec.agent?.session.id
    const seen = new Set<string>()
    while (id && !seen.has(id)) {
      seen.add(id)
      if (this.registry.has(id)) return id
      id =
        (id === exec.agent?.session.id ? exec.agent.session.header?.parentSession : undefined) ??
        (() => {
          try {
            return this.parentOf(id!)
          } catch {
            return undefined
          }
        })()
    }
    const root =
      (exec.parent ? this.tokens.get(exec.parent) : undefined) ??
      (exec.rootCallId ? this.roots.get(exec.rootCallId) : undefined)
    return root
  }
  /** Narrow owned calls before DSH policy; unrelated arguments remain untouched. */
  async check(exec: GateExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> {
    const owner = this.owner(exec)
    if (!owner) return next()
    if (this.registry.store.inboxSessions.get(owner))
      return {
        kind: 'deny',
        reason: t(this.locale(), 'gateOutside', { rule: 'notification-session-tools-disabled' }),
      }
    let run: Run | undefined
    try {
      run = this.registry.get(owner)
      if (!run) throw new Error('missing-owned-run')
      if (!this.live(run)) {
        this.registry.close(run.sessionId)
        return this.deny(run, exec.name, 'none', 'run-inactive')
      }
      if (exec.rootCallId) this.roots.set(exec.rootCallId, run.sessionId)
      if (exec.token) this.tokens.set(exec.token, run.sessionId)
      this.registry.store.runs.update({ ...run, toolCalls: run.toolCalls + 1 })
      if (!this.live(run)) return this.deny(run, exec.name, 'none', 'run-inactive')
      const scope = authorizationOfRun(run.runScope!)
      const mapped = toolCallToIntents(exec.name, exec.arguments, { cwd: run.worktreePath })
      if ('unknown' in mapped) return this.deny(run, exec.name, 'unknown', 'unknown-tool-or-arguments')
      for (const intent of mapped.intents) {
        let resolved: ActionIntent = intent
        if ('path' in intent) {
          if (!isPathAllowed(scope, intent.path))
            return this.deny(run, exec.name, intent.type, 'path-outside-scope')
          resolved = { ...intent, path: await resolveRealTarget(intent.path) }
        } else if (intent.type === 'run-command')
          resolved = { ...intent, cwd: await resolveRealTarget(intent.cwd) }
        const decision = checkAction(scope, resolved)
        if (decision.decision !== 'allow') return this.deny(run, exec.name, intent.type, decision.ruleId)
        // Search tools enumerate directories recursively. Checking only their root could disclose protected descendants.
        if (
          'path' in resolved &&
          ['glob', 'grep', 'str_replace_editor'].includes(exec.name) &&
          !(await this.safeTree(resolved.path, scope))
        )
          return this.deny(run, exec.name, intent.type, 'protected-search-descendant')
      }
      if (!this.live(run)) return this.deny(run, exec.name, 'none', 'run-inactive')
      return next()
    } catch {
      return run
        ? this.deny(run, exec.name, 'unknown', 'gate-error')
        : { kind: 'deny', reason: t(this.locale(), 'gateOutside', { rule: 'gate-error' }) }
    }
  }
  private live(run: Run): boolean {
    const current = this.registry.get(run.sessionId)
    const original = run.runScope && this.registry.store.scopes.get(run.runScope.originScopeId)
    return (
      this.registry.isOpen(run.sessionId) &&
      current?.status === 'running' &&
      !current.reason &&
      !!run.runScope &&
      original?.status === 'active' &&
      original.hash === run.runScope.originScopeHash
    )
  }
  private async safeTree(
    path: string,
    scope: Parameters<typeof isPathAllowed>[0],
    budget = { remaining: 10000 },
  ): Promise<boolean> {
    if (--budget.remaining < 0) return false
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) return false
    if (!stat.isDirectory()) return true
    for (const name of await readdir(path)) {
      // rg's discovery contract excludes VCS internals. No other hidden/ignored files are exempt.
      if (name === '.git' || name === '.hg' || name === '.svn') continue
      const child = join(path, name)
      if (!isPathAllowed(scope, child) || !(await this.safeTree(child, scope, budget))) return false
    }
    return true
  }
  private deny(run: Run, name: string, action: string, ruleId: string): PreToolDecision {
    const summary = JSON.stringify({ tool: name, action, ruleId })
    try {
      const current = this.registry.get(run.sessionId) ?? run
      this.registry.store.transaction(() => {
        this.registry.store.runs.update({ ...current, deniedCalls: current.deniedCalls + 1 })
        this.registry.store.evidence.insert({
          id: EvidenceIdSchema.parse(productionIdGen.next('evidence')),
          runId: run.run_id,
          kind: 'log',
          hash: createHash('sha256').update(summary).digest('hex'),
          summary,
          verdict: 'UNKNOWN',
        })
      })
    } catch {
      /* A failed evidence write must never permit execution. */
    }
    return { kind: 'deny', reason: t(this.locale(), 'gateOutside', { rule: ruleId }) }
  }
}
/** Install the pre-execution narrowing policy while the tool runtime exists. */
export function installToolGate(ctx: Context, gate: ToolGate): void {
  ctx.on('tools/pre-execute', (exec: ToolExecution, next) => gate.check(exec, next))
}
