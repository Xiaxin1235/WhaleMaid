import { realpath, lstat, readdir } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
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
import { COMPANION_ALLOWED_TOOLS } from '../companion/tools.js'

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
  callId?: unknown
}
interface PendingApproval {
  run: Run
  exec: GateExecution
  reason: string
  category: string
  commandHash: string
  requestId?: string
  outcome?: ApprovalOutcome | 'timeout'
}
/** The registry is the only authority for ownership. No argument of unrelated sessions is observed. */
export class ToolGate {
  private readonly roots = new Map<unknown, string>()
  private readonly tokens = new Map<unknown, string>()
  private readonly approvals = new Map<string, PendingApproval>()
  private readonly admitted = new WeakMap<GateExecution, Run>()
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
    if (
      (exec.name.startsWith('whaledot_memory_') || exec.name.startsWith('whaledot_propose_')) &&
      (!owner || !this.registry.isCompanion(owner))
    )
      return { kind: 'deny', reason: 'companion-only' }
    if (!owner) return next()
    if (this.registry.store.inboxSessions.get(owner))
      return {
        kind: 'deny',
        reason: t(this.locale(), 'gateOutside', { rule: 'notification-session-tools-disabled' }),
      }
    // The companion may only read WhaleDot facts and ask the user; DSH's own policy still runs after us.
    if (this.registry.isCompanion(owner))
      return COMPANION_ALLOWED_TOOLS.has(exec.name)
        ? next()
        : { kind: 'deny', reason: t(this.locale(), 'gateOutside', { rule: 'companion-read-only' }) }
    let run: Run | undefined
    try {
      run = this.registry.get(owner)
      if (!run) throw new Error('missing-owned-run')
      if (!this.live(run)) {
        this.registry.close(run.sessionId)
        return this.deny(run, exec.name, 'none', 'run-inactive')
      }
      this.admitted.set(exec, run)
      if (exec.rootCallId) this.roots.set(exec.rootCallId, run.sessionId)
      if (exec.token) this.tokens.set(exec.token, run.sessionId)
      this.registry.store.runs.update({ ...run, toolCalls: run.toolCalls + 1 })
      if (!this.live(run)) return this.deny(run, exec.name, 'none', 'run-inactive')
      const scope = authorizationOfRun(run.runScope!)
      const mapped = toolCallToIntents(exec.name, exec.arguments, {
        cwd: run.worktreePath,
        commandMode: scope.commandMode,
      })
      if ('unknown' in mapped) return this.deny(run, exec.name, 'unknown', 'unknown-tool-or-arguments')
      let ask: { intent: Extract<ActionIntent, { type: 'run-command' }>; category: string } | undefined
      for (const intent of mapped.intents) {
        let resolved: ActionIntent = intent
        if ('path' in intent) {
          if (!isPathAllowed(scope, intent.path))
            return this.deny(run, exec.name, intent.type, 'path-outside-scope')
          resolved = { ...intent, path: await resolveRealTarget(intent.path) }
        } else if (intent.type === 'run-command')
          resolved = { ...intent, cwd: await resolveRealTarget(intent.cwd) }
        const decision = checkAction(scope, resolved)
        if (decision.decision === 'ask' && scope.commandMode === 'trusted' && resolved.type === 'run-command')
          ask = { intent: resolved, category: decision.reason }
        else if (decision.decision !== 'allow') return this.deny(run, exec.name, intent.type, decision.ruleId)
        // Search tools enumerate directories recursively. Checking only their root could disclose protected descendants.
        if (
          'path' in resolved &&
          ['glob', 'grep', 'str_replace_editor'].includes(exec.name) &&
          !(await this.safeTree(resolved.path, scope))
        )
          return this.deny(run, exec.name, intent.type, 'protected-search-descendant')
      }
      if (!this.live(run)) return this.deny(run, exec.name, 'none', 'run-inactive')
      if (ask) {
        const reason = `whaledot-danger:${randomUUID()}`
        this.approvals.set(reason, {
          run,
          exec,
          reason,
          category: ask.category,
          commandHash: createHash('sha256').update(ask.intent.cmdline).digest('hex'),
        })
        const goal = this.registry.store.goals.get(scope.goalId)
        const values = {
          command: ask.intent.cmdline,
          category: ask.category,
          cwd: ask.intent.cwd,
          goal: `${goal?.title ?? scope.goalId} (${scope.goalId})`,
        }
        return {
          kind: 'ask',
          reason,
          displayReason: {
            en: t('en', 'dangerApproval', values),
            'zh-CN': t('zh-CN', 'dangerApproval', values),
            zh: t('zh-CN', 'dangerApproval', values),
          },
        }
      }
      return next()
    } catch {
      return run
        ? this.deny(run, exec.name, 'unknown', 'gate-error')
        : { kind: 'deny', reason: t(this.locale(), 'gateOutside', { rule: 'gate-error' }) }
    }
  }
  /** Observe committed DSH audit events, regardless of which UI answerer claims the waterfall. */
  approvalEvent(sessionId: string, event: SessionEvent): void {
    if (event.type === 'approval/asked') {
      const pending = event.data.reason && this.approvals.get(event.data.reason)
      if (
        pending &&
        pending.exec.agent?.session.id === sessionId &&
        pending.exec.callId === event.data.callId
      )
        pending.requestId = event.data.id
    } else if (event.type === 'approval/decided') {
      for (const pending of this.approvals.values()) {
        if (pending.exec.agent?.session.id !== sessionId || pending.requestId !== event.data.id) continue
        const current = this.registry.get(pending.run.sessionId)
        const expired =
          Date.now() >= pending.run.startedAt + pending.run.runScope!.limits.maxRunMinutes * 60000
        this.recordApproval(
          pending,
          event.data.outcome === 'cancelled' && (expired || current?.reason === 'run-timeout')
            ? 'timeout'
            : event.data.outcome,
        )
      }
    }
  }
  /** A missing approval service or unobservable audit must remain fail-closed. */
  result(exec: GateExecution): void {
    this.admitted.delete(exec)
    for (const pending of this.approvals.values()) {
      if (pending.exec.token !== undefined ? pending.exec.token !== exec.token : pending.exec !== exec)
        continue
      try {
        if (!pending.outcome)
          this.recordApproval(pending, this.live(pending.run) ? 'unavailable' : 'cancelled')
      } finally {
        this.approvals.delete(pending.reason)
      }
    }
  }
  /** Recheck after asynchronous approval, immediately before tool dispatch. */
  guard(exec: GateExecution): string | undefined {
    const owner = this.owner(exec),
      run = this.admitted.get(exec) ?? (owner ? this.registry.get(owner) : undefined)
    const expired =
      run?.runScope?.commandMode === 'trusted' &&
      Date.now() >= run.startedAt + run.runScope.limits.maxRunMinutes * 60000
    if (run && (!this.live(run) || expired)) {
      this.deny(run, exec.name, 'run-command', expired ? 'run-timeout' : 'run-inactive')
      return 'whaledot-run-inactive'
    }
    for (const pending of this.approvals.values()) {
      if (pending.exec.token !== undefined ? pending.exec.token !== exec.token : pending.exec !== exec)
        continue
      if (pending.outcome !== 'allowed-once') return 'whaledot-approval-not-granted-or-audited'
    }
    return undefined
  }
  private recordApproval(pending: PendingApproval, outcome: ApprovalOutcome | 'timeout') {
    if (pending.outcome) return
    const summary = JSON.stringify({
      type: 'danger-approval',
      category: pending.category,
      commandHash: pending.commandHash,
      outcome,
      at: Date.now(),
    })
    this.registry.store.transaction(() => {
      if (outcome !== 'allowed-once') {
        const run = this.registry.get(pending.run.sessionId) ?? pending.run
        this.registry.store.runs.update({ ...run, deniedCalls: run.deniedCalls + 1 })
      }
      this.registry.store.evidence.insert({
        id: EvidenceIdSchema.parse(productionIdGen.next('evidence')),
        runId: pending.run.run_id,
        kind: 'log',
        hash: createHash('sha256').update(summary).digest('hex'),
        summary,
        verdict: 'UNKNOWN',
      })
    })
    pending.outcome = outcome
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
  ctx.on('session/event', (session, event) => {
    gate.approvalEvent(session.id, event)
  })
  ctx.on('tools/result', (exec) => {
    gate.result(exec)
  })
  ctx.inject(['tools'], (child) => {
    child.effect(() => child.tools.guard((exec) => gate.guard(exec)))
  })
}
