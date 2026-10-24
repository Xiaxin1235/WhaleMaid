import { DirectionSchema } from '@whaledot/core'
import type { GoalId } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
import { productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import { verificationBatch } from '../verify/runner.js'
/** Owner-only decisions share the existing serialized verification/decision slot. No tool exposes this. */
export class GoalDecisions {
  constructor(
    private readonly store: WhaleStore,
    private readonly scopes: Pick<ScopeService, 'activeScopeFor'>,
    private readonly stopGoal: (id: GoalId) => Promise<void>,
  ) {}
  apply(
    notificationId: string,
    action: 'abandon' | 'change-direction',
    input: {
      source: 'panel' | 'inbox'
      confirm?: boolean | undefined
      goalVersion: number
      direction?: string | undefined
    },
  ) {
    return verificationBatch(async () => {
      const n = this.store.notifications.get(notificationId),
        goal = n && this.store.goals.get(n.goalId)
      if (
        !n ||
        n.resolvedAt !== undefined ||
        !n.choices?.includes(action) ||
        !goal ||
        !['active', 'paused'].includes(goal.status) ||
        goal.version !== input.goalVersion
      )
        throw Error('decision-state-changed')
      if (action === 'abandon' && (input.source !== 'panel' || input.confirm !== true))
        throw Error('panel-confirmation-required')
      const direction =
        action === 'change-direction' ? DirectionSchema.parse(input.direction ?? '') : undefined
      const scopeHash = this.scopes.activeScopeFor(goal.id)?.hash
      if (!scopeHash) throw Error('option-authorization-changed')
      // Pause before awaiting cancellation; prevent any new launch while the old runtime settles.
      const staged = {
        ...goal,
        status: 'paused' as const,
        autopilot: { ...goal.autopilot, enabled: false },
        version: goal.version + 1,
      }
      this.store.goals.update(staged, goal.version)
      await this.stopGoal(goal.id)
      return this.store.transaction(() => {
        const current = this.store.goals.get(goal.id)!,
          notice = this.store.notifications.get(notificationId)
        if (
          current.version !== staged.version ||
          notice?.resolvedAt !== undefined ||
          this.scopes.activeScopeFor(goal.id)?.hash !== scopeHash
        )
          throw Error('decision-state-changed')
        const at = Date.now()
        if (direction)
          this.store.userNotes.insert({
            id: productionIdGen.next('user-note'),
            goalId: goal.id,
            notificationId: n.id,
            source: 'decision',
            at,
            text: direction,
          })
        for (const original of this.store.tasks.list(goal.id)) {
          if (['SUCCEEDED', 'CANCELLED'].includes(original.state)) continue
          let task = original
          const move = (state: 'PAUSED' | 'BLOCKED' | 'CANCELLED') => {
            const r = this.store.tasks.transition(task.id, state, {
              expectedVersion: task.version,
              source: 'user',
              reason: `user-${action}`,
            })
            if (!r.ok) throw Error(r.error.code)
            task = r.value.task
          }
          if (task.state === 'RUNNING' || task.state === 'VERIFYING') move('PAUSED')
          else if (task.state === 'UNKNOWN') move('BLOCKED')
          move('CANCELLED')
        }
        const status = action === 'abandon' ? ('cancelled' as const) : ('active' as const)
        this.store.goals.update(
          {
            ...current,
            status,
            stalled: action === 'change-direction' ? 0 : current.stalled,
            autopilot:
              action === 'abandon'
                ? { ...goal.autopilot, enabled: false, disabledReason: 'user-abandoned' }
                : goal.autopilot,
            version: current.version + 1,
          },
          current.version,
        )
        if (direction) {
          const old = this.store.plannerState.get(goal.id)
          this.store.plannerState.put({
            id: goal.id,
            day: old?.day ?? '',
            calls: old?.calls ?? 0,
            status: 'none',
            frontier: '',
            reason: '',
            notBefore: 0,
          })
        }
        for (const notice of this.store.notifications
          .list()
          .filter((item) => item.goalId === goal.id && item.resolvedAt === undefined)) {
          this.store.notifications.update({
            ...notice,
            resolvedAt: at,
            resolvedChoice: action,
            resolvedSource: input.source,
          })
          this.store.suggestions.consume(notice.id, at)
        }
        this.store.autopilotEvents.insert({
          id: productionIdGen.next('autopilot_event'),
          goalId: goal.id,
          at,
          action,
          reason: 'user-decision',
          actor: 'user',
          decisionId: n.id,
        })
        return { state: status }
      })
    })
  }
}
