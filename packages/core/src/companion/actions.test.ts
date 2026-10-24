import { expect, test } from 'vitest'
import {
  CompanionActionSchema,
  describeAction,
  actionVersion,
  UserNoteSchema,
  CompanionNoteSchema,
} from '../index.js'
import type { CompanionAction, ActionFacts } from './actions.js'
import { makeGoal, makeScope } from '../../tests/fixtures.js'
const facts: ActionFacts = {
  goal: makeGoal({ title: '补全说明' }),
  scope: makeScope(),
  globalPaused: false,
  globalVersion: 0,
  notesVersion: '',
  notesCount: 0,
}
const actions: CompanionAction[] = [
  { kind: 'draft-goal', text: '补充 README', projectRoot: 'C:/proj' },
  { kind: 'goal-pause', goalId: 'goal_1', paused: true },
  { kind: 'autopilot', goalId: 'goal_1', enabled: true },
  { kind: 'global-pause', paused: true },
  { kind: 'goal-note', goalId: 'goal_1', text: '先别动 utils.ts' },
].map((a) => CompanionActionSchema.parse(a))
test.each(actions)('strict schema for $kind rejects consent and unrelated parameters', (action) => {
  expect(CompanionActionSchema.safeParse(action).success).toBe(true)
  for (const key of ['confirmed', 'scopeHash', 'answer', 'extra'])
    expect(CompanionActionSchema.safeParse({ ...action, [key]: true }).success).toBe(false)
})
test('description is bilingual, uses goal title and shows actual authorization and effects', () => {
  for (const locale of ['zh-CN', 'en'] as const)
    for (const action of actions) {
      const r = describeAction(action, facts, locale)
      expect(r.ok).toBe(true)
      if (!r.ok) throw Error('fixture')
      if ('goalId' in action) expect(r.detail).toContain('补全说明')
      if (action.kind === 'autopilot') {
        expect(r.detail).toContain('C:\\proj')
        expect(r.detail).toContain('workspace-write')
        expect(r.detail).toContain('20')
        expect(r.detail).toContain('5')
      }
      if (action.kind === 'draft-goal')
        expect(r.detail).toContain(locale === 'zh-CN' ? '不会开始执行' : 'will not start execution')
      if (action.kind === 'goal-note')
        expect(r.detail).toContain(locale === 'zh-CN' ? '后续任务提示词' : 'subsequent task prompts')
    }
})
test('missing, no-op and invalid authorization reject without a confirmation description', () => {
  expect(describeAction(actions[1]!, { ...facts, goal: undefined }, 'zh-CN')).toMatchObject({
    ok: false,
    reason: expect.stringContaining('不存在'),
  })
  expect(describeAction(actions[1]!, { ...facts, goal: makeGoal({ status: 'paused' }) }, 'en')).toMatchObject(
    { ok: false, reason: expect.stringContaining('Already') },
  )
  expect(describeAction(actions[2]!, { ...facts, scope: undefined }, 'zh-CN')).toMatchObject({ ok: false })
  expect(
    describeAction(actions[2]!, { ...facts, goal: makeGoal({ status: 'completed' }) }, 'en'),
  ).toMatchObject({ ok: false })
  expect(describeAction(actions[3]!, { ...facts, globalPaused: true }, 'en')).toMatchObject({ ok: false })
  expect(actionVersion({ ...facts, globalVersion: 2 })).not.toBe(actionVersion(facts))
})
test('notes retain historical notification rows and require companion source without notification identity', () => {
  expect(
    UserNoteSchema.parse({
      id: 'old',
      goalId: 'goal_1',
      notificationId: 'notification_1',
      at: 1,
      text: 'old',
    }).notificationId,
  ).toBe('notification_1')
  expect(UserNoteSchema.safeParse({ id: 'new', goalId: 'goal_1', at: 1, text: 'new' }).success).toBe(false)
  expect(
    UserNoteSchema.safeParse({ id: 'new', goalId: 'goal_1', source: 'companion', at: 1, text: 'new' })
      .success,
  ).toBe(true)
  expect(CompanionNoteSchema.safeParse('密钥 token=verysecret123').success).toBe(false)
  expect(CompanionNoteSchema.safeParse('好'.repeat(500)).success).toBe(true)
  expect(CompanionNoteSchema.safeParse('好'.repeat(501)).success).toBe(false)
  expect(CompanionActionSchema.safeParse({ kind: 'abandon', goalId: 'goal_1' }).success).toBe(false)
  expect(
    CompanionActionSchema.safeParse({ kind: 'change-direction', goalId: 'goal_1', text: 'x' }).success,
  ).toBe(false)
})
