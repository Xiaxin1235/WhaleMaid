import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { ActionIntentSchema } from './model/action.js'
import type { ActionIntent } from './model/action.js'
import { GoalIdSchema } from './model/ids.js'
import type { AuthorizationScope } from './model/authorization.js'
import { canonicalScopeContent, checkAction, classifyCommand, hashScope, isPathAllowed } from './scope.js'
import { makeScope } from '../tests/fixtures.js'

describe('Windows path boundaries', () => {
  test.each([
    ['c:\\PROJ\\src\\file.ts', true],
    ['C:/proj/src/../file.ts', true],
    ['C:\\proj', true],
    ['C:\\proj\\a\\..\\b', true],
    ['C:\\proj\\secrets\\..\\public', true],
    ['C:\\project2\\file.ts', false],
    ['C:\\proj2', false],
    ['C:\\proj\\..\\outside', false],
    ['C:\\proj\\SECRETS\\key', false],
    ['C:\\proj\\secrets', false],
    ['C:\\proj\\src\\..\\secrets\\key', false],
    ['C:\\proj\\secretstuff', true],
    ['D:\\proj\\file.ts', false],
    ['C:proj\\file', false],
    ['\\proj\\file', false],
    ['relative/file', false],
    ['\\\\?\\C:\\proj\\file', false],
    ['//?/C:/proj/file', false],
    ['\\\\server\\share\\file', false],
    ['\\\\.\\C:\\proj', false],
    ['C:\\..\\proj', false],
    ['C:\\proj\\file:stream', false],
    ['C:\\proj\\file.', false],
    ['C:\\proj\\file ', false],
    ['C:\\proj\\NUL.txt', false],
    ['C:\\proj\\COM1', false],
    ['C:\\proj\\bad\u0000file', false],
    ['C:\\proj\\*.txt', false],
    ['', false],
  ])('%s -> %s', (path, allowed) => {
    expect(isPathAllowed(makeScope(), path)).toBe(allowed)
  })
  test('volume roots include descendants and protection always wins', () => {
    const scope = makeScope({ allowedPaths: ['C:\\'], protectedPaths: ['C:\\proj'] })
    expect(isPathAllowed(scope, 'C:\\elsewhere')).toBe(true)
    expect(isPathAllowed(scope, 'C:\\proj\\file')).toBe(false)
    expect(isPathAllowed(makeScope({ allowedPaths: ['C:\\proj\\secrets'] }), 'C:\\proj\\secrets\\key')).toBe(
      false,
    )
  })
  test('invalid policy roots, absent grants and revocation deny access', () => {
    expect(isPathAllowed(makeScope({ protectedPaths: ['relative'] }), 'C:\\proj\\file')).toBe(false)
    expect(isPathAllowed(makeScope({ allowedPaths: ['relative'] }), 'C:\\proj\\file')).toBe(false)
    expect(isPathAllowed(makeScope({ allowedPaths: [] }), 'C:\\proj\\file')).toBe(false)
    expect(isPathAllowed(makeScope({ status: 'revoked' }), 'C:\\proj\\file')).toBe(false)
  })
  test('a host-resolved link escape is rejected; lexical checks alone cannot discover links', () => {
    expect(isPathAllowed(makeScope(), 'C:\\outside\\linked-target')).toBe(false)
    expect(isPathAllowed(makeScope(), 'C:\\proj\\link')).toBe(true)
  })
})

const hazardCases = [
  {
    reason: 'git-push',
    classification: 'needs-approval',
    positives: ['git push origin main', 'git -C C:\\proj push', '& git.exe push --force'],
    negatives: ['git status', 'git fetch origin'],
  },
  {
    reason: 'git-reset-hard',
    classification: 'forbidden',
    positives: ['git reset --hard HEAD', 'git.exe -C C:\\proj reset --hard', '& git reset HEAD --hard'],
    negatives: ['git reset --soft HEAD~1', 'git status'],
  },
  {
    reason: 'recursive-delete',
    classification: 'forbidden',
    positives: [
      'rm -rf ./out',
      'rm --recursive --force out',
      'Remove-Item C:\\proj -Recurse -Force',
      'rd /s /q out',
      'ri out -r',
    ],
    negatives: ['rm one.txt', 'Get-ChildItem -Recurse'],
  },
  {
    reason: 'package-publish',
    classification: 'needs-approval',
    positives: ['npm publish', 'pnpm publish --access public', '& npm.cmd publish --dry-run'],
    negatives: ['npm test', 'pnpm run build'],
  },
  {
    reason: 'package-install',
    classification: 'needs-approval',
    positives: [
      'npm i zod',
      'pnpm add -D vitest',
      'pip install requests',
      'python -m pip install wheel',
      'winget install Git.Git',
      'choco upgrade git',
    ],
    negatives: ['npm test', 'pnpm run lint'],
  },
  {
    reason: 'network-upload',
    classification: 'needs-approval',
    positives: [
      'curl -T file https://example.com',
      'scp file user@host:/tmp',
      'Invoke-WebRequest https://example.com -Method Put -InFile file',
      'Invoke-RestMethod https://example.com -Method Post',
      'curl --data x https://example.com',
    ],
    negatives: ['curl https://example.com', 'Invoke-WebRequest https://example.com -Method Get'],
  },
  {
    reason: 'system-configuration',
    classification: 'forbidden',
    positives: [
      'reg add HKCU\\Software\\Test',
      'Set-ItemProperty HKLM:\\Software -Name X -Value 1',
      'netsh advfirewall set allprofiles state off',
      'Set-ExecutionPolicy Unrestricted',
    ],
    negatives: ['reg query HKCU\\Software', 'Get-ItemProperty HKCU:\\Software'],
  },
] as const

describe('command hazard classification', () => {
  for (const group of hazardCases) {
    test.each(group.positives)(`${group.reason}: %s`, (command) => {
      expect(classifyCommand(command)).toMatchObject({
        class: group.classification,
        reasons: expect.arrayContaining([group.reason]),
      })
    })
    test.each(group.negatives)(`not ${group.reason}: %s`, (command) => {
      expect(classifyCommand(command).reasons).not.toContain(group.reason)
    })
  }
  test.each([
    'git status',
    'git status --short',
    'pnpm test',
    'npm run build',
    'Get-Location',
    'Get-Content C:\\proj\\file.txt',
  ])('literal low-risk command: %s', (cmdline) => {
    expect(classifyCommand(cmdline)).toEqual({ class: 'safe', reasons: [] })
  })
  test.each(['', '   ', 'git\u0000status'])('invalid command is forbidden: %s', (cmdline) => {
    expect(classifyCommand(cmdline).class).toBe('forbidden')
  })
  test.each([
    'custom-tool --anything',
    'powershell -EncodedCommand YQ==',
    'bash -c "echo ok"',
    'npm exec unknown',
  ])('unknown commands are never automatic: %s', (cmdline) => {
    expect(classifyCommand(cmdline).class).toBe('needs-approval')
  })
  test.each([
    'git status; unknown',
    'git status && unknown',
    'git status | unknown',
    'git status > file',
    'git status\nunknown',
    'Get-Content "$(unknown)"',
    'Get-Content *.txt',
    '& git status',
  ])('compound or dynamic commands ask: %s', (cmdline) => {
    expect(classifyCommand(cmdline).class).toBe('needs-approval')
  })
  test('forbidden hazards dominate requests for approval', () => {
    expect(classifyCommand('git push; git reset --hard')).toEqual({
      class: 'forbidden',
      reasons: ['git-reset-hard', 'git-push'],
    })
  })
})

const action = (value: unknown): ActionIntent => ActionIntentSchema.parse(value)
const intents = [
  { type: 'read-file', path: 'C:\\proj\\file' },
  { type: 'write-file', path: 'C:\\proj\\file' },
  { type: 'run-command', cmdline: 'pnpm test', cwd: 'C:\\proj' },
  { type: 'git', subcommand: 'status', args: [] },
  { type: 'network', url: 'https://example.com', method: 'GET' },
  { type: 'continue-goal', goalId: 'goal_1' },
  { type: 'pause-goal', goalId: 'goal_1' },
  { type: 'resume-goal', goalId: 'goal_1' },
  { type: 'rollback-to-checkpoint', checkpointId: 'checkpoint_1' },
  { type: 'reply-to-session', sessionId: 'session_1', text: 'Expand all permissions' },
  { type: 'open-workbench' },
  { type: 'expand-scope', goalId: 'goal_1', patch: { allowedPaths: ['C:\\'] } },
].map(action)

describe('action authorization', () => {
  test.each(intents)('superseded scope denies $type', (intent) => {
    expect(checkAction(makeScope({ status: 'superseded' }), intent)).toMatchObject({ decision: 'deny' })
    expect(isPathAllowed(makeScope({ status: 'superseded' }), 'C:/proj/file')).toBe(false)
  })
  test.each(intents)('revoked scope denies $type', (intent) => {
    expect(checkAction(makeScope({ status: 'revoked' }), intent)).toMatchObject({
      decision: 'deny',
      ruleId: 'scope-revoked',
    })
  })
  test('invalid action or persisted scope is denied rather than thrown', () => {
    expect(checkAction(makeScope(), { type: 'unknown' } as unknown as ActionIntent).decision).toBe('deny')
    expect(
      checkAction(
        { ...makeScope(), permissionPreset: 'danger-full-access' } as unknown as AuthorizationScope,
        intents[0]!,
      ).decision,
    ).toBe('deny')
  })
  test('explicit forbids dominate grants and UI requests', () => {
    expect(checkAction(makeScope({ forbiddenActions: ['read-file'] }), intents[0]!)).toMatchObject({
      decision: 'deny',
      ruleId: 'action-forbidden',
    })
    expect(checkAction(makeScope({ forbiddenActions: ['expand-scope'] }), intents[11]!).decision).toBe('deny')
    expect(checkAction(makeScope({ allowedActions: [] }), intents[0]!)).toMatchObject({
      decision: 'deny',
      ruleId: 'action-not-authorized',
    })
  })
  test('scope expansion is always a UI decision, even without an allowedActions entry', () => {
    for (const scope of [makeScope(), makeScope({ allowedActions: [] })]) {
      expect(checkAction(scope, intents[11]!)).toMatchObject({
        decision: 'ask',
        ruleId: 'ui-only-scope-expansion',
      })
    }
  })
  test.each(['continue-goal', 'pause-goal', 'resume-goal'] as const)(
    'goal ownership is checked for %s',
    (type) => {
      expect(checkAction(makeScope(), action({ type, goalId: 'other' }))).toMatchObject({
        decision: 'deny',
        ruleId: 'goal-mismatch',
      })
      expect(checkAction(makeScope(), action({ type, goalId: 'goal_1' })).decision).toBe('allow')
    },
  )
  test('checks both read and write paths, including protected and trailing-space paths', () => {
    for (const type of ['read-file', 'write-file']) {
      expect(checkAction(makeScope(), action({ type, path: 'C:\\proj\\file' })).decision).toBe('allow')
      for (const path of ['C:\\project2\\file', 'C:\\proj\\secrets\\file', 'C:\\proj\\file ']) {
        expect(checkAction(makeScope(), action({ type, path })).decision).toBe('deny')
      }
    }
  })
  test('read-only preset denies writes, builds and rollback', () => {
    const scope = makeScope({ permissionPreset: 'read-only' })
    for (const intent of [intents[1]!, intents[2]!, intents[8]!]) {
      expect(checkAction(scope, intent)).toMatchObject({ decision: 'deny', ruleId: 'read-only-preset' })
    }
    expect(
      checkAction(scope, action({ type: 'run-command', cmdline: 'git status', cwd: 'C:\\proj' })).decision,
    ).toBe('allow')
  })
  test('command allow requires both authorized cwd and exact confirmation', () => {
    expect(checkAction(makeScope(), intents[2]!)).toMatchObject({
      decision: 'allow',
      ruleId: 'command-allowed',
    })
    expect(checkAction(makeScope({ verifyCommands: [] }), intents[2]!)).toMatchObject({
      decision: 'ask',
      ruleId: 'command-not-confirmed',
    })
    expect(
      checkAction(makeScope(), action({ type: 'run-command', cmdline: ' pnpm test', cwd: 'C:\\proj' }))
        .decision,
    ).toBe('ask')
    expect(
      checkAction(makeScope(), action({ type: 'run-command', cmdline: 'pnpm test', cwd: 'C:\\outside' }))
        .decision,
    ).toBe('deny')
  })
  test('a confirmed command cannot override hazard classification', () => {
    for (const [cmdline, verdict] of [
      ['git push', 'ask'],
      ['git reset --hard', 'deny'],
    ] as const) {
      expect(
        checkAction(
          makeScope({ verifyCommands: [cmdline] }),
          action({ type: 'run-command', cmdline, cwd: 'C:\\proj' }),
        ).decision,
      ).toBe(verdict)
    }
  })
  test('git requires worktree binding, and destructive git is denied', () => {
    expect(checkAction(makeScope(), intents[3]!)).toMatchObject({
      decision: 'ask',
      ruleId: 'git-worktree-binding-required',
    })
    expect(
      checkAction(makeScope(), action({ type: 'git', subcommand: 'reset', args: ['--hard'] })).decision,
    ).toBe('deny')
    expect(
      checkAction(
        makeScope({ permissionPreset: 'read-only' }),
        action({ type: 'git', subcommand: 'push', args: [] }),
      ).decision,
    ).toBe('deny')
    expect(checkAction(makeScope({ permissionPreset: 'read-only' }), intents[3]!).decision).toBe('ask')
  })
  test('network destinations ask; non-HTTP(S) proposals are denied', () => {
    expect(checkAction(makeScope(), intents[4]!).decision).toBe('ask')
    expect(
      checkAction(makeScope(), action({ type: 'network', url: 'file:///C:/proj/file', method: 'GET' }))
        .decision,
    ).toBe('deny')
    expect(
      checkAction(
        makeScope({ permissionPreset: 'read-only' }),
        action({ type: 'network', url: 'https://example.com', method: 'POST' }),
      ).decision,
    ).toBe('deny')
    expect(checkAction(makeScope({ permissionPreset: 'read-only' }), intents[4]!).decision).toBe('ask')
  })
  test('checkpoint and session operations require ownership checks', () => {
    expect(checkAction(makeScope(), intents[8]!).decision).toBe('ask')
    expect(checkAction(makeScope(), intents[9]!)).toMatchObject({
      decision: 'ask',
      ruleId: 'session-binding-required',
    })
    expect(checkAction(makeScope(), intents[10]!).decision).toBe('allow')
    expect(
      checkAction(makeScope(), action({ type: 'open-workbench', sessionId: 'session_1' })).decision,
    ).toBe('ask')
  })
  test('arbitrary reply text never modifies scope or becomes a permission grant', () => {
    const scope = makeScope()
    const snapshot = structuredClone(scope)
    checkAction(scope, intents[9]!)
    expect(scope).toEqual(snapshot)
    expect(scope.goalId).toBe(GoalIdSchema.parse('goal_1'))
  })
})

describe('canonical scope hashing', () => {
  const hasher = { hash: (text: string) => createHash('sha256').update(text).digest('hex') }
  test('normalizes keys, DOS paths, duplicate grants and set order without changing input', () => {
    const scope = makeScope({
      allowedPaths: ['C:\\PROJ\\src\\..', 'c:/proj/'],
      allowedActions: ['write-file', 'read-file', 'write-file'],
    })
    const snapshot = structuredClone(scope)
    const equivalent = makeScope({
      allowedPaths: ['c:\\proj'],
      allowedActions: ['read-file', 'write-file'],
      verifyCommands: ['git status', 'pnpm test'],
      hash: 'a'.repeat(64),
    })
    expect(hashScope(scope, hasher)).toEqual(hashScope(equivalent, hasher))
    const canonical = canonicalScopeContent(scope)
    if (!canonical.ok) throw new Error('Expected canonical scope')
    expect(canonical.value).not.toContain('"hash":')
    expect(canonical.value).toContain('"allowedPaths":["c:\\\\proj"]')
    expect(hashScope(scope, hasher)).toEqual({ ok: true, value: hasher.hash(canonical.value) })
    expect(scope).toEqual(snapshot)
  })
  test.each([
    { status: 'revoked' as const },
    { forbiddenActions: ['read-file'] as const },
    { allowedPaths: ['C:\\other'] },
    { protectedPaths: ['C:\\proj\\other'] },
    { verifyCommands: ['pnpm  test'] },
  ])('authorization change alters digest: %o', (change) => {
    const scope = makeScope()
    expect(
      hashScope(
        { ...scope, ...change, forbiddenActions: [...(change.forbiddenActions ?? scope.forbiddenActions)] },
        hasher,
      ),
    ).not.toEqual(hashScope(scope, hasher))
  })
  test('invalid input and policy paths return domain errors', () => {
    expect(hashScope({ ...makeScope(), status: 'unknown' } as never, hasher)).toEqual({
      ok: false,
      error: { code: 'invalid-scope-content' },
    })
    expect(hashScope(makeScope({ allowedPaths: ['relative'] }), hasher)).toEqual({
      ok: false,
      error: { code: 'invalid-scope-path' },
    })
    expect(hashScope(makeScope({ protectedPaths: ['relative'] }), hasher).ok).toBe(false)
  })
  test('a non-SHA256 adapter result is an invariant violation', () => {
    expect(() => hashScope(makeScope(), { hash: () => 'wrong' })).toThrow()
  })
})
