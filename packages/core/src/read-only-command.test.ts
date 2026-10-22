import { expect, test } from 'vitest'
import { readOnlyCommandPaths } from './read-only-command.js'
import { checkAction } from './scope.js'
import { makeScope } from '../tests/fixtures.js'

test.each([
  'type C:/Users/xx/.ssh/id_rsa',
  'Get-Content C:/Users/xx/.dsh/profiles/desktop/cordis.patch.yml',
  'cat C:/proj/.env',
  'Get-Content .env',
  'Get-Content -LiteralPath "../../secret"',
  'cat "//server/share/secret"',
])('read-only shell cannot bypass path authorization: %s', (cmdline) => {
  expect(
    checkAction(makeScope({ permissionPreset: 'read-only' }), {
      type: 'run-command',
      cwd: 'C:/proj',
      cmdline,
    }).decision,
  ).not.toBe('allow')
})
test.each([
  'dir',
  'ls .',
  'Get-ChildItem -Path .',
  'Get-Content -LiteralPath "file name.txt"',
  "cat 'src/file.txt'",
  'type file.txt',
])('literal paths are resolved: %s', (command) => {
  const result = readOnlyCommandPaths(command, 'C:/proj')
  expect('paths' in result).toBe(true)
  expect(
    checkAction(makeScope({ permissionPreset: 'read-only' }), {
      type: 'run-command',
      cwd: 'C:/proj',
      cmdline: command,
    }).decision,
  ).toBe('allow')
})
test.each([
  'cat a b',
  'cat -Raw a',
  'cat "$(secret)"',
  'cat %SECRET%',
  'cat *.txt',
  'dir /s',
  'cat "broken',
  'cat a; type b',
])('ambiguous grammar is not read-only: %s', (cmd) => {
  expect(readOnlyCommandPaths(cmd, 'C:/proj')).toEqual({ unparsable: true })
})
