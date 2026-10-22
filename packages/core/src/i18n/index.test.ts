import { expect, test } from 'vitest'
import { en, zhCN, resolveLocale, t } from './index.js'

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
