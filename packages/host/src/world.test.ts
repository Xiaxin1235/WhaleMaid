import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { makeGoal, makeTask } from '../../core/tests/fixtures.js'
import { WhaleStore } from './store/index.js'
import { Mansion } from './world.js'

test('the mansion stores display preferences separately and reads snapshots without changing the project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whalemaid-world-'))
  const store = new WhaleStore(dir, { log: vi.fn() })
  try {
    const goal = makeGoal()
    const task = makeTask()
    store.goals.insert(goal)
    store.tasks.insert(task)
    const facts = vi.fn(() => ({ goal }))
    const mansion = new Mansion(store, { facts, hold: () => undefined }, undefined)
    expect(() => mansion.snapshot()).toThrow('world-disabled')
    expect(facts).not.toHaveBeenCalled()
    const write = vi.spyOn(store, 'setWorldPreferences')
    mansion.update({ kind: 'enabled', value: true })
    mansion.update({ kind: 'archive', id: goal.id, value: true })
    mansion.update({ kind: 'petWalksIn', value: true })
    mansion.update({ kind: 'camera', value: { x: 10, y: 20, zoom: 1 } })
    expect(mansion.snapshot().snapshot.storage).toEqual([{ id: goal.id, title: goal.title }])
    mansion.update({ kind: 'enabled', value: false })
    mansion.update({ kind: 'enabled', value: true })
    expect(mansion.preferences()).toMatchObject({
      petWalksIn: true,
      archived: [goal.id],
      camera: { x: 10, y: 20, zoom: 1 },
    })
    mansion.update({ kind: 'archive', id: goal.id, value: false })
    write.mockClear()
    expect(mansion.snapshot().snapshot.rooms[0]?.items[0]).toMatchObject({ id: task.id, state: 'PENDING' })
    expect(write).not.toHaveBeenCalled()
    expect(store.goals.get(goal.id)).toEqual(goal)
    expect(store.tasks.get(task.id)).toEqual(task)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
