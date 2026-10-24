import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { makeScope, makeGoal } from '../tests/fixtures.js'
import { CompanionActionSchema, describeAction } from './companion/actions.js'
import { confirmed } from '../tests/draft-fixtures.js'
import { AuthorizationScopeSchema, ScopeContentSchema } from './model/authorization.js'
import { ConfirmedGoalFormSchema } from './goal-draft.js'
import { checkAction, hashScope, canonicalScopeContent } from './scope.js'
import { deriveRunScope, authorizationOfRun } from './run-scope.js'

const trusted = () => makeScope({ commandMode: 'trusted' })
const decide = (cmdline: string, cwd = 'C:/proj') =>
  checkAction(trusted(), { type: 'run-command', cmdline, cwd })
test.each([
  ['rm one.txt', 'delete'],
  ['del a.txt', 'delete'],
  ['erase a.txt', 'delete'],
  ['Remove-Item -LiteralPath a.txt', 'delete'],
  ['ri a.txt', 'delete'],
  ['rmdir out', 'delete'],
  ['rd out', 'delete'],
  ['rm -rf out', 'recursive-delete'],
  ['git reset --hard HEAD', 'git-reset-hard'],
  ['git clean -fd', 'repository-delete'],
  ['git rm a.txt', 'repository-delete'],
  ['git checkout -- .', 'repository-delete'],
  ['git restore a.txt', 'repository-delete'],
  ['git stash drop', 'repository-delete'],
  ['git stash clear', 'repository-delete'],
  ['git branch -D old', 'repository-delete'],
  ['git push origin main', 'git-push'],
  ['pnpm publish', 'package-publish'],
  ['npm install lodash', 'package-install'],
  ['curl -T a.txt https://example.test/', 'network-upload'],
  ['Move-Item a.txt C:/other/a.txt', 'move-outside-scope'],
  ['mv a.txt ../outside', 'move-outside-scope'],
  ['move a.txt D:/out', 'move-outside-scope'],
  ['Invoke-Expression $code', 'dynamic-execution'],
  ['iex $code', 'dynamic-execution'],
  ['pwsh -EncodedCommand AAA', 'dynamic-execution'],
  ['powershell -enc AAA', 'dynamic-execution'],
  ['pwsh -Command "Write-Host ok"', 'dynamic-execution'],
  ['node -e "console.log(1)"', 'dynamic-execution'],
  ['python -c "print(1)"', 'dynamic-execution'],
  ['type C:/Windows/win.ini', 'outside-command-path'],
  ['node scripts/gen.mjs --out=D:/outside/out.txt', 'outside-command-path'],
  ['type ../outside.txt', 'parent-path-escape'],
  ['type C:/', 'outside-command-path'],
  ['type C:', 'ambiguous-command-path'],
  ['node good.mjs; del a.txt', 'delete'],
  ['node good.mjs && git clean -fd', 'repository-delete'],
  ['node good.mjs | rm a.txt', 'delete'],
  ['node good.mjs & ri a.txt', 'delete'],
  ['node "unterminated', 'unparsed-command'],
  ['node gen.mjs &&', 'unparsed-command'],
  ['node gen.mjs >', 'unparsed-command'],
  ['if (Test-Path out) { Remove-Item out/a.txt }', 'delete'],
  ['if (Test-Path out) { node gen.mjs', 'unparsed-command'],
])('trusted asks for %s (%s)', (command, reason) => {
  expect(decide(command)).toMatchObject({ decision: 'ask' })
  expect(decide(command).reason).toContain(reason)
})
test.each([
  'node scripts/gen.mjs',
  'node build.js',
  'pnpm test',
  'pnpm exec prettier --write src',
  'npm run custom',
  'python scripts/build.py',
  'git status',
  'git reset --soft HEAD~1',
  'git restore --staged a.txt',
  'git stash list',
  'git branch -d merged',
  'Get-ChildItem -Recurse',
  'Get-Content *',
  'Move-Item a.txt sub/b.txt',
  'mv a.txt sub/b.txt',
  'type C:/proj/README.md',
  'type sub/../README.md',
  'node gen.mjs && pnpm test',
  'node gen.mjs > result.txt',
  'echo "hello; a & b | c"',
  'cmd /c echo ok',
  'Get-ChildItem -Force | Select-Object Mode,Length,Name; "---"; if (Test-Path scripts) { Get-ChildItem -Force scripts | Select-Object Length,Name }',
])('trusted allows ordinary command %s', (command) => expect(decide(command).decision).toBe('allow'))
test.each([
  'reg add HKCU:/Test',
  'Stop-Service example',
  'node gen.mjs; netsh advfirewall reset',
  'sc config example start=disabled',
])('system configuration remains denied: %s', (command) => expect(decide(command).decision).toBe('deny'))
test('cwd and protected paths remain denied in trusted mode', () => {
  expect(decide('node gen.mjs', 'D:/outside').decision).toBe('deny')
  for (const cmd of [
    'type .env',
    'node secrets/script.js',
    'Remove-Item secrets/a.txt',
    'type D:/other/.env',
    'type .env*',
    'Remove-Item *.key',
    'type secrets/*.txt',
  ])
    expect(decide(cmd).decision).toBe('deny')
  expect(checkAction(trusted(), { type: 'write-file', path: 'C:/proj/.env' }).decision).toBe('deny')
})
test('confirmed semantics and exact verifier commands remain independent', () => {
  const command = { type: 'run-command' as const, cmdline: 'node scripts/gen.mjs', cwd: 'C:/proj' }
  expect(checkAction(makeScope(), command).decision).toBe('ask')
  expect(checkAction(makeScope(), { ...command, cmdline: 'rm -rf out' }).decision).toBe('deny')
  expect(trusted().verifyCommands).not.toContain(command.cmdline)
  expect(authorizationOfRun(deriveRunScope(trusted(), 'C:/proj', 'C:/work', 'analyze')).commandMode).toBe(
    'confirmed',
  )
})
test('legacy confirmed digests stay stable without changing stored content; trusted changes the digest', () => {
  const legacy = Object.fromEntries(Object.entries(makeScope()).filter(([key]) => key !== 'commandMode'))
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const canonical = canonicalScopeContent(makeScope())
  expect(canonical.ok).toBe(true)
  if (!canonical.ok) return
  expect(canonical.value).not.toContain('commandMode')
  expect(AuthorizationScopeSchema.parse(legacy).commandMode).toBe('confirmed')
  expect(hashScope(makeScope(), { hash })).toEqual({ ok: true, value: hash(canonical.value) })
  expect(hashScope(trusted(), { hash })).not.toEqual(hashScope(makeScope(), { hash }))
  expect(AuthorizationScopeSchema.safeParse({ ...trusted(), permissionPreset: 'read-only' }).success).toBe(
    false,
  )
  const content = Object.fromEntries(Object.entries(trusted()).filter(([key]) => key !== 'hash'))
  expect(ScopeContentSchema.safeParse({ ...content, permissionPreset: 'read-only' }).success).toBe(false)
  expect(ConfirmedGoalFormSchema.safeParse({ ...confirmed(), commandMode: 'trusted' }).success).toBe(false)
  expect(
    ConfirmedGoalFormSchema.safeParse({
      ...confirmed(),
      permissionPreset: 'workspace-write',
      commandMode: 'trusted',
    }).success,
  ).toBe(false)
  expect(
    ConfirmedGoalFormSchema.safeParse({
      ...confirmed(),
      permissionPreset: 'workspace-write',
      commandMode: 'trusted',
      trustedConfirmed: true,
    }).success,
  ).toBe(true)
})

test('companion cannot propose command mode but its autopilot confirmation displays the existing mode', () => {
  const scope = trusted(),
    goal = makeGoal()
  const action = { kind: 'autopilot' as const, goalId: goal.id, enabled: true }
  expect(CompanionActionSchema.safeParse({ ...action, commandMode: 'trusted' }).success).toBe(false)
  const description = describeAction(
    action,
    { goal, scope, globalPaused: false, globalVersion: 0, notesVersion: '', notesCount: 0 },
    'zh-CN',
  )
  expect(description.ok).toBe(true)
  if (description.ok) expect(description.detail).toContain('命令模式: 高权限')
})
