import { expect, test } from 'vitest'
import {
  MemorySchema,
  validateMemoryText,
  ProjectKeySchema,
  projectKeyForGoal,
  renderMemoryBlock,
  searchMemories,
  canActivateMemory,
} from './index.js'
import type { Memory } from './index.js'
const row = (i: number, text = `pref ${i}`): Memory =>
  MemorySchema.parse({
    id: `m${i}`,
    scope: { kind: 'personal' },
    kind: 'preference',
    text,
    source: { via: 'panel' },
    confirmedAt: i,
    createdAt: i,
    updatedAt: i,
    status: 'active',
    version: 1,
  })
test('Windows project keys follow the first allowed path and match case/separators/trailing slash', () => {
  for (const p of ['D:/PROJECT/', 'd:\\project', 'D:\\PROJECT\\.'])
    expect(ProjectKeySchema.parse(p)).toBe('d:\\project')
  expect(ProjectKeySchema.safeParse('../relative').success).toBe(false)
  expect(projectKeyForGoal({ scopeId: 's' }, { id: 's', allowedPaths: ['D:/Project/', 'D:/Other'] })).toBe(
    'd:\\project',
  )
  expect(projectKeyForGoal({ scopeId: 'x' }, { id: 's', allowedPaths: ['D:/Project'] })).toBeUndefined()
})
test('single paragraph, bounded Unicode text and secrets are rejected rather than redacted', () => {
  for (const text of [
    'sk-test1234567890abcdefghijkl',
    'token=topsecret123',
    'Bearer abcdefghijklmnop',
    '密码是 123456',
  ])
    expect(validateMemoryText(text)).toEqual({ ok: false, reason: 'contains-secret' })
  for (const text of ['以后叫我阿星', '喜欢简短回答', '项目先别动 utils.ts'])
    expect(validateMemoryText(text).ok).toBe(true)
  for (const text of ['', 'a'.repeat(301), 'a\nb']) expect(validateMemoryText(text).ok).toBe(false)
  expect(validateMemoryText('  hello  ')).toEqual({ ok: true, text: 'hello' })
})
test('stable grouped blocks escape templates, cap total bytes and disclose omitted rows', () => {
  const rows = Array.from({ length: 50 }, (_, i) => row(i, `{{variable}} ${'x'.repeat(130)}`))
  const block = renderMemoryBlock(rows, 'zh-CN', 600)
  expect(block.length).toBeLessThanOrEqual(600)
  expect(block).toContain('还有')
  expect(block).toContain('偏好')
  expect(block).not.toContain('{{')
  expect(block).toContain('m49')
  expect(renderMemoryBlock([...rows].reverse(), 'zh-CN', 600)).toBe(block)
  expect(renderMemoryBlock([], 'en')).toBe('')
})
test('scope cap, replacement allowance, bounded retrieval and stale references', () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(i))
  expect(canActivateMemory(rows, row(101))).toBe(false)
  expect(canActivateMemory(rows, row(101), ['m1'])).toBe(true)
  const result = searchMemories(rows, { kind: 'personal' }, undefined, 100 * 86400000)
  expect(result.total).toBe(100)
  expect(result.truncated).toBe(true)
  expect(result.items.length).toBeLessThanOrEqual(20)
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(4000)
  expect(result.items[0]?.stale).toBe(true)
  expect(
    searchMemories(rows, { kind: 'personal' }, 'pref 99', 100 * 86400000, { m99: 99 * 86400000 }).items[0]
      ?.stale,
  ).toBe(false)
})
