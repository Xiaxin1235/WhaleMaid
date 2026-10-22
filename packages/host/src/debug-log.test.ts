import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { DebugLog } from './debug-log.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function setup(enabled: boolean, limit?: number) {
  const dir = mkdtempSync(join(tmpdir(), 'whaledot-log-'))
  dirs.push(dir)
  return { dir, log: new DebugLog(dir, enabled, limit) }
}
test('disabled signal logging writes no files; host events are always recorded', () => {
  const { dir, log } = setup(false)
  log.signal({ sessionId: 's', kind: 'turn-start', at: 1 })
  expect(readdirSync(dir)).toEqual([])
  log.host('plugin loaded')
  log.host('plugin degraded', new Error('disk unavailable'))
  expect(readFileSync(join(dir, 'debug/host.log'), 'utf8')).toContain('disk unavailable')
})
test('signals contain only narrow fields and rotate to one previous file', () => {
  const { dir, log } = setup(true, 120)
  for (let at = 0; at < 10; at++) {
    log.signal({ sessionId: 's', kind: 'turn-start', at, raw: { content: 'private' } })
  }
  expect(readdirSync(join(dir, 'debug')).sort()).toEqual(['signals.jsonl', 'signals.jsonl.1'])
  const text = readFileSync(join(dir, 'debug/signals.jsonl'), 'utf8')
  expect(text).not.toContain('private')
  expect(
    text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  ).toEqual([
    { sessionId: 's', kind: 'turn-start', at: 8 },
    { sessionId: 's', kind: 'turn-start', at: 9 },
  ])
})
