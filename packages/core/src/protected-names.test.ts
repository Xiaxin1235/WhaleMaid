import { expect, test } from 'vitest'
import { isPathAllowed, hashScope } from './scope.js'
import { ConfirmedGoalFormSchema } from './goal-draft.js'
import { confirmed } from '../tests/draft-fixtures.js'
import { makeScope } from '../tests/fixtures.js'
test.each([
  'packages/api/.env',
  'x/.ENV.prod',
  'x/cert.PEM',
  'x/private.key',
  'x/id_rsa.pub',
  'x/id_ed25519',
  'x/.npmrc',
  'x/.pypirc',
  'x/.env/child',
])('protects nested secret %s', (path) => {
  expect(isPathAllowed(makeScope(), 'C:/proj/' + path)).toBe(false)
})
test('names are hashed as a case-insensitive set and do not match substrings', () => {
  const scope = makeScope()
  const hasher = { hash: (value: string) => (value.includes('token') ? '1'.repeat(64) : '0'.repeat(64)) }
  expect(hashScope({ ...scope, protectedNames: ['TOKEN', 'token'] }, hasher)).toEqual(
    hashScope({ ...scope, protectedNames: ['token'] }, hasher),
  )
  expect(hashScope({ ...scope, protectedNames: ['token'] }, hasher)).not.toEqual(
    hashScope({ ...scope, protectedNames: [] }, hasher),
  )
  expect(isPathAllowed(scope, 'C:/proj/x/safe.env')).toBe(true)
  expect(isPathAllowed({ ...scope, protectedNames: ['secret*'] }, 'C:/proj/SecretFolder/file')).toBe(false)
})
test('confirmation cannot remove defaults or use path patterns', () => {
  expect(ConfirmedGoalFormSchema.safeParse({ ...confirmed(), protectedNames: [] }).success).toBe(false)
  expect(ConfirmedGoalFormSchema.safeParse({ ...confirmed(), protectedNames: ['../secret'] }).success).toBe(
    false,
  )
  expect(
    ConfirmedGoalFormSchema.safeParse({
      ...confirmed(),
      protectedNames: [...confirmed().protectedNames, 'token*'],
    }).success,
  ).toBe(true)
})
