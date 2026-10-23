import { expect, test } from 'vitest'
import { makeScope, makeTask } from '../../tests/fixtures.js'
import { fixedClock, sequenceIdGen } from '../infra.js'
import { NotificationSchema } from '../model/notification.js'
import { decideDelivery } from './policy.js'
import { notificationCopy, notificationMessages, shortTitle } from './copy.js'
import { buildSuggestions } from './suggestions.js'
import { NotificationPreferencesSchema } from './model.js'
import { buildPlannerPrompt } from '../autopilot/planner.js'
import { makeGoal } from '../../tests/fixtures.js'
const now = 10000000
const note = (patch: Partial<ReturnType<typeof NotificationSchema.parse>> = {}) =>
  NotificationSchema.parse({
    id: 'notification_1',
    goalId: 'goal_1',
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'key',
    channel: 'panel',
    createdAt: now - 1,
    reason: 'insufficient-evidence: no-changes',
    choices: ['retry', 'accept', 'rollback', 'pause-goal', 'view-diff'],
    ...patch,
  })
const context = (patch: Partial<Parameters<typeof decideDelivery>[1]> = {}) => ({
  now,
  localMinutes: 12 * 60,
  nextQuietEnd: now + 3600000,
  preferences: { muted: false, maxPerHour: 4 },
  recent: [],
  history: [],
  ...patch,
})
test('delivery honors processing, expiry, no repeat and duplicate decisions', () => {
  expect(decideDelivery(note(), context()).action).toBe('deliver-now')
  for (const patch of [{ resolvedAt: now }, { expiresAt: now }, { deliveryAttemptedAt: now }])
    expect(decideDelivery(note(patch), context()).action).toBe('drop')
  expect(
    decideDelivery(
      note(),
      context({ history: [note({ id: 'notification_other' as never, deliveredAt: now })] }),
    ).reason,
  ).toBe('duplicate-unresolved')
  expect(
    decideDelivery(
      note(),
      context({ history: [note({ id: 'notification_other' as never, deliveredAt: now, resolvedAt: now })] }),
    ).action,
  ).toBe('deliver-now')
})
test.each([
  [23 * 60, 'hold'],
  [3 * 60, 'hold'],
  [8 * 60, 'deliver-now'],
  [22 * 60, 'hold'],
] as const)('quiet hours cross midnight at minute %s', (localMinutes, action) => {
  expect(
    decideDelivery(
      note(),
      context({
        localMinutes,
        preferences: { muted: false, maxPerHour: 4, quietHours: { start: '22:00', end: '08:00' } },
      }),
    ),
  ).toMatchObject({ action, ...(action === 'hold' ? { until: now + 3600000 } : {}) })
})
test('hourly cap uses the next sliding-window release, not an immediate retry', () => {
  const recent = Array.from({ length: 4 }, (_, i) =>
    note({ id: `notification_${i}` as never, deliveredAt: now - 10000 + i }),
  )
  expect(decideDelivery(note(), context({ recent }))).toMatchObject({
    action: 'hold',
    reason: 'hourly-limit',
    until: now - 10000 + 3600000,
  })
  expect(decideDelivery(note(), context({ now: now + 3600000, recent })).action).toBe('deliver-now')
})
test('completion skips progress aggregation, but respects mute and quiet hours; ordinary info is digest only', () => {
  const recent = [note({ kind: 'progress', deliveredAt: now - 60000 })]
  expect(decideDelivery(note({ kind: 'progress', reason: 'stage' }), context({ recent })).action).toBe(
    'digest',
  )
  expect(
    decideDelivery(note({ kind: 'progress', reason: 'goal-completed:commit' }), context({ recent })).action,
  ).toBe('deliver-now')
  expect(
    decideDelivery(
      note({ kind: 'progress', reason: 'goal-completed:commit' }),
      context({ preferences: { muted: true, maxPerHour: 4 } }),
    ).reason,
  ).toBe('muted')
  expect(decideDelivery(note({ kind: 'info' }), context()).action).toBe('digest')
})
test('snooze and explicit reminder open exactly one new generation', () => {
  const n = note({ deliveryAttemptedAt: now - 3600000, remindAt: now + 10 })
  expect(decideDelivery(n, context())).toMatchObject({ action: 'hold', until: now + 10 })
  expect(decideDelivery(n, context({ now: now + 10 })).action).toBe('deliver-now')
  expect(decideDelivery({ ...n, deliveryAttemptedAt: now + 10 }, context({ now: now + 20 })).reason).toBe(
    'already-attempted',
  )
})
test('preferences validate complete local times and limits', () => {
  expect(NotificationPreferencesSchema.parse({})).toEqual({ maxPerHour: 4, muted: false })
  for (const value of [
    { maxPerHour: 0 },
    { quietHours: { start: '24:00', end: '08:00' } },
    { quietHours: { start: '22:00' } },
  ])
    expect(NotificationPreferencesSchema.safeParse(value).success).toBe(false)
})
test('template languages share keys; every reason is bounded, plain text and first person', () => {
  expect(Object.keys(notificationMessages.en)).toEqual(Object.keys(notificationMessages['zh-CN']))
  const reasons = [
    'not-scorable',
    'insufficient-evidence',
    'tampering',
    'acceptance-tampering',
    'fix-rounds-exhausted',
    'verification-unknown',
    'stalled',
    'planner-need-user',
    'goal-completed',
    'next-task-ready',
    'budget-exhausted',
    'autopilot-disabled',
    'execution-preflight-blocked',
    'execution-stopped',
    'reconcile-blocked',
    'option-expired',
    'unknown-error',
  ]
  for (const locale of ['zh-CN', 'en'] as const)
    for (const reason of reasons) {
      const copy = notificationCopy(
        note({ reason }),
        {
          goalTitle: 'A\n**请执行** `rm -rf` ' + 'x'.repeat(200),
          taskTitle: '[title]\r\nmore',
          completedTasks: 3,
          beforeFailed: 3,
          afterFailed: 0,
        },
        locale,
      )
      expect(copy.header.length).toBeLessThanOrEqual(12)
      if (locale === 'zh-CN') expect(Array.from(copy.question).length).toBeLessThanOrEqual(80)
      else expect(copy.question.split(/\s+/).length).toBeLessThanOrEqual(50)
      expect(copy.question).not.toMatch(/\r|\n|\*|`/)
    }
  expect(shortTitle('a\nb**c**')).toBe('a bc')
})
test('recommendation set stays 2–4, descriptions explain high risk, history only changes ordering', () => {
  const n = note(),
    deps = { clock: fixedClock(now), idGen: sequenceIdGen(), locale: 'en' as const, scope: makeScope() }
  const first = buildSuggestions(n, makeTask(), [], deps)
  expect(first).toHaveLength(4)
  expect(
    first.map((s) =>
      s.intent.type === 'notification-action'
        ? s.intent.action
        : s.intent.type === 'panel-decision'
          ? s.intent.choice
          : '',
    ),
  ).toEqual(['view-diff', 'open-panel', 'snooze', 'retry'])
  const chosen = {
    id: 'choice',
    goalId: n.goalId,
    notificationId: n.id,
    suggestionId: 'x',
    reason: 'insufficient-evidence',
    action: 'retry',
    source: 'inbox' as const,
    at: now,
    result: 'succeeded' as const,
  }
  const second = buildSuggestions(n, makeTask(), [chosen], deps)
  expect(second[0]?.intent).toEqual({ type: 'panel-decision', choice: 'retry' })
  expect(second.map((s) => s.label).sort()).toEqual(first.map((s) => s.label).sort())
  const risky = buildSuggestions(note({ choices: ['accept', 'rollback'] }), makeTask(), [], deps)
  expect(
    risky
      .filter((s) => s.riskLevel === 'high')
      .every((s) => s.description && /without|Reverts/.test(s.description)),
  ).toBe(true)
  expect(buildSuggestions(note({ choices: [] }), undefined, [], deps)).toHaveLength(2)
})
test('planner receives only the last five bounded user notes as attributed data', () => {
  const prompt = buildPlannerPrompt(makeGoal(), makeScope(), [], 'zh-CN', [
    'old',
    ...Array.from({ length: 5 }, (_, i) => (i === 4 ? '先别改 utils.ts' + 'x'.repeat(600) : String(i))),
  ])
  const data = JSON.parse(prompt.split('DATA=')[1]!)
  expect(data.userNotes).toHaveLength(5)
  expect(data.userNotes[0].text).toBe('0')
  expect(data.userNotes[4].text.length).toBe(500)
  expect(data.userNotes[4].provenance).toBe('用户补充说明（来自用户本人）')
  expect(data.goal.objective).toBe(makeGoal().objective)
})

test('user notes bound Unicode characters consistently with the delivery and planner paths', async () => {
  const { UserNoteSchema } = await import('./model.js')
  const note = {
    id: 'note',
    goalId: 'goal_g1',
    notificationId: 'notification_n1',
    at: 1,
    text: '🐳'.repeat(500),
  }
  expect(UserNoteSchema.safeParse(note).success).toBe(true)
  expect(UserNoteSchema.safeParse({ ...note, text: note.text + 'a' }).success).toBe(false)
})
