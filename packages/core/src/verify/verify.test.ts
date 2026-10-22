import { expect, test } from 'vitest'
import { parseCommandResult } from './parse.js'
import type { CommandResult } from './parse.js'
import { judge, acceptanceTampered } from './judge.js'
import type { JudgeInput, Judgment } from './judge.js'
import { decideNext } from './decide.js'
import { DEFAULT_LIMITS } from '../model/limits.js'

const result = (status: CommandResult['status'], passed = 2, failed = 0): CommandResult => ({
  command: 'pnpm test',
  exitCode: status === 'passed' ? 0 : 1,
  status,
  counts: { passed, failed, skipped: 0 },
})
const input = (patch: Partial<JudgeInput> = {}): JudgeInput => ({
  kind: 'edit',
  endReason: 'completed',
  deniedCalls: 0,
  changedFiles: [{ path: 'src/a.ts' }],
  verifyCommands: ['pnpm test'],
  baseline: [result('failed', 1, 1)],
  current: [result('passed')],
  finalReplyNonempty: false,
  ...patch,
})
test.each([
  ['vitest', ' Tests  12 passed | 2 failed | 1 skipped (15)', { passed: 12, failed: 2, skipped: 1 }],
  ['jest', 'Tests:       2 failed, 12 passed, 14 total', { passed: 12, failed: 2, skipped: 0 }],
  [
    'pytest',
    '================ 2 failed, 12 passed, 1 skipped in 1.2s ================',
    { passed: 12, failed: 2, skipped: 1 },
  ],
  ['mocha', '  12 passing (2s)\n  2 failing\n  1 pending', { passed: 12, failed: 2, skipped: 1 }],
  ['unknown', '12 tests look good; failed 2?', undefined],
])('%s summary fixture', (_name, stdout, counts) => {
  expect(
    parseCommandResult({ command: 'test', exitCode: 1, timedOut: false, stdout, stderr: '' }).counts,
  ).toEqual(counts)
})
test.each([
  [0, false, false, null, 'passed'],
  [1, false, false, null, 'failed'],
  [null, false, true, null, 'error'],
  [null, false, false, 'SIGTERM', 'error'],
  [null, true, false, 'SIGKILL', 'timeout'],
] as const)('process status %s/%s/%s/%s', (exitCode, timedOut, spawnError, signal, status) => {
  expect(
    parseCommandResult({ command: 'x', exitCode, timedOut, spawnError, signal, stdout: '', stderr: '' })
      .status,
  ).toBe(status)
})
test.each(['error', 'timeout'] as const)('%s is UNKNOWN on either side', (status) => {
  expect(judge(input({ baseline: [result(status)] })).verdict).toBe('UNKNOWN')
  expect(judge(input({ current: [result(status)] })).verdict).toBe('UNKNOWN')
})
test('missing or mismatched evidence is UNKNOWN', () => {
  const missing = input()
  delete missing.baseline
  expect(judge(missing).verdict).toBe('UNKNOWN')
  expect(judge(input({ current: [] })).verdict).toBe('UNKNOWN')
  expect(judge(input({ verifyCommands: ['other'] })).verdict).toBe('UNKNOWN')
})
test.each(['analyze', 'research'] as const)('%s has explicit report-only acceptance', (kind) => {
  expect(judge(input({ kind, changedFiles: [] })).verdict).toBe('INSUFFICIENT_EVIDENCE')
  expect(judge(input({ kind, changedFiles: [], finalReplyNonempty: true }))).toMatchObject({
    verdict: 'PASS',
    reasons: ['report-only'],
  })
  expect(judge(input({ kind, finalReplyNonempty: true })).verdict).toBe('FAIL')
})
test.each(['edit', 'test', 'doc'] as const)('%s needs commands and changes', (kind) => {
  expect(judge(input({ kind, verifyCommands: [] })).verdict).toBe('NOT_SCORABLE')
  expect(judge(input({ kind, changedFiles: [] })).verdict).toBe('INSUFFICIENT_EVIDENCE')
})
test.each([
  [result('passed'), result('failed', 1, 1)],
  [result('failed', 1, 1), result('failed', 0, 2)],
  [result('failed', 2, 1), result('passed', 2, 0)],
])('regression includes reduced denominator', (before, after) => {
  expect(judge(input({ baseline: [before], current: [after] }))).toMatchObject({
    verdict: 'FAIL',
    progress: 'regressed',
  })
})
test('partial improvement passes; unchanged failures fail; all passing unchanged passes', () => {
  expect(
    judge(input({ baseline: [result('failed', 1, 2)], current: [result('failed', 2, 1)] })),
  ).toMatchObject({ verdict: 'PASS', progress: 'improved' })
  expect(judge(input({ current: [result('failed', 1, 1)] }))).toMatchObject({
    verdict: 'FAIL',
    progress: 'unchanged',
  })
  expect(judge(input({ baseline: [result('passed')], deniedCalls: 3 }))).toMatchObject({
    verdict: 'PASS',
    progress: 'unchanged',
    reasons: expect.arrayContaining(['denied-actions:3']),
  })
})
test.each(['test/a.py', 'tests/test_x.py', 'a.test.ts', 'a.spec.js', '__tests__/a.js'])(
  'deleted test detected: %s',
  (path) => {
    expect(judge(input({ changedFiles: [{ path, deleted: true }] })).reasons).toContain(
      'acceptance-tampering',
    )
  },
)
test.each(['it.skip(', 'test.only (', 'xit(', 'xdescribe(', '@pytest.mark.skip', 'pytest.skip('])(
  'added skip/focus is tampering: %s',
  (addedLines) => {
    expect(acceptanceTampered([{ path: 'a.py', addedLines }], [])).toBe(true)
  },
)
test.each(['vitest.config.ts', 'jest.config.js', 'pytest.ini', 'conftest.py', 'pyproject.toml'])(
  'acceptance config %s',
  (path) => {
    expect(acceptanceTampered([{ path, after: 'pytest' }], [])).toBe(true)
  },
)
test('only used scripts and transitive script changes are tampering', () => {
  const before = JSON.stringify({ scripts: { test: 'pnpm run unit', unit: 'vitest run', build: 'tsc' } })
  expect(
    acceptanceTampered(
      [{ path: 'package.json', before, after: before.replace('vitest run', 'echo pass') }],
      ['pnpm test'],
    ),
  ).toBe(true)
  expect(
    acceptanceTampered(
      [{ path: 'package.json', before, after: before.replace('tsc', 'tsc -b') }],
      ['pnpm test'],
    ),
  ).toBe(false)
})
const decision = (
  verdict: Judgment['verdict'],
  progress: Judgment['progress'] = 'unchanged',
  patch: Partial<Parameters<typeof decideNext>[0]> = {},
) =>
  decideNext({
    judgment: { verdict, progress, reasons: ['reason'] },
    attempts: 0,
    stalled: 0,
    tampered: false,
    limits: DEFAULT_LIMITS,
    ...patch,
  })
test('every next-decision branch and stall accounting', () => {
  expect(decision('PASS', 'improved', { stalled: 2 })).toMatchObject({
    taskOutcome: 'succeed',
    goalProgress: 0,
  })
  expect(decision('PASS')).toMatchObject({ taskOutcome: 'succeed', goalProgress: 1 })
  expect(decision('FAIL', 'unchanged', { stalled: 1 })).toMatchObject({
    taskOutcome: 'retry',
    attempts: 1,
    goalProgress: 1,
    failureSummary: 'reason',
  })
  expect(decision('FAIL', 'regressed').taskOutcome).toBe('rollback-and-retry')
  expect(decision('FAIL', 'regressed', { attempts: 2 }).reason).toBe('fix-rounds-exhausted')
  expect(decision('FAIL', 'regressed', { tampered: true })).toMatchObject({
    taskOutcome: 'ask-user',
    reason: 'tampering',
    attempts: 0,
  })
  expect(decision('NOT_SCORABLE').reason).toBe('not-scorable')
  expect(decision('INSUFFICIENT_EVIDENCE').reason).toBe('insufficient-evidence')
  expect(decision('UNKNOWN').taskOutcome).toBe('reconcile')
  expect(decision('PASS', 'unchanged', { stalled: 2 })).toMatchObject({
    taskOutcome: 'succeed',
    goalAction: 'pause',
    goalProgress: 3,
  })
})

test('neutral progress does not add or clear stalls; two unknown verifications require an owner', () => {
  expect(decision('PASS', 'neutral', { stalled: 2 })).toMatchObject({
    taskOutcome: 'succeed',
    goalAction: 'continue',
    goalProgress: 2,
  })
  expect(decision('UNKNOWN', 'unknown', { unknownVerifications: 1 })).toMatchObject({
    taskOutcome: 'ask-user',
    reason: 'verification-unknown',
    unknownVerifications: 2,
  })
  expect(decision('FAIL', 'unchanged', { unknownVerifications: 1 })).toMatchObject({
    unknownVerifications: 0,
  })
  expect(judge(input({ kind: 'doc', baseline: [result('passed')] }))).toMatchObject({
    verdict: 'PASS',
    progress: 'neutral',
  })
})
