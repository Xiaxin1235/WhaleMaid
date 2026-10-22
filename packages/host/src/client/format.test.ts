import { expect, test } from 'vitest'
import { serviceRows, formatStartedAt } from './format.js'
import { snapshot } from '../../tests/panel-fixture.js'

test('formats all six dependencies with accessible text in each language', () => {
  expect(serviceRows(snapshot, 'zh-CN')).toHaveLength(6)
  expect(serviceRows(snapshot, 'zh-CN')[0]).toEqual({ name: 'gateway', available: true, text: '✓ 可用' })
  expect(serviceRows(snapshot, 'en')[2]?.text).toBe('✗ Service unavailable')
})
test('formats startup timestamp in the chosen locale', () => {
  for (const locale of ['en', 'zh-CN'] as const) {
    expect(formatStartedAt(1000, locale)).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(1000),
    )
  }
})
