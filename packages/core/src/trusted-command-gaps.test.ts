import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { makeScope } from '../tests/fixtures.js'
import { gapCommands, gapCounterCommands, gapScope } from '../tests/trusted-gap-fixtures.js'
import {
  reviewCommands,
  ordinaryCommands,
  additionalOrdinaryCommands,
} from '../tests/trusted-review-fixtures.js'
import { checkAction } from './scope.js'

test('capture P14G decisions without executing the supplied command text', () => {
  expect(gapCommands).toHaveLength(12)
  const probe = (command: string, scope = gapScope()) => ({
    command,
    ...checkAction(scope, { type: 'run-command', cmdline: command, cwd: 'C:/proj' }),
  })
  const originalScope = makeScope({ commandMode: 'trusted' })
  const data = {
    policy: { protectedPaths: gapScope().protectedPaths, protectedNames: gapScope().protectedNames },
    review: gapCommands.map(([command]) => probe(command)),
    counter: gapCounterCommands.map(([command]) => probe(command)),
    defaultProtection: [
      ...gapCommands.slice(-2).map(([command]) => command),
      gapCounterCommands.at(-1)![0],
    ].map((command) => probe(command, originalScope)),
    p14f: reviewCommands.map(([command]) => probe(command, originalScope)),
    p14fOrdinary: [...ordinaryCommands, ...additionalOrdinaryCommands].map((command) =>
      probe(command, originalScope),
    ),
  }
  if (process.env.P14G_PROBE_OUTPUT)
    writeFileSync(process.env.P14G_PROBE_OUTPUT, JSON.stringify(data, null, 2) + '\n')
})

test.each(gapCommands)('P14G: %s -> %s (%s)', (command, decision, reason) => {
  const actual = checkAction(gapScope(), { type: 'run-command', cmdline: command, cwd: 'C:/proj' })
  expect(actual.decision).toBe(decision)
  expect(actual.reason.split(', ')).toContain(reason)
})

test.each(gapCounterCommands)('P14G counter: %s -> %s', (command, decision) => {
  const actual = checkAction(gapScope(), { type: 'run-command', cmdline: command, cwd: 'C:/proj' })
  expect(actual.decision).toBe(decision)
  if (command.startsWith('pnpm install')) expect(actual.reason).toContain('package-install')
})

test.each([
  ['forfiles -c "cmd /c del @file"', 'ask', 'delete'],
  ['forfiles /c "cmd /c del @file"', 'ask', 'dynamic-execution'],
  ['forfiles /c "cmd /c type .env"', 'deny', 'protected-command-path'],
  ['forfiles', 'ask', 'unparsed-command'],
  ['forfiles /c', 'ask', 'unparsed-command'],
  ['forfiles /x unknown /c "cmd /c echo @file"', 'ask', 'unparsed-command'],
  ['Restart-Computer', 'deny', 'system-configuration'],
  ['Stop-Computer', 'deny', 'system-configuration'],
  ['Register-ScheduledTask -TaskName x', 'deny', 'system-configuration'],
  ['Unregister-ScheduledTask -TaskName x', 'deny', 'system-configuration'],
  ['mshta script.hta', 'deny', 'system-configuration'],
  ['schtasks /change /tn x', 'deny', 'system-configuration'],
  ['schtasks /delete /tn x', 'deny', 'system-configuration'],
  ['schtasks /run /tn x', 'deny', 'system-configuration'],
  ['wmic process call create "calc"', 'deny', 'system-configuration'],
  ['wmic process where "name=calc.exe" delete', 'deny', 'system-configuration'],
  ['wmic nicconfig set DNSHostName=x', 'deny', 'system-configuration'],
  ['kill -Id 123', 'ask', 'process-control'],
  ['spps -Id 123', 'ask', 'process-control'],
  ['tskill 123', 'ask', 'process-control'],
  ['taskkill /pid 123 /f', 'ask', 'process-control'],
  ['git checkout -f main', 'ask', 'repository-delete'],
  ['git checkout --force main', 'ask', 'repository-delete'],
  ['git checkout -- src/a.txt', 'ask', 'repository-delete'],
  ['git switch --force main', 'ask', 'repository-delete'],
  ['git switch --discard-changes main', 'ask', 'repository-delete'],
  ['git restore --worktree a.txt', 'ask', 'repository-delete'],
  ['git restore --staged --worktree a.txt', 'ask', 'repository-delete'],
  ['git restore --staged -W a.txt', 'ask', 'repository-delete'],
  ['Remove-Item $_', 'ask', 'unresolved-command-path'],
])('P14G variants: %s', (command, decision, reason) => {
  const actual = checkAction(gapScope(), { type: 'run-command', cmdline: command, cwd: 'C:/proj' })
  expect(actual.decision).toBe(decision)
  expect(`${actual.reason}, ${actual.ruleId}`).toContain(reason)
})

test.each(['npm', 'pnpm', 'yarn'])(
  '%s dependency removal is an install-class mutation, not script inspection',
  (manager) => {
    for (const subcommand of ['uninstall', 'remove', 'rm', 'un']) {
      expect(
        checkAction(gapScope(), {
          type: 'run-command',
          cmdline: `${manager} ${subcommand} lodash`,
          cwd: 'C:/proj',
        }),
      ).toMatchObject({ decision: 'ask', reason: expect.stringContaining('package-install') })
    }
    expect(
      checkAction(gapScope(), { type: 'run-command', cmdline: `${manager} run remove`, cwd: 'C:/proj' })
        .decision,
    ).toBe('allow')
  },
)

test('wildcard protection respects directory boundaries and literal targeting', () => {
  const decide = (command: string, scope = gapScope()) =>
    checkAction(scope, { type: 'run-command', cmdline: command, cwd: 'C:/proj' })
  expect(decide('del /q /s *.tmp')).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('recursive-delete'),
  })
  expect(decide('Get-ChildItem *.log | % { Remove-Item $_ }')).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('delete'),
  })
  for (const command of ['del *.key', 'del .env*', 'del secrets/*.tmp', 'del **/*.tmp'])
    expect(decide(command).decision).toBe('deny')
  // A theoretical intersection with a key prefix alone no longer denies ordinary extensions.
  for (const command of ['del *.tmp', 'Get-ChildItem *.log | % { Remove-Item $_ }'])
    expect(decide(command, makeScope({ commandMode: 'trusted' })).decision).toBe('ask')
  expect(decide('del *.tmp', { ...gapScope(), protectedPaths: ['C:/proj/out.tmp'] }).decision).toBe('deny')
  expect(decide('del **/*.tmp', { ...gapScope(), protectedPaths: ['C:/proj/out.tmp'] }).decision).toBe('deny')
  expect(decide('del out/*.tmp', { ...gapScope(), protectedPaths: ['C:/proj/secrets'] }).decision).toBe('ask')
})

test.each([
  'Get-Process',
  'Get-ScheduledTask',
  'wmic process list brief',
  'wmic os get Caption',
  'git restore --staged a.txt',
])('readonly and index-only counterparts remain allowed: %s', (command) => {
  expect(checkAction(gapScope(), { type: 'run-command', cmdline: command, cwd: 'C:/proj' }).decision).toBe(
    'allow',
  )
})

test('forfiles uses the existing recursive wrapper depth limit', () => {
  const command = `${'env '.repeat(8)}forfiles /c "cmd /c echo @file"`
  expect(checkAction(gapScope(), { type: 'run-command', cmdline: command, cwd: 'C:/proj' })).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('unparsed-command'),
  })
})
