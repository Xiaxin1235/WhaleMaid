import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { makeScope } from '../tests/fixtures.js'
import {
  reviewCommands,
  ordinaryCommands,
  additionalOrdinaryCommands,
} from '../tests/trusted-review-fixtures.js'
import { checkAction } from './scope.js'

test('capture the actual review matrix without executing any command', () => {
  expect(reviewCommands).toHaveLength(21)
  const probe = (command: string) => ({
    command,
    ...checkAction(makeScope({ commandMode: 'trusted' }), {
      type: 'run-command',
      cmdline: command,
      cwd: 'C:/proj',
    }),
  })
  const result = {
    review: reviewCommands.map(([command]) => probe(command)),
    ordinary: [...ordinaryCommands, ...additionalOrdinaryCommands].map(probe),
  }
  if (process.env.P14F_PROBE_OUTPUT)
    writeFileSync(process.env.P14F_PROBE_OUTPUT, JSON.stringify(result, null, 2) + '\n')
})

test.each(reviewCommands)('review: %s -> %s (%s)', (command, decision, reason) => {
  const actual = checkAction(makeScope({ commandMode: 'trusted' }), {
    type: 'run-command',
    cmdline: command,
    cwd: 'C:/proj',
  })
  expect(actual.decision).toBe(decision)
  expect(actual.reason.split(', ')).toContain(reason)
})

test.each(ordinaryCommands)('ordinary: %s remains allowed', (command) => {
  expect(
    checkAction(makeScope({ commandMode: 'trusted' }), {
      type: 'run-command',
      cmdline: command,
      cwd: 'C:/proj',
    }).decision,
  ).toBe('allow')
})
