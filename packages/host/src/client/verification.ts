import { createElement as h, useState } from 'react'
import { t, verificationText } from '@whaledot/core'
import type { Locale, DecisionChoice } from '@whaledot/core'
import type { z } from 'zod'
import type { GoalDetailSchema } from '../panel-api/contract.js'

const labels = {
  verify: 'retryVerification',
  'resume-goal': 'resumeDecision',
  retry: 'decisionRetry',
  accept: 'decisionAccept',
  rollback: 'decisionRollback',
  'pause-goal': 'pauseGoal',
  'view-diff': 'decisionDiff',
} as const
/** Evidence viewer uses persisted identities only; no arbitrary host path is sent by the browser. */
export function VerificationView({
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
  const [preview, setPreview] = useState('')
  const text = (key: Parameters<typeof t>[1]) => t(locale, key)
  const show = async (method: string, input: unknown) => {
    try {
      setPreview(JSON.stringify(await call(method, input), null, 2))
    } catch (error) {
      setPreview(String(error))
    }
  }
  return h(
    'section',
    { className: 'whaledot-verification' },
    h('h3', null, text('verification')),
    ...detail.tasks
      .filter((task) => task.state === 'VERIFYING' || task.state === 'UNKNOWN')
      .map((task) =>
        h(
          'p',
          { key: task.id },
          task.title,
          ' ',
          h(
            'button',
            {
              disabled: saving,
              onClick: () => {
                void write(task.state === 'UNKNOWN' ? 'reconcile-task' : 'verify-task', { taskId: task.id })
              },
            },
            text(task.state === 'UNKNOWN' ? 'reconcileTask' : 'verifyTask'),
          ),
        ),
      ),
    ...detail.verifications.map((report) =>
      h(
        'article',
        { key: report.id },
        h(
          'strong',
          null,
          `${detail.tasks.find((task) => task.id === report.taskId)?.title ?? report.taskId}: ${report.judgment.verdict} · ${text('progress')}: ${verificationText(locale, report.judgment.progress)}`,
        ),
        h('p', null, report.judgment.reasons.map((reason) => verificationText(locale, reason)).join('; ')),
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...[text('verifyCommands'), text('baseline'), text('current')].map((label) =>
                h('th', { key: label }, label),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            ...report.current.map((result, index) =>
              h(
                'tr',
                { key: index },
                h('td', null, result.command),
                ...(['baseline', 'current'] as const).map((phase) => {
                  const entry = report[phase][index]
                  return h(
                    'td',
                    { key: phase },
                    entry
                      ? `${verificationText(locale, entry.status)} · ${entry.durationMs ?? 0} ms · ${entry.counts ? JSON.stringify(entry.counts) : '—'}`
                      : '—',
                    entry?.logPath &&
                      h(
                        'button',
                        {
                          onClick: () => {
                            void show('verification-log', { runId: report.id, phase, index })
                          },
                        },
                        text('viewLog'),
                      ),
                  )
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    h('h3', null, text('notifications')),
    ...detail.notifications
      .filter((item) => item.resolvedAt === undefined)
      .map((item) =>
        h(
          'article',
          { key: item.id },
          h(
            'p',
            null,
            [
              ...new Set(
                (item.reason ?? '').split(/: |; /).map((reason) => verificationText(locale, reason)),
              ),
            ].join('; '),
          ),
          h('small', null, `${item.taskId ?? ''} · ${item.runId ?? ''}`),
          ...(item.choices ?? []).map((choice: DecisionChoice) =>
            h(
              'button',
              {
                key: choice,
                disabled:
                  saving ||
                  (item.expiresAt ?? 0) <= Date.now() ||
                  detail.tasks.find((task) => task.id === item.taskId)?.version !== item.taskVersion,
                onClick: () => {
                  const input = { notificationId: item.id, choice }
                  if (choice === 'view-diff') void show('resolve-decision', input)
                  else void write('resolve-decision', input)
                },
              },
              text(labels[choice]),
            ),
          ),
        ),
      ),
    preview && h('details', { open: true }, h('summary', null, text('evidence')), h('pre', null, preview)),
  )
}
