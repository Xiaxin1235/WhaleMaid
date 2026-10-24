import { createElement as h, useState } from 'react'
import { t, autopilotText, actionCopy, goalDecisionCopy } from '@whaledot/core'
import type { Locale } from '@whaledot/core'
import type { z } from 'zod'
import { TraceResponseSchema } from '../panel-api/contract.js'
import type { GoalDetailSchema } from '../panel-api/contract.js'
/** Opt-in controls bind confirmation to the exact active scope displayed to the owner. */
export function AutopilotView({
  detail,
  locale,
  saving,
  write,
  call,
}: {
  detail: z.infer<typeof GoalDetailSchema>
  locale: Locale
  saving: boolean
  write: (method: string, input: unknown) => Promise<void>
  call: (method: string, input: unknown) => Promise<unknown>
}) {
  const [error, setError] = useState('')
  const text = (key: Parameters<typeof t>[1], params: Record<string, string | number> = {}) =>
    t(locale, key, params)
  const { goal, activeScope: scope } = detail
  const run = detail.runs.find((run) => run.status === 'running'),
    last = detail.autopilotEvents.at(-1)
  const pending = detail.notifications.some(
    (n) => ['decision', 'blocked'].includes(n.kind) && n.resolvedAt === undefined,
  )
  const pausedReason = detail.globalPaused
    ? text('globalPausedReason')
    : !scope
      ? text('reasonScope')
      : goal.status === 'paused'
        ? text('goalPausedReason')
        : goal.autopilot.disabledReason
          ? autopilotText(locale, goal.autopilot.disabledReason)
          : text('autopilotOff')
  const status =
    goal.status === 'cancelled'
      ? goalDecisionCopy(locale).cancelled
      : goal.status === 'completed' || goal.status === 'succeeded'
        ? text('autopilotCompleted')
        : pending
          ? text('autopilotWaiting')
          : detail.globalPaused || !scope || goal.status === 'paused' || !goal.autopilot.enabled
            ? text('autopilotPaused', { reason: pausedReason })
            : run
              ? text('autopilotRunning', {
                  task: detail.tasks.find((task) => task.id === run.taskId)?.title ?? run.taskId,
                })
              : last?.reason === 'budget-exhausted'
                ? text('autopilotBudget')
                : last?.action === 'plan' && last.reason === 'begin'
                  ? text('autopilotPlanning')
                  : text('autopilotEnabled')
  const toggle = () => {
    const enabled = !goal.autopilot.enabled
    if (
      enabled &&
      (!scope ||
        !window.confirm(
          text('autopilotConfirm', {
            path: goal.projectRoot,
            preset: scope.permissionPreset,
            mode: text(scope.commandMode === 'trusted' ? 'commandTrusted' : 'commandConfirmed'),
            runs: scope.limits.maxRunsPerDay,
            plans: scope.limits.plannerCallsPerDay,
          }),
        ))
    )
      return
    void write('set-autopilot', {
      goalId: goal.id,
      enabled,
      ...(enabled ? { confirm: true, scopeHash: scope!.hash } : {}),
    })
  }
  const download = async () => {
    try {
      const trace = TraceResponseSchema.parse(await call('export-trace', { goalId: goal.id }))
      const url = URL.createObjectURL(new Blob([trace.markdown], { type: 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = trace.filename
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setError('')
    } catch (error) {
      setError(String(error))
    }
  }
  return h(
    'section',
    { className: 'whaledot-autopilot' },
    h('h3', null, text('autopilot')),
    h('p', { role: 'status' }, status),
    ...detail.autopilotEvents
      .filter(
        (e) => e.actor === 'companion-proposal' && (e.goalId === goal.id || e.action === 'global-pause'),
      )
      .slice(-3)
      .map((e) =>
        h(
          'p',
          { key: e.id, 'data-companion-attribution': true },
          actionCopy(locale).attribution(
            new Date(e.confirmedAt!).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
          ),
        ),
      ),
    h(
      'button',
      {
        disabled: saving || (!goal.autopilot.enabled && (!scope || goal.status !== 'active')),
        onClick: toggle,
      },
      text(goal.autopilot.enabled ? 'autopilotStop' : 'autopilotStart'),
    ),
    h(
      'button',
      {
        disabled: saving,
        onClick: () => {
          void download()
        },
      },
      text('exportTrace'),
    ),
    error && h('p', { role: 'alert' }, error),
    h(
      'details',
      null,
      h('summary', null, text('autopilotEvents')),
      h(
        'table',
        null,
        h(
          'tbody',
          null,
          ...detail.autopilotEvents.map((event) =>
            h(
              'tr',
              { key: event.id },
              h('td', null, new Date(event.at).toLocaleString(locale)),
              h('td', null, autopilotText(locale, event.action)),
              h('td', null, autopilotText(locale, event.reason)),
              h('td', null, event.taskId ?? event.runId ?? ''),
            ),
          ),
        ),
      ),
    ),
  )
}
