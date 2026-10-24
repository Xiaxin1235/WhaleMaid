import { randomUUID } from 'node:crypto'
import {
  actionCopy,
  actionVersion,
  describeAction,
  CompanionActionSchema,
  CompanionProposalSchema,
} from '@whaledot/core'
import type { CompanionAction, ActionFacts, Locale } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
import type { GoalIntake } from '../goal-intake/service.js'
import type { AutopilotScheduler } from '../autopilot/scheduler.js'
import type { CompanionMemory, MemoryExecution } from './memory.js'
import { memoryReview } from './memory.js'
import { managementConsent } from './consent.js'

/** Five management proposals. No grant, task execution or decision-routing entry point exists here. */
export class CompanionActions {
  private readonly pending = new Map<string, number>()
  private readonly lifetime = new AbortController()
  constructor(
    readonly store: WhaleStore,
    private readonly deps: {
      enabled(): boolean
      locale(): Locale
      owns(id: string): boolean
      confirm: CompanionMemory['confirm']
      intake: Pick<GoalIntake, 'start' | 'setPaused'>
      autopilot: Pick<AutopilotScheduler, 'setAutopilot'>
      setPaused(paused: boolean): void
      now?(): number
    },
  ) {}
  dispose() {
    this.lifetime.abort()
  }
  private facts(action: CompanionAction): ActionFacts {
    const goal = 'goalId' in action ? this.store.goals.get(action.goalId) : undefined
    return {
      goal,
      scope: goal?.scopeId ? this.store.scopes.get(goal.scopeId) : undefined,
      globalPaused: this.store.paused(),
      globalVersion: this.store.pauseVersion(),
      notesVersion: goal ? JSON.stringify(this.store.userNotes.list(goal.id).map((n) => n.id)) : '',
      notesCount: goal ? this.store.userNotes.list(goal.id).length : 0,
    }
  }
  /** Trust only the exact tool runtime's companion agent; model arguments cannot carry consent. */
  async propose(raw: unknown, execution: MemoryExecution) {
    const signal = AbortSignal.any([execution.signal, this.lifetime.signal]),
      exec = { ...execution, signal }
    signal.throwIfAborted()
    const sessionId = exec.agent?.session.id
    if (!sessionId || !this.deps.owns(sessionId)) throw Error('companion-only')
    const c = actionCopy(this.deps.locale())
    if (!this.deps.enabled()) return { status: 'disabled', message: c.disabled }
    const parsed = CompanionActionSchema.safeParse(raw)
    if (!parsed.success)
      return { status: 'rejected', message: parsed.error.issues[0]?.message ?? 'invalid-action' }
    const action = parsed.data,
      facts = this.facts(action),
      description = describeAction(action, facts, this.deps.locale())
    if (!description.ok) return { status: 'rejected', message: description.reason }
    const count = this.pending.get(sessionId) ?? 0
    if (count >= 3) return { status: 'rejected', message: c.pendingLimit }
    const now = () => this.deps.now?.() ?? Date.now(),
      proposal = CompanionProposalSchema.parse({
        proposalId: randomUUID(),
        sessionId,
        createdAt: now(),
        action,
        version: actionVersion(facts),
      })
    this.pending.set(sessionId, count + 1)
    let confirmedAt: number | undefined
    try {
      const qid = randomUUID(),
        answer = await this.deps.confirm(exec, {
          id: qid,
          question: c.question,
          detail: memoryReview(description.detail) + '\n\n' + c.noEdit,
          options: [{ label: c.confirm }, { label: c.decline }],
          multiSelect: false,
        })
      const item = answer?.answers.length === 1 ? answer.answers[0] : undefined
      if (
        signal.aborted ||
        !item ||
        item.id !== qid ||
        item.custom?.trim() ||
        item.selected.length !== 1 ||
        item.selected[0] !== c.confirm
      )
        return { status: 'declined', message: c.declined }
      if (!this.deps.enabled()) return { status: 'disabled', message: c.disabled }
      if (!this.deps.owns(sessionId) || actionVersion(this.facts(action)) !== proposal.version)
        return { status: 'rejected', message: c.changed }
      confirmedAt = now()
      const actor = managementConsent(signal),
        confirmationTime = confirmedAt
      const result = this.store.transaction(() => {
        // No await between the version check, existing service call and audit write.
        let value: unknown
        switch (action.kind) {
          case 'draft-goal':
            value = this.deps.intake.start(
              { text: action.text, projectRoot: action.projectRoot },
              actor,
              this.deps.locale(),
              {
                proposalId: proposal.proposalId,
                sessionId,
                confirmedAt: confirmationTime,
                text: action.text,
                projectRoot: action.projectRoot,
              },
            )
            break
          case 'goal-pause':
            value = this.deps.intake.setPaused({ goalId: action.goalId, paused: action.paused }, actor)
            break
          case 'autopilot':
            value = this.deps.autopilot.setAutopilot({
              goalId: action.goalId,
              enabled: action.enabled,
              ...(action.enabled ? { confirm: true, scopeHash: facts.scope!.hash } : {}),
            })
            break
          case 'global-pause':
            this.deps.setPaused(action.paused)
            value = { paused: action.paused }
            break
          case 'goal-note':
            this.store.userNotes.insert({
              id: randomUUID(),
              goalId: action.goalId,
              source: 'companion',
              at: confirmationTime,
              text: action.text,
            })
            value = { added: true }
            break
        }
        this.event(action, proposal.proposalId, sessionId, confirmationTime, 'succeeded')
        return value
      })
      return {
        status: action.kind === 'draft-goal' ? 'draft-started' : 'succeeded',
        message: action.kind === 'draft-goal' ? c.draftOnly : c.saved,
        proposalId: proposal.proposalId,
        confirmedAt,
        // Keep the bounded tool result free of goal details and histories.
        result: action.kind === 'draft-goal' ? result : undefined,
      }
    } catch (error) {
      if (signal.aborted) return { status: 'declined', message: c.declined }
      if (confirmedAt !== undefined) {
        try {
          this.event(action, proposal.proposalId, sessionId, confirmedAt, 'failed')
        } catch {
          /* original failure remains */
        }
      }
      return { status: 'failed', message: error instanceof Error ? error.message : 'service-unavailable' }
    } finally {
      const remaining = (this.pending.get(sessionId) ?? 1) - 1
      if (remaining) this.pending.set(sessionId, remaining)
      else this.pending.delete(sessionId)
    }
  }
  private event(
    action: CompanionAction,
    proposalId: string,
    sessionId: string,
    confirmedAt: number,
    reason: string,
  ) {
    this.store.autopilotEvents.insert({
      id: randomUUID(),
      ...('goalId' in action ? { goalId: action.goalId } : {}),
      at: confirmedAt,
      actor: 'companion-proposal',
      proposalId,
      sessionId,
      confirmedAt,
      action: action.kind,
      reason,
    })
  }
}
