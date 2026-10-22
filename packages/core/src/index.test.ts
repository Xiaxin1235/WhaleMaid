import { expect, test } from 'vitest'

test('core scaffold entry can be imported', async () => {
  await expect(import('./index.js')).resolves.toBeDefined()
})
