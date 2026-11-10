import { buildWorld, isDecision, radarDetectors, WorldPreferencesSchema } from '@whalemaid/core'
import type { WorldGoalFact, WorldPreferencePatch, WorldPreferences, WorldTaskFact } from '@whalemaid/core'
import type { WhaleStore } from './store/index.js'
import type { RadarService } from './radar/service.js'

export class Mansion {
  constructor(
    private readonly store: WhaleStore,
    private readonly radar: Pick<RadarService, 'facts' | 'hold'>,
    private readonly defaults: { enabled?: boolean; petWalksIn?: boolean } | undefined,
  ) {}

  preferences(): WorldPreferences {
    return this.store.worldPreferences() ?? WorldPreferencesSchema.parse(this.defaults ?? {})
  }

  update(patch: WorldPreferencePatch): WorldPreferences {
    const next = this.preferences()
    if (patch.kind === 'archive') {
      if (!this.store.goals.get(patch.id)) throw Error('goal-not-found')
      const archived = new Set(next.archived)
      if (patch.value) archived.add(patch.id)
      else archived.delete(patch.id)
      next.archived = [...archived]
    } else if (patch.kind === 'camera') next.camera = patch.value
    else next[patch.kind] = patch.value
    this.store.setWorldPreferences(next)
    return next
  }

  snapshot(now = Date.now()) {
    const preferences = this.preferences()
    if (!preferences.enabled) throw Error('world-disabled')
    const { store } = this
    const journal = store.journal.list().filter((row) => row.status === 'active' && row.kind === 'experience')
    const goals = store.goals.list().map((goal): WorldGoalFact => {
      const { id, title, status } = goal
      const scope = goal.scopeId ? store.scopes.get(goal.scopeId) : undefined
      const runs = store.runs.forGoal(id)
      const checks = store.verifications.forGoal(id).sort((a, b) => a.createdAt - b.createdAt)
      const findings = store.opportunities
        .list(id)
        .filter((row) => ['open', 'delivered'].includes(row.status) && row.expiresAt > now)
      const notices = store.notifications
        .forGoal(id)
        .filter(
          (n) =>
            n.resolvedAt === undefined && (n.expiresAt ?? Infinity) > now && n.deliveryState !== 'cancelled',
        )
      const decision = notices.findLast((n) => isDecision(n))?.id
      const card = notices.findLast((n) =>
        n.initiative?.ids.some((key) => findings.some((f) => f.id === key)),
      )?.id
      const radar = this.radar.facts(goal)
      const tasks = store.tasks.list(id).map((t): WorldTaskFact => {
        const last = checks.findLast((check) => check.taskId === t.id)
        const counted = last?.current.flatMap((command) => (command.counts ? [command.counts] : [])) ?? []
        const tests = counted.length
          ? counted.reduce((a, b) => ({ passed: a.passed + b.passed, failed: a.failed + b.failed }), {
              passed: 0,
              failed: 0,
            })
          : undefined
        return {
          id: t.id,
          title: t.title,
          state: t.state,
          ...(tests ? { tests } : {}),
          running: runs.some((run) => run.taskId === t.id && run.status === 'running' && !run.reason),
          failed: t.state === 'FAILED' || last?.judgment.verdict === 'FAIL',
          stalled:
            findings.some((f) => f.subject.taskId === t.id && f.detector === 'stallWarning') ||
            ((goal.stalled ?? 0) > 0 &&
              ['BLOCKED', 'UNKNOWN', 'FAILED', 'WAITING_APPROVAL'].includes(t.state)),
        }
      })
      return {
        id,
        title,
        status,
        summary: goal.expectedOutcome,
        experiences: journal
          .flatMap((row) => (row.kind === 'experience' && row.refs.includes(id) ? [row.text] : []))
          .slice(-10),
        tasks,
        stalled: goal.stalled ?? 0,
        repeatedFailure: findings.some((row) => row.detector === 'repeatedFailure'),
        ...(decision ? { decision } : {}),
        ...(card ? { card } : {}),
        parcel: radarDetectors.radarDependency(radar).length > 0,
        flicker: radarDetectors.radarCI(radar).length > 0,
        hold: !!this.radar.hold(id),
        locked: scope?.status === 'revoked',
      }
    })
    return {
      preferences,
      snapshot: buildWorld(
        { goals, paused: store.paused(), quietHours: store.notificationPreferences().quietHours },
        now,
        { archived: preferences.archived, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      ),
    }
  }
}
