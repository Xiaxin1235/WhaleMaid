import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, test, vi } from 'vitest'
import { apply, name } from './index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

test('host scaffold logs loading through the Cordis context', () => {
  const ctx = new Context()

  apply(ctx)

  expect(name).toBe('whaledot')
  expect(ctx.logger.buffer.at(-1)).toMatchObject({
    name: 'whaledot',
    type: 'info',
    args: ['plugin loaded'],
  })
})

test('initialization errors are recorded without escaping apply', () => {
  const error = new Error('logger unavailable')
  const ctx = {
    logger() {
      throw error
    },
  } as unknown as Context
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => apply(ctx)).not.toThrow()
  expect(report).toHaveBeenCalledWith('[whaledot] failed to load plugin', error)
})
