import { expect, test } from 'vitest'
import {
  LessonDraftSchema,
  ConsolidationDraftSchema,
  MAX_CONSOLIDATION_SOURCES,
  MemoryProposalSchema,
} from '../index.js'

test('lesson output accepts skip or a lesson, rejecting mixed branches and extra fields', () => {
  for (const value of [
    { skip: true },
    { kind: 'decision', text: '先确认项目约束。' },
    { kind: 'constraint', text: '路径需要引号。' },
  ])
    expect(LessonDraftSchema.safeParse(value).success).toBe(true)
  for (const value of [
    { skip: false },
    { skip: true, kind: 'decision', text: 'mixed' },
    { skip: true, extra: 1 },
    { kind: 'decision', text: 'valid', extra: 1 },
    { kind: 'fact', text: 'wrong kind' },
  ])
    expect(LessonDraftSchema.safeParse(value).success).toBe(false)
})
test('new consolidation caps sources at 10 while historical 100-source proposals remain readable', () => {
  expect(MAX_CONSOLIDATION_SOURCES).toBe(10)
  const draft = {
    kind: 'fact',
    text: '合成测试记录',
    replaces: Array.from({ length: 10 }, (_, i) => `m${i}`),
  }
  expect(ConsolidationDraftSchema.safeParse(draft).success).toBe(true)
  expect(ConsolidationDraftSchema.safeParse({ ...draft, replaces: [...draft.replaces, 'm10'] }).success).toBe(
    false,
  )
  expect(
    MemoryProposalSchema.parse({
      id: 'historical',
      kind: 'memory-proposal',
      scope: { kind: 'personal' },
      memoryKind: 'fact',
      text: draft.text,
      origin: 'consolidation',
      replaces: Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, version: 1, text: `旧记录 ${i}` })),
      createdAt: 1,
      expiresAt: 2,
      status: 'pending',
      version: 1,
    }).replaces,
  ).toHaveLength(100)
})
