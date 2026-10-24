import { expect, test } from 'vitest'
import {
  DecisionChoiceSchema,
  NotificationSchema,
  DirectionSchema,
  goalDecisionChoices,
  goalDecisionCopy,
  notificationMessages,
  buildSuggestions,
  fixedClock,
  sequenceIdGen,
  lessonTrigger,
} from '../index.js'
import { makeScope } from '../../tests/fixtures.js'
test('new choices parse, old notification choices remain readable and only stopped owner decisions gain buttons', () => {
  for (const choice of ['abandon', 'change-direction'])
    expect(DecisionChoiceSchema.parse(choice)).toBe(choice)
  const old = NotificationSchema.parse({
    id: 'notification_old',
    goalId: 'goal_1',
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'old',
    channel: 'panel',
    createdAt: 1,
    choices: ['retry', 'pause-goal'],
  })
  expect(old.choices).toEqual(['retry', 'pause-goal'])
  expect(
    goalDecisionChoices(['verify'], 'verification-unknown: command-error-or-timeout', 'decision'),
  ).toEqual(['verify', 'abandon', 'change-direction'])
  for (const [kind, reason] of [
    ['progress', 'goal-completed'],
    ['info', 'budget-exhausted'],
    ['decision', 'next-task-ready'],
    ['info', 'stalled'],
  ] as const)
    expect(goalDecisionChoices(['pause-goal'], reason, kind)).toEqual(['pause-goal'])
})
test('direction is bounded and rejects exactly the shared secret patterns', () => {
  for (const text of [
    '',
    '  ',
    'x'.repeat(501),
    'token=verysecret123',
    '密码：test123',
    '银行卡号：1234567890123456',
  ])
    expect(DirectionSchema.safeParse(text).success).toBe(false)
  expect(DirectionSchema.parse('  先只读检查项目，暂不修改文件。  ')).toBe('先只读检查项目，暂不修改文件。')
  expect(DirectionSchema.safeParse('好'.repeat(500)).success).toBe(true)
})
test('native suggestions offer change direction and omit destructive abandonment; bilingual copy states consequences', () => {
  const n = NotificationSchema.parse({
    id: 'notification_new',
    goalId: 'goal_1',
    kind: 'decision',
    priority: 'high',
    dedupeKey: 'new',
    channel: 'panel',
    createdAt: 1,
    choices: ['verify', 'pause-goal', 'abandon', 'change-direction'],
  })
  for (const locale of ['zh-CN', 'en'] as const) {
    const options = buildSuggestions(n, undefined, [], {
      scope: makeScope(),
      clock: fixedClock(1),
      idGen: sequenceIdGen(),
      locale,
      goalVersion: 2,
    })
    expect(options).toHaveLength(4)
    expect(
      options.some((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'change-direction'),
    ).toBe(true)
    expect(options.some((s) => s.intent.type === 'panel-decision' && s.intent.choice === 'abandon')).toBe(
      false,
    )
    expect(notificationMessages[locale].abandon[0]).toBe(goalDecisionCopy(locale).abandon)
    expect(goalDecisionCopy(locale).abandonment('Fixture')).toContain('Fixture')
    expect(goalDecisionCopy(locale).inboxHint).toContain(
      locale === 'zh-CN' ? '每一轮任务' : 'every subsequent task',
    )
  }
})
test.each(['abandon', 'change-direction'])(
  'a successful persisted %s choice naturally triggers the lesson listener',
  (action) => {
    expect(lessonTrigger({ kind: 'choice', status: 'succeeded', action })).toBe('decision')
    expect(lessonTrigger({ kind: 'choice', status: 'pending', action })).toBeUndefined()
  },
)
