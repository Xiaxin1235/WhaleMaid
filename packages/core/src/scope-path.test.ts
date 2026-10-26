import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { makeScope } from '../tests/fixtures.js'
import { normalizeScopePath, resolveScopePath } from './scope-path.js'
import { canonicalScopeContent, checkAction, hashScope, isPathAllowed } from './scope.js'
import { deriveRunScope } from './run-scope.js'
import { toolCallToIntents } from './tool-intent.js'
import { readOnlyCommandPaths } from './read-only-command.js'
import { ProjectKeySchema } from './memory/index.js'

const posix = () =>
  makeScope({ allowedPaths: ['/project'], protectedPaths: ['/project/secrets', '/project/.env*'] })
test('the existing Windows authorization digest is unchanged', () => {
  // Frozen from the pre-port implementation, whose scope/model files match f7faa53.
  expect(
    hashScope(makeScope(), { hash: (value) => createHash('sha256').update(value).digest('hex') }),
  ).toEqual({ ok: true, value: '91ecdeebf5c0bdf03a99dabb6351b088b2b7dd81c9779c2c0a19ca9fc3176b03' })
})
test.each([
  ['/project/src/file.ts', true],
  ['/project/a/../file', true],
  ['/project', true],
  ['/project-evil/file', false],
  ['/project/../outside', false],
  ['/Project/file', false],
  ['/project/secrets/file', false],
  ['/project/SECRETS/file', false],
  ['/project/.env.local', false],
  ['/project/nested/id_rsa-backup', false],
  ['//project/file', false],
  ['/project/a\\..\\outside', false],
  ['C:\\project\\file', false],
])('POSIX authorization boundary %s -> %s', (path, allowed) => {
  expect(isPathAllowed(posix(), path)).toBe(allowed)
})
test('POSIX normalization preserves case and cannot cross the filesystem root or path dialect', () => {
  expect(normalizeScopePath('/Project/a/../src/')).toBe('/Project/src')
  expect(normalizeScopePath('/')).toBe('/')
  for (const path of ['/../etc', '//server/share', '/project/a\u0000b', '/project/*.key', '\\server\\share'])
    expect(normalizeScopePath(path)).toBeNull()
  expect(resolveScopePath('/project', '../outside')).toBe('/outside')
  expect(resolveScopePath('/project', '/project/a')).toBe('/project/a')
  for (const path of ['C:\\project', '~/secret', 'a\\..\\secret'])
    expect(resolveScopePath('/project', path)).toBeNull()
  expect(resolveScopePath('C:\\project', '/etc/passwd')).toBeNull()
  expect(canonicalScopeContent(makeScope({ allowedPaths: ['/project'] })).ok).toBe(false)
  expect(isPathAllowed(makeScope({ allowedPaths: ['/project'] }), '/project/file')).toBe(false)
  expect(ProjectKeySchema.parse('/Project/a/../')).toBe('/Project')
})
test('POSIX worktree authorization remaps only project descendants and retains origin identity', () => {
  const run = deriveRunScope(posix(), '/project', '/storage/goal')
  expect(run.allowedPaths).toEqual(['/storage/goal'])
  expect(run.protectedPaths).toEqual(['/storage/goal/secrets', '/storage/goal/.env*'])
  expect(run.originScopeHash).toBe(posix().hash)
  expect(() => deriveRunScope(posix(), '/project', 'C:\\other')).toThrow('invalid-run-root')
})
test('file tools and literal read commands use POSIX scope, without tilde, glob or mixed-dialect expansion', () => {
  expect(toolCallToIntents('read', { file_path: 'src/a.ts' }, { cwd: '/project' })).toEqual({
    intents: [{ type: 'read-file', path: '/project/src/a.ts' }],
  })
  expect(readOnlyCommandPaths('cat /project/a.ts', '/project')).toEqual({ paths: ['/project/a.ts'] })
  for (const cmd of ['cat ~/private', 'cat *.key', 'CAT README.md', 'cat "a\\b"'])
    expect(readOnlyCommandPaths(cmd, '/project')).toEqual({ unparsable: true })
  expect(
    checkAction(
      { ...posix(), permissionPreset: 'read-only' },
      { type: 'run-command', cwd: '/project', cmdline: 'cat /etc/passwd' },
    ).decision,
  ).toBe('deny')
})
test.each([
  ['pnpm test', 'allow'],
  ['rm generated.txt', 'ask'],
  ['cat /etc/passwd', 'ask'],
  ['type C:/Windows/win.ini', 'ask'],
  ['cat secrets/file.txt', 'deny'],
  ['cat *.key', 'deny'],
  ['cat */README.md', 'deny'],
  ['cat .en[v]', 'ask'],
  ['cat $HOME/private', 'ask'],
  ['mv a.txt /outside', 'ask'],
  ['brew install node', 'ask'],
  ['apt-get install tool', 'ask'],
  ['pacman -Syu', 'ask'],
  ['python3.12 -m pip install tool', 'ask'],
  ['cargo publish', 'ask'],
  ['command rm generated.txt', 'ask'],
  ['sudo echo hello', 'deny'],
  ['systemctl stop status', 'deny'],
  ['brew services start list', 'deny'],
  ['crontab -l -r', 'deny'],
  ['chmod 777 README.md', 'deny'],
] as const)('POSIX trusted command %s -> %s', (cmdline, decision) => {
  expect(
    checkAction({ ...posix(), commandMode: 'trusted' }, { type: 'run-command', cwd: '/project', cmdline })
      .decision,
  ).toBe(decision)
})
