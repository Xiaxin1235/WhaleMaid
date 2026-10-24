import { expect, test } from 'vitest'
import { makeScope } from '../tests/fixtures.js'
import { checkAction } from './scope.js'
import { additionalOrdinaryCommands } from '../tests/trusted-review-fixtures.js'

const decide = (cmdline: string) =>
  checkAction(makeScope({ commandMode: 'trusted' }), { type: 'run-command', cmdline, cwd: 'C:/proj' })
const wrappers = [
  'npx',
  'bunx',
  'pnpm exec',
  'pnpm dlx',
  'npm exec --',
  'yarn dlx',
  'yarn exec',
  'env TEST=value',
  'call',
  'start "" /wait',
]
test.each(wrappers)('unwrap %s recursively without blocking a literal ordinary command', (wrapper) => {
  expect(decide(`${wrapper} rimraf dist`)).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('delete'),
  })
  expect(decide(`${wrapper} node scripts/gen.mjs`).decision).toBe('allow')
})
test.each(['rimraf', 'rimraf@6', 'del-cli', 'trash', 'trash-cli', 'shx rm', 'shx --silent rm'])(
  'deletion utility %s',
  (command) => {
    expect(decide(`npx --yes ${command} dist`)).toMatchObject({
      decision: 'ask',
      reason: expect.stringContaining('delete'),
    })
    expect(decide('npx --yes shx cp src/a.txt out/a.txt').decision).toBe('allow')
  },
)
test.each(['! rm a.txt', '1+1'])('a shell expression is not a literal program: %s', (command) => {
  expect(decide(command)).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('dynamic-invocation'),
  })
})

test.each([
  'npx',
  'npm exec --call "del a.txt"',
  'npx --unknown rimraf dist',
  'env -S "node gen.mjs"',
  'call :label',
  'Start-Process',
  'Start-Process -FilePath node -Verb RunAs',
])('unparsed wrapper %s asks', (command) => {
  expect(decide(command)).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('unparsed-command'),
  })
})
test('nested wrappers share rules, retain system denials, and stop at depth 8', () => {
  expect(decide('env X=1 pnpm exec npx --yes rimraf dist').reason).toContain('delete')
  expect(decide('env npx cmd /c diskpart /s script.txt')).toMatchObject({
    decision: 'deny',
    reason: expect.stringContaining('system-configuration'),
  })
  expect(decide(`${'env '.repeat(8)}node scripts/gen.mjs`).decision).toBe('allow')
  expect(decide(`${'env '.repeat(9)}node scripts/gen.mjs`)).toMatchObject({
    decision: 'ask',
    reason: expect.stringContaining('unparsed-command'),
  })
  expect(decide('Start-Process npm -ArgumentList "install lodash"').reason).toContain('package-install')
})

test.each(['npx type .env', 'cmd /c "type .env"', 'Start-Process cmd -ArgumentList "/c type .env"'])(
  'wrappers do not relax protected paths: %s',
  (command) => {
    expect(decide(command).decision).toBe('deny')
  },
)
test.each([
  ['cmd /c "echo hello world"', 'allow', ''],
  ['cmd /k "del a.txt"', 'ask', 'delete'],
  ['CMD /S /C "echo ok & del a.txt"', 'ask', 'delete'],
  ['cmd /c "echo `"hello world`""', 'allow', ''],
  ['cmd /c "del `"out/a b.txt`""', 'ask', 'delete'],
  ['cmd /c "de^l a.txt"', 'ask', 'delete'],
  ['cmd /c "echo \\"x\\""', 'ask', 'unparsed-command'],
  ['npx "rimraf" "out folder"', 'ask', 'delete'],
  ['Start-Process -FilePath "cmd" -ArgumentList "/c del a.txt"', 'ask', 'delete'],
  ["Start-Process -FilePath cmd -ArgumentList '/c','del','a.txt' -Wait", 'ask', 'delete'],
  ['Start-Process -FilePath node -ArgumentList "scripts/gen.mjs" -Wait', 'allow', ''],
])('wrapper quoting: %s', (command, decision, reason) => {
  const actual = decide(command)
  expect(actual.decision).toBe(decision)
  if (reason) expect(actual.reason).toContain(reason)
})
test.each([
  ['powershell', 'command'],
  ['pwsh', 'command'],
  ['powershell', 'encodedcommand'],
  ['pwsh', 'encodedcommand'],
])('%s recognizes every %s prefix', (shell, parameter) => {
  for (let length = 1; length <= parameter.length; length++) {
    expect(decide(`${shell} -${parameter.slice(0, length)} "Remove-Item a.txt"`)).toMatchObject({
      decision: 'ask',
      reason: expect.stringContaining('dynamic-execution'),
    })
  }
  expect(decide(`${shell} -NoProfile -File scripts/build.ps1`).decision).toBe('allow')
})
test.each([
  ['pwsh -File C:/outside/build.ps1', 'dynamic-execution'],
  ['pwsh -File ../build.ps1', 'dynamic-execution'],
  ['pwsh -Command:Remove-Item a.txt', 'dynamic-execution'],
  ['node -e "1"', 'dynamic-execution'],
  ['node --eval=1', 'dynamic-execution'],
  ['node -p "1"', 'dynamic-execution'],
  ['node --print=1', 'dynamic-execution'],
  ['node -pe "1"', 'dynamic-execution'],
  ['deno eval "1"', 'dynamic-execution'],
  ['python3.13 -c "print(1)"', 'dynamic-execution'],
  ['py -c "print(1)"', 'dynamic-execution'],
  ['perl -e "1"', 'dynamic-execution'],
  ['ruby -e "1"', 'dynamic-execution'],
  ['Invoke-Expression $code', 'dynamic-execution'],
  ['iex $code', 'dynamic-execution'],
  ['Invoke-Command { echo ok }', 'dynamic-execution'],
  ['icm { echo ok }', 'dynamic-execution'],
  ['Add-Type "class X {}"', 'dynamic-execution'],
  ["[IO.File]::Move('a','b')", 'delete'],
  ["[IO.File]::Replace('a','b','c')", 'delete'],
  ["[IO.File]::WriteAllText('out/a','x')", 'write-outside-check'],
  ["[IO.File]::Copy('a','b')", 'write-outside-check'],
  ["[IO.File]::ReadAllText('a')", 'dynamic-execution'],
  ['$tool a.txt', 'dynamic-invocation'],
  ['& $tool a.txt', 'dynamic-invocation'],
  ['. "$tool" a.txt', 'dynamic-invocation'],
  ['& "Remove-Item a.txt"', 'dynamic-invocation'],
  ['(Get-Command Remove-Item) a.txt', 'dynamic-invocation'],
  ['& "Remove-Item" a.txt', 'delete'],
  ['. "Remove-Item" a.txt', 'delete'],
  ['& "Remove-Item"', 'delete'],
  ['robocopy src out /PURGE', 'delete'],
  ['Clear-Item a.txt', 'delete'],
  ['clc a.txt', 'delete'],
  ['cli a.txt', 'delete'],
  ['Set-Content D:/outside/a.txt x', 'outside-command-path'],
  ['Out-File D:/outside/a.txt', 'outside-command-path'],
  ['echo x > D:/outside/a.txt', 'outside-command-path'],
  ['Get-Content $HOME/secret.txt', 'unresolved-command-path'],
  ['Get-Content ${root}/secret.txt', 'unresolved-command-path'],
  ['Get-Content $(Get-Location)/secret.txt', 'unresolved-command-path'],
])('additional rule: %s asks (%s)', (command, reason) => {
  expect(decide(command)).toMatchObject({ decision: 'ask', reason: expect.stringContaining(reason) })
})
test.each(['bash --version', 'sh --version', 'zsh --version', 'wsl --version', 'busybox --help'])(
  '%s remains a nested shell requiring approval',
  (command) => {
    expect(decide(command)).toMatchObject({
      decision: 'ask',
      reason: expect.stringContaining('dynamic-execution'),
    })
    expect(decide('node tools/bash.mjs').decision).toBe('allow')
  },
)
test.each([
  'format D: /q',
  'diskpart /s script.txt',
  'fsutil volume list',
  'bcdedit /enum',
  'cipher /w:out',
  'vssadmin list shadows',
  'wbadmin start backup',
  'takeown /f a.txt',
  'icacls a.txt /grant user:F',
  'icacls a.txt /deny user:W',
  'icacls a.txt /remove:g user',
  'icacls a.txt /setowner user',
  'icacls a.txt /reset',
  'reg add HKCU:/Test',
  'Set-ExecutionPolicy Bypass',
  'Stop-Service example',
  'Set-ItemProperty HKCU:/Test value x',
])('system class remains deny: %s', (command) => {
  expect(decide(command)).toMatchObject({
    decision: 'deny',
    reason: expect.stringContaining('system-configuration'),
  })
})
test.each(additionalOrdinaryCommands)('paired ordinary command remains allowed: %s', (command) =>
  expect(decide(command).decision).toBe('allow'),
)
