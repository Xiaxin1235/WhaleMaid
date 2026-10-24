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

const defaultScope = makeScope({ commandMode: 'trusted' })
const ordinary = [
  'npx prettier --write "src/*.ts"',
  'npx eslint src/*.js',
  'git add *.md',
  'Get-ChildItem *.log',
  'copy *.txt out',
  'forfiles /m *.txt /c "cmd /c echo @file"',
]
const names = [
  ['*.key', 'deny'],
  ['secret*.key', 'deny'],
  ['.env*', 'deny'],
  ['id_rsa*', 'deny'],
  ['*.ts', 'allow'],
  ['*.md', 'allow'],
  ['*.log', 'allow'],
  ['*.txt', 'allow'],
  ['*', 'allow'],
  ['SECRET*.KEY', 'deny'],
  ['ID_RSA?', 'deny'],
  ['.env?.txt', 'deny'],
  ['.en?', 'deny'],
  ['.en?x', 'allow'],
  ['id_rsa*.txt', 'deny'],
  ['?d_rsa*', 'allow'],
  ['src/*.key', 'deny'],
  ['src/.env*', 'deny'],
] as const
const directories = [
  ['secrets/*', 'C:/proj/secrets', 'deny'],
  ['C:/proj/secrets/*.txt', 'C:/proj/secrets', 'deny'],
  ['secrets/sub/*.txt', 'C:/proj/secrets', 'deny'],
  ['secrets-other/*.txt', 'C:/proj/secrets', 'allow'],
  ['sec*/*', 'C:/proj/secrets', 'deny'],
  ['SEC?ETS/*.txt', 'c:/PROJ/SECRETS', 'deny'],
  ['*/*.txt', 'C:/proj/secrets', 'allow'],
  ['sec?/*.txt', 'C:/proj/secrets', 'allow'],
  ['src/sec*/*.txt', 'C:/proj/other/secrets', 'allow'],
  ['src/**/*.ts', 'C:/proj/src/secrets', 'deny'],
  ['src/**/*.ts', 'C:/proj/secrets', 'allow'],
  ['src/*/*.ts', 'C:/proj/src/secrets', 'allow'],
  ['src/**/*.ts', 'C:/proj/src-other/secrets', 'allow'],
  ['src/**/*.ts', 'D:/proj/src/secrets', 'allow'],
  ['*.tmp', 'C:/proj/out.tmp', 'deny'],
  ['.env*/file.txt', 'C:/proj/.env*', 'deny'],
  ['.env.local/*.txt', 'C:/proj/.env*', 'deny'],
] as const
const deletions = ['del /q /s *.tmp', 'Get-ChildItem *.log | % { Remove-Item $_ }']
const anchors = [
  ['.env*', '.env', 'deny'],
  ['.env*', '.env.*', 'deny'],
  ['*.ts', 'id_rsa*', 'allow'],
  ['*', 'id_rsa*', 'allow'],
  ['sec*.txt', 'secret*', 'deny'],
  ['secret*.txt', 'sec*', 'deny'],
  ['*.key', '*.private.key', 'deny'],
  ['*.private.key', '*.key', 'deny'],
  ['foo*.key', 'secret*.key', 'allow'],
  ['secret*.key', 'secret*.pem', 'allow'],
] as const
const defaultCommands = [
  ...ordinary,
  ...names.map(([pattern]) => `Get-Content ${pattern}`),
  ...directories
    .filter(([, root]) => root === 'C:/proj/secrets')
    .map(([pattern]) => `Get-Content ${pattern}`),
  ...deletions,
  'del *.tmp',
]
const probe = (command: string, scope = defaultScope) => ({
  command,
  ...checkAction(scope, { type: 'run-command', cmdline: command, cwd: 'C:/proj' }),
})

test('capture P14H before/after decisions without executing supplied command text', () => {
  const data = {
    policy: {
      protectedPaths: defaultScope.protectedPaths,
      protectedNames: defaultScope.protectedNames,
    },
    defaults: [...new Set(defaultCommands)].map((command) => probe(command)),
    directories: directories.map(([pattern, root]) => ({
      root,
      ...probe(`Get-Content ${pattern}`, { ...defaultScope, protectedPaths: [root] }),
    })),
    anchors: anchors.map(([pattern, name]) => ({
      name,
      ...probe(`Get-Content ${pattern}`, { ...defaultScope, protectedNames: [name] }),
    })),
    p14f: reviewCommands.map(([command]) => probe(command)),
    p14fOrdinary: [...ordinaryCommands, ...additionalOrdinaryCommands].map((command) => probe(command)),
    p14g: gapCommands.map(([command]) => probe(command, gapScope())),
    p14gCounter: gapCounterCommands.map(([command]) => probe(command, gapScope())),
    confirmed: [...new Set([...defaultCommands, ...reviewCommands.map(([command]) => command)])].map(
      (command) => probe(command, makeScope()),
    ),
  }
  if (process.env.P14H_PROBE_OUTPUT)
    writeFileSync(process.env.P14H_PROBE_OUTPUT, JSON.stringify(data, null, 2) + '\n')
  expect(data.policy.protectedNames).toContain('id_rsa*')
})

test.each(ordinary)('default protection allows ordinary glob: %s', (command) => {
  expect(probe(command).decision).toBe('allow')
})

test.each(names)('default protected names: %s -> %s', (pattern, decision) => {
  expect(probe(`Get-Content ${pattern}`).decision).toBe(decision)
})

test.each(directories)('protected directory: %s against %s -> %s', (pattern, root, decision) => {
  expect(probe(`Get-Content ${pattern}`, { ...defaultScope, protectedPaths: [root] }).decision).toBe(decision)
})

test.each(anchors)('name anchors: %s against %s -> %s', (pattern, name, decision) => {
  expect(probe(`Get-Content ${pattern}`, { ...defaultScope, protectedNames: [name] }).decision).toBe(decision)
})

test.each(deletions)('default protection preserves deletion approval: %s', (command) => {
  const actual = probe(command)
  expect(actual.decision).toBe('ask')
  expect(actual.reason.split(', ')).toContain('delete')
  if (command.startsWith('del ')) expect(actual.reason.split(', ')).toContain('recursive-delete')
  else expect(actual.reason.split(', ')).toContain('unresolved-command-path')
})
