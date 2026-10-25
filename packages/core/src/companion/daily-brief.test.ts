import { expect, it } from 'vitest'
import { buildDailyBrief } from './daily-brief.js'
import type { DailyBriefFacts } from './daily-brief.js'

const facts = (): DailyBriefFacts => ({
  completed: [],
  problems: [],
  decisions: [],
  automation: { runs: 0, plans: 0, quotas: [] },
  proposals: [],
  experiences: [],
})
it('returns nothing for no events, even with unused quotas', () => {
  const f = facts()
  f.automation.quotas = [{ id: 'g', title: 'g', runsRemaining: 10, plansRemaining: 5 }]
  expect(buildDailyBrief(f, 'zh-CN')).toBe('')
})
it('renders each structured section in both languages without raw payload fields', () => {
  const f = facts()
  f.completed = [{ id: 'done', at: 1, title: '目标一', kind: 'task', status: 'SUCCEEDED' }]
  f.problems = [{ id: 'bad', at: 1, title: '验收一', kind: 'verification', status: 'UNKNOWN' }]
  f.decisions = [{ id: 'n', at: 1, goalId: 'g', title: '目标一' }]
  f.automation = {
    runs: 2,
    plans: 1,
    quotas: [{ id: 'g', title: '目标一', runsRemaining: 8, plansRemaining: 4 }],
  }
  f.proposals = [{ id: 'a', at: 1, title: '目标一', action: 'autopilot', confirmed: true }]
  f.experiences = [{ id: 'e', at: 1 }]
  const extra = { ...f, command: 'rm -rf secret', transcript: 'PRIVATE CHAT', fileContent: 'PRIVATE FILE' }
  const zh = buildDailyBrief(extra, 'zh-CN'),
    en = buildDailyBrief(extra, 'en')
  for (const s of ['完成了什么', '出了什么问题', '在等你决定', '自动推进用了多少', '用户已确认', '今日剩余'])
    expect(zh).toContain(s)
  for (const s of [
    'Completed',
    'Problems',
    'Waiting for your decision',
    'Remaining today',
    'confirmed by user',
  ])
    expect(en).toContain(s)
  for (const s of ['rm -rf secret', 'PRIVATE CHAT', 'PRIVATE FILE']) {
    expect(zh).not.toContain(s)
    expect(en).not.toContain(s)
  }
})
it('caps every section at five items, counts omissions and stays byte-stable under reordered facts', () => {
  const f = facts()
  f.completed = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    at: i,
    title: '💙'.repeat(80) + '{{danger}}',
    kind: 'task',
    status: 'SUCCEEDED',
  }))
  f.problems = f.completed.map((v) => ({ ...v, status: 'FAILED' }))
  f.decisions = f.completed.map((v) => ({ ...v, goalId: 'g' }))
  f.automation = {
    runs: 40,
    plans: 30,
    quotas: f.completed.map((v) => ({ ...v, runsRemaining: 1, plansRemaining: 1 })),
  }
  f.proposals = f.completed.map((v) => ({ ...v, action: 'autopilot', confirmed: true }))
  f.experiences = f.completed
  for (const locale of ['zh-CN', 'en'] as const) {
    const text = buildDailyBrief(f, locale)
    expect(text.length).toBeLessThanOrEqual(1200)
    expect(text).toMatch(/另有|more/)
    for (const section of text.split('\n\n'))
      expect(section.split('\n').filter((l) => l.startsWith('•')).length).toBeLessThanOrEqual(5)
    expect(text).toBe(
      buildDailyBrief(
        {
          ...f,
          completed: [...f.completed].reverse(),
          decisions: [...f.decisions].reverse(),
          automation: { ...f.automation, quotas: [...f.automation.quotas].reverse() },
        },
        locale,
      ),
    )
    expect(text).not.toContain('{{')
  }
})
