import { expect, test } from 'vitest'
import { en, zhCN, resolveLocale, t, commandDangerCategory } from './index.js'

test('both languages contain exactly the same nonempty keys', () => {
  expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort())
  for (const dict of [en, zhCN]) for (const value of Object.values(dict)) expect(value).not.toBe('')
})
test.each([
  ['auto', 'zh', 'zh-CN'],
  ['auto', 'zh-CN', 'zh-CN'],
  ['auto', 'en', 'en'],
  ['auto', 'ja', 'en'],
  ['auto', 'zh-TW', 'en'],
  ['auto', undefined, 'en'],
  ['en', 'zh', 'en'],
  ['zh-CN', 'en', 'zh-CN'],
] as const)('resolves %s with host %s', (setting, host, expected) => {
  expect(resolveLocale(setting, host)).toBe(expected)
})
test('interpolates named values without interpreting them', () => {
  expect(t('en', 'requestFailed', { code: '$&' })).toBe('Request failed ($&).')
  expect(t('en', 'requestFailed')).toBe('Request failed ({code}).')
})

test('danger categories translate combined labels and keep unknown codes out of approval summaries', () => {
  expect(commandDangerCategory('zh-CN', 'delete, recursive-delete')).toBe('删除、递归删除')
  expect(commandDangerCategory('en', 'delete, recursive-delete')).toBe('Deletion, Recursive deletion')
  expect(commandDangerCategory('zh-CN', 'dynamic-execution, unresolved-command-path')).toBe(
    '动态执行、路径尚未解析',
  )
  expect(commandDangerCategory('en', 'process-control')).toBe('Process control')
  expect(commandDangerCategory('zh-CN', 'future-internal-code')).toBe('危险操作')
  expect(commandDangerCategory('en', 'future-internal-code')).toBe('Dangerous operation')
})
