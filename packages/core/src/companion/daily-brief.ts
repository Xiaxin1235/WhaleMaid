import { z } from 'zod'
import type { Locale } from '../i18n/index.js'
import { dailyBriefCopy } from '../i18n/daily-brief.js'
import { shortTitle } from '../notify/copy.js'
import { redactSecrets } from './redact.js'

export const DailyGoalChangesSchema = z.array(
  z.object({ goalId: z.string(), status: z.string(), at: z.number() }),
)
export const DailyBriefQuerySchema = z.strictObject({ date: z.iso.date().optional() })
export const DailyBriefRecordSchema = z.strictObject({
  date: z.iso.date(),
  generatedAt: z.number(),
  from: z.number(),
  to: z.number(),
  text: z.string().min(1).max(1200),
  deliveredAt: z.number().optional(),
  decisions: z.array(z.object({ id: z.string(), goalId: z.string(), title: z.string() })).max(5),
})
export type DailyBriefRecord = z.infer<typeof DailyBriefRecordSchema>
type Item = { id: string; at: number; title: string; kind: 'goal' | 'task' | 'verification'; status: string }
/** Explicit projection: command text, transcripts, file contents and experience prose have no field here. */
export interface DailyBriefFacts {
  completed: readonly Item[]
  problems: readonly Item[]
  decisions: readonly { id: string; goalId: string; title: string; at: number }[]
  automation: {
    runs: number
    plans: number
    quotas: readonly { id: string; title: string; runsRemaining: number; plansRemaining: number }[]
  }
  proposals: readonly { id: string; at: number; title: string; action: string; confirmed: boolean }[]
  experiences: readonly { id: string; at: number }[]
}
export function briefTitle(value: string): string {
  return shortTitle(redactSecrets(value).replaceAll('{{', '{ {'))
}
const order = <T extends { id: string; at: number }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** Stable bounded rendering. Each section has its own budget so decisions cannot be crowded out. */
export function buildDailyBrief(facts: DailyBriefFacts, locale: Locale): string {
  if (
    !facts.completed.length &&
    !facts.problems.length &&
    !facts.decisions.length &&
    !facts.proposals.length &&
    !facts.experiences.length &&
    !facts.automation.runs &&
    !facts.automation.plans
  )
    return ''
  const c = dailyBriefCopy(locale)
  const status = (s: string) => c.statuses[s as keyof typeof c.statuses] ?? c.statuses.UNKNOWN
  const item = (v: Item) => `${c[v.kind]} ${briefTitle(v.title)} · ${status(v.status)}`
  const sections: [string, string[]][] = [
    [c.completed, order(facts.completed).map(item)],
    [c.problems, order(facts.problems).map(item)],
    [
      `${c.waiting} (${c.decisions(facts.decisions.length)})`,
      order(facts.decisions).map((v) => briefTitle(v.title)),
    ],
    [
      c.automation,
      facts.automation.runs || facts.automation.plans || facts.automation.quotas.length
        ? [
            c.usage(facts.automation.runs, facts.automation.plans),
            ...[...facts.automation.quotas]
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              .map((v) => `${briefTitle(v.title)} · ${c.remaining(v.runsRemaining, v.plansRemaining)}`),
          ]
        : [],
    ],
    [
      c.proposals,
      [
        ...order(facts.proposals).map(
          (v) =>
            `${briefTitle(v.title)} · ${c.actions[v.action as keyof typeof c.actions] ?? c.proposed} · ${v.confirmed ? c.confirmed : c.proposed}`,
        ),
        ...order(facts.experiences).map(() => c.experience),
      ],
    ],
  ]
  return sections
    .filter(([, rows]) => rows.length)
    .map(([heading, rows]) => {
      const selected: string[] = []
      // 238 code units per section including heading, bullets and overflow. Total <=1198.
      for (const row of rows.slice(0, 5)) {
        const next = '• ' + row
        const omitted = rows.length - selected.length - 1
        const tail = omitted ? '\n' + c.more(omitted) : ''
        if ([heading, ...selected, next].join('\n').length + tail.length > 238) break
        selected.push(next)
      }
      // A long title must still show something; titles use the shared shortTitle rule first.
      if (!selected.length) selected.push('• ' + rows[0]!.slice(0, 145) + '…')
      if (rows.length > selected.length) selected.push(c.more(rows.length - selected.length))
      return [heading, ...selected].join('\n')
    })
    .join('\n\n')
}
