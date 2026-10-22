import { expect, test } from 'vitest'
import { toolCallToIntents, RESTRICTED_TOOLS } from './tool-intent.js'
import { deriveRunScope, authorizationOfRun } from './run-scope.js'
import { runEndToTaskState } from './run-outcome.js'
import { buildTaskPrompt } from './task-prompt.js'
import { checkAction } from './scope.js'
import { makeGoal, makeScope, makeTask } from '../tests/fixtures.js'
const cwd = 'C:\\proj'
const calls: [string, unknown, string[]][] = [
  ['read', { file_path: 'a.ts' }, ['read-file']],
  ['read_image', { file_path: 'image.png' }, ['read-file']],
  ['write', { file_path: 'a.ts', content: '' }, ['write-file']],
  ['edit', { file_path: 'a.ts', old_string: 'a', new_string: 'b' }, ['read-file', 'write-file']],
  ['glob', { pattern: '**/*.ts' }, ['read-file']],
  ['grep', { pattern: 'hello', path: 'src', include: '*.ts' }, ['read-file']],
  ['str_replace_editor', { command: 'view', path: 'C:/proj/a.ts' }, ['read-file']],
  ['str_replace_editor', { command: 'create', path: 'C:/proj/b.ts', file_text: '' }, ['write-file']],
  [
    'str_replace_editor',
    { command: 'insert', path: 'C:/proj/a.ts', insert_line: 0, new_str: 'x' },
    ['read-file', 'write-file'],
  ],
  [
    'str_replace_editor',
    { command: 'str_replace', path: 'C:/proj/a.ts', old_str: 'x', new_str: 'y' },
    ['read-file', 'write-file'],
  ],
  [
    'pwsh',
    { description: 'Read file', command: "Get-Content 'C:/outside/.env'" },
    ['run-command', 'read-file'],
  ],
  ['bash', { description: 'Run tests', command: 'pnpm test', timeoutMs: 30000 }, ['run-command']],
  ['web_fetch', { url: 'https://example.com' }, ['network']],
  ['web_search', { queries: ['hello'] }, ['network']],
  ['subagent', { description: 'Analyze', prompt: 'hello' }, ['spawn-subagent']],
  ['subagent_fork', { description: 'Analyze fork', prompt: 'hello', cwd: 'src' }, ['spawn-subagent']],
  [
    'ask_user_question',
    { questions: [{ id: 'a', question: 'Choose?', options: [{ label: 'yes' }], multi_select: false }] },
    [],
  ],
  ['ask_user_question', { questions: [{ id: 'a', header: 'Choose', question: 'Which?' }] }, []],
  ['todo_write', { todos: [{ content: 'a', status: 'pending' }] }, []],
]
test.each(calls)('maps verified %s shape', (name, args, kinds) => {
  const result = toolCallToIntents(name, args, { cwd })
  expect('intents' in result && result.intents.map((intent) => intent.type)).toEqual(kinds)
  expect(toolCallToIntents(name, null, { cwd })).toEqual({ unknown: true })
})
test.each(RESTRICTED_TOOLS)('rejects unrepresentable %s rather than allowing an empty intent', (name) =>
  expect(toolCallToIntents(name, {}, { cwd })).toEqual({ unknown: true }),
)
test('malformed arguments, escalation, background and path aliases fail closed', () => {
  for (const [name, args] of [
    ['mystery', {}],
    ['read', { file_path: 'C:relative' }],
    ['read', { file_path: 'a', extra_path: 'b' }],
    ['pwsh', { description: 'Run tests', command: 'pnpm test', run_in_background: true }],
    ['write', { file_path: 'a', content: 'x', sandbox_permissions: 'require_escalated' }],
    ['str_replace_editor', { command: 'create', path: 'C:/proj/a' }],
  ] as const)
    expect(toolCallToIntents(name, args, { cwd })).toEqual({ unknown: true })
  const r = toolCallToIntents('read', { file_path: 'src/../a.ts' }, { cwd })
  expect(r).toEqual({ intents: [{ type: 'read-file', path: 'c:\\proj\\a.ts' }] })
})
test('read-only literal commands need no exact approval; scripts and dangerous syntax do', () => {
  const scope = makeScope({ verifyCommands: [] })
  expect(checkAction(scope, { type: 'run-command', cmdline: 'git status', cwd }).decision).toBe('allow')
  expect(checkAction(scope, { type: 'run-command', cmdline: 'pnpm test', cwd }).ruleId).toBe(
    'command-not-confirmed',
  )
  expect(
    checkAction(scope, { type: 'run-command', cmdline: 'git status; cat secret', cwd }).decision,
  ).not.toBe('allow')
  expect(checkAction(scope, { type: 'run-command', cmdline: 'git status', cwd: 'C:/outside' }).decision).toBe(
    'deny',
  )
  expect(
    checkAction(makeScope({ permissionPreset: 'read-only' }), {
      type: 'run-command',
      cmdline: 'pnpm test',
      cwd,
    }).decision,
  ).toBe('deny')
})
test('run scope remaps exact project boundaries, drops external paths and narrows analyze/research', () => {
  const scope = makeScope({
    allowedPaths: [cwd, 'C:/other', 'C:/project'],
    protectedPaths: [cwd + '/secrets', cwd + '/.env*', 'C:/else'],
  })
  for (const kind of ['analyze', 'research'] as const) {
    const run = deriveRunScope(scope, cwd, 'D:/worktrees/g', kind)
    expect(run.allowedPaths).toEqual(['d:\\worktrees\\g'])
    expect(run.protectedPaths).toEqual(['d:\\worktrees\\g\\secrets', 'd:\\worktrees\\g\\.env*'])
    expect(run.permissionPreset).toBe('read-only')
    expect(run.allowedActions).not.toContain('write-file')
    expect(run.protectedNames).toEqual(scope.protectedNames)
    expect(run.originScopeHash).toBe(scope.hash)
    expect(
      checkAction(authorizationOfRun(run), { type: 'read-file', path: 'D:/worktrees/g/a' }).decision,
    ).toBe('allow')
  }
  expect(deriveRunScope(scope, cwd, 'D:/worktrees/g', 'edit').permissionPreset).toBe('workspace-write')
})
test.each([
  ['completed', 'VERIFYING'],
  ['error', 'FAILED'],
  ['max-tokens', 'FAILED'],
  ['blocked', 'WAITING_APPROVAL'],
  ['interrupted', 'UNKNOWN'],
  ['aborted', 'UNKNOWN'],
  ['unknown', 'UNKNOWN'],
  ['timeout', 'UNKNOWN'],
  ['forked', 'UNKNOWN'],
])('maps end %s to %s', (endReason, state) => expect(runEndToTaskState({ endReason }).state).toBe(state))
test('disposal/revocation wins over a completed reason; prompt is explicit and localized', () => {
  expect(runEndToTaskState({ endReason: 'completed', endSource: 'session-disposed' }).state).toBe('UNKNOWN')
  expect(runEndToTaskState({ endReason: 'completed', reason: 'scope-revoked' }).state).toBe('UNKNOWN')
  const prompt = buildTaskPrompt(
    makeGoal(),
    makeTask(),
    deriveRunScope(makeScope(), cwd, 'D:/runs/g'),
    'zh-CN',
  )
  for (const text of [
    'git commit',
    'git push',
    'DATA',
    'display-only',
    '总结',
    'protectedNames',
    'pnpm test',
    'immutable authorization',
    'Improve project',
  ])
    expect(prompt).toContain(text)
  expect(prompt).not.toContain('SUCCESS')
})
