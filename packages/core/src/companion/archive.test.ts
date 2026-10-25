import { expect, it } from 'vitest'
import { isOwnedCompanion, companionSessionIds, COMPANION_ARCHIVE_ACTION } from './archive.js'
it('requires recorded ownership, exact root companion preset, header directory and workspace membership', () => {
  const meta = { agentPreset: 'whaledot-companion', cwd: 'D:/test/companion' },
    workspace = { path: 'd:/test/companion', sessionIds: ['old'] }
  expect(isOwnedCompanion('old', ['old'], meta, workspace, 'D:\\test\\companion')).toBe(true)
  for (const identity of [
    { ...meta, agentPreset: 'standard' },
    { cwd: meta.cwd },
    { ...meta, origin: 'subagent' },
    { ...meta, cwd: 'D:/other' },
  ])
    expect(isOwnedCompanion('old', ['old'], identity, workspace, 'D:/test/companion')).toBe(false)
  expect(isOwnedCompanion('old', [], meta, workspace, 'D:/test/companion')).toBe(false)
  expect(isOwnedCompanion('old', ['old'], meta, { ...workspace, sessionIds: [] }, 'D:/test/companion')).toBe(
    false,
  )
  expect(isOwnedCompanion('old', ['old'], meta, undefined, 'D:/test/companion')).toBe(false)
})
it('retains old ownership only from the host companion archive audit, beyond the recent twenty ids', () => {
  const base = {
    id: 'event',
    at: 1,
    action: COMPANION_ARCHIVE_ACTION,
    reason: 'succeeded',
    sessionId: 'ancient',
  }
  expect(
    companionSessionIds({ sessionId: 'current', previous: ['old'] }, [{ ...base, actor: 'companion' }]),
  ).toEqual(['current', 'old', 'ancient'])
  expect(
    companionSessionIds(undefined, [
      { ...base, actor: 'user' },
      { ...base, actor: 'companion', reason: 'failed' },
    ]),
  ).toEqual([])
})
