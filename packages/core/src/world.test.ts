import { describe, expect, test } from 'vitest'
import { GoalIdSchema, TaskIdSchema } from './model/ids.js'
import { buildWorld, worldLayout, WorldPreferencesSchema, WorldSnapshotSchema } from './world.js'
import type { WorldFacts, WorldGoalFact, WorldTaskFact } from './world.js'

const task = (index = 1, patch: Partial<WorldTaskFact> = {}): WorldTaskFact => ({
  id: TaskIdSchema.parse(`task_${index}`),
  title: `Task ${index}`,
  state: 'READY',
  running: false,
  failed: false,
  stalled: false,
  ...patch,
})
const goal = (index = 1, patch: Partial<WorldGoalFact> = {}): WorldGoalFact => ({
  id: GoalIdSchema.parse(`goal_${index}`),
  title: `Room ${index}`,
  status: 'active',
  summary: 'Expected outcome',
  experiences: [],
  tasks: [task()],
  stalled: 0,
  repeatedFailure: false,
  parcel: false,
  flicker: false,
  hold: false,
  locked: false,
  ...patch,
})
const noon = Date.UTC(2026, 10, 10, 12)
const world = (
  goals: WorldGoalFact[],
  at = noon + 13000,
  patch: Partial<WorldFacts> = {},
  archived: string[] = [],
) =>
  WorldSnapshotSchema.parse(buildWorld({ goals, paused: false, ...patch }, at, { archived, timeZone: 'UTC' }))

describe('project facts into the mansion', () => {
  test('both feature switches start off', () => {
    expect(WorldPreferencesSchema.parse({})).toEqual({ enabled: false, petWalksIn: false, archived: [] })
  })
  test.each([
    [goal(1, { tasks: [task(1, { running: true, state: 'RUNNING' })] }), { working: true, mess: 0 }],
    [goal(1, { tasks: [task(1, { failed: true, state: 'FAILED' })] }), { mess: 1 }],
    [
      goal(1, { repeatedFailure: true, stalled: 2, tasks: [task(1, { failed: true, stalled: true })] }),
      { mess: 3 },
    ],
    [goal(1, { decision: 'notice_1', card: 'notice_2' }), { decision: 'notice_1', card: 'notice_2' }],
    [
      goal(1, { parcel: true, flicker: true, hold: true }),
      { parcel: true, flicker: true, hold: true, paused: true },
    ],
    [goal(1, { status: 'paused', locked: true }), { paused: true, locked: true }],
  ])('preserves recorded room signals', (fact, expected) =>
    expect(world([fact]).rooms[0]).toMatchObject(expected),
  )

  test('archives display only and sends completed goals to the gallery', () => {
    const completed = goal(2, {
      status: 'completed',
      experiences: ['Known'],
      tasks: [task(1, { state: 'SUCCEEDED' })],
    })
    const active = goal(1)
    const result = world([active, completed], noon, {}, [active.id])
    expect(result.rooms).toEqual([])
    expect(result.storage).toEqual([{ id: active.id, title: active.title }])
    expect(result.gallery).toEqual([
      {
        id: completed.id,
        title: completed.title,
        experiences: ['Known'],
        summary: 'Expected outcome',
        passed: 1,
        taskCount: 1,
      },
    ])
    expect(world([active]).rooms[0]?.id).toBe(active.id)
  })
  test.each([
    [1, 4],
    [4, 4],
    [5, 6],
    [6, 6],
    [7, 8],
    [8, 8],
    [10, 8],
  ])('uses the intended number of slots', (size, slots) => {
    const tasks = Array.from({ length: size }, (_, i) => task(i))
    expect(world([goal(1, { tasks })]).rooms[0]).toMatchObject({ slots, taskCount: size, cabinet: [] })
  })
  test('allocates counted tests first, shows missing progress neutrally, and stows passed overflow', () => {
    const tasks = [
      task(1, { tests: { passed: 3, failed: 1 }, running: true, failed: true }),
      task(2, { steps: { done: 2, total: 4 } }),
      task(3, { stalled: true, state: 'BLOCKED' }),
      task(4, { running: true }),
      ...Array.from({ length: 7 }, (_, i) => task(i + 5, { state: 'SUCCEEDED' })),
    ]
    const room = world([goal(1, { tasks })]).rooms[0]!
    expect(room.cabinet).toHaveLength(3)
    expect(room.items).toHaveLength(8)
    expect(room.items.slice(0, 4)).toMatchObject([
      { kind: 'tank', ratio: 0.75, running: true, failed: true },
      { kind: 'books', ratio: 0.5 },
      { kind: 'plant', ratio: undefined, wilted: true },
      { kind: 'lamp', running: true },
    ])
    expect(room.items[4]?.kind).toBe('keepsake')
  })

  test('uses a single plant and distinct furnishings across the eight displayed slots', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task(i))
    tasks[1] = task(1, { state: 'VERIFYING', stalled: true })
    const { items } = world([goal(1, { tasks })]).rooms[0]!
    expect(new Set(items.slice(0, 8).map(({ kind }) => kind)).size).toBe(8)
    expect(items.filter(({ kind }) => kind === 'plant')).toHaveLength(1)
    expect(items[1]).toMatchObject({ kind: 'files', state: 'VERIFYING', ratio: 0.76, wilted: true })
    expect(items.every(({ count }) => count === undefined)).toBe(true)
  })
})

test.each([0, 1, 4, 5, 20, 40])('lays out %i goals without overlapping projected rooms', (count) => {
  const ids = Array.from({ length: count }, (_, i) => `goal_${i}`)
  const layout = worldLayout(ids)
  expect(layout).toHaveLength(count + 4)
  for (const [index, a] of layout.entries()) {
    expect(layout.filter((b) => b.floor === a.floor).length).toBeLessThanOrEqual(4)
    for (const b of layout.slice(index + 1))
      expect(Math.abs(a.x - b.x) >= 365 || Math.abs(a.y - b.y) >= 300).toBe(true)
  }
  expect(
    worldLayout(ids.slice(1))
      .map((room) => room.id)
      .slice(4),
  ).toEqual(ids.slice(1))
})

test.each([
  [0, 'night'],
  [5, 'night'],
  [6, 'dawn'],
  [7, 'dawn'],
  [8, 'day'],
  [17, 'day'],
  [18, 'evening'],
  [20, 'evening'],
  [21, 'night'],
])('local time boundary %s', (hour, time) => {
  expect(world([], Date.UTC(2026, 10, 10, hour)).time).toBe(time)
})

test('the same instant respects time zones and quiet hours across midnight', () => {
  const facts: WorldFacts = { goals: [], paused: false, quietHours: { start: '22:00', end: '07:00' } }
  const build = (timeZone: string) => buildWorld(facts, noon, { archived: [], timeZone })
  expect(build('UTC')).toMatchObject({ time: 'day', quiet: false, actor: { room: 'hall', motion: 'idle' } })
  expect(build('America/Los_Angeles')).toMatchObject({
    time: 'night',
    quiet: true,
    actor: { room: 'bedroom', motion: 'sleep' },
  })
})

test('uses a fixed walking cadence and prioritizes work, decisions and global pause', () => {
  const working = (i: number) => goal(i, { tasks: [task(i, { state: 'RUNNING', running: true })] })
  expect(world([working(1)], noon).actor).toEqual({ room: 'goal_1', motion: 'sit-work' })
  expect(world([working(1), working(2)], noon).actor).toMatchObject({
    room: 'goal_1',
    from: 'goal_2',
    motion: 'walk',
  })
  expect(world([working(1), working(2)], noon + 29000).actor).toEqual({ room: 'goal_2', motion: 'sit-work' })
  expect(world([goal(1, { decision: 'notice_1' })], noon + 8000).actor).toMatchObject({
    room: 'goal_1',
    door: true,
    motion: 'idle',
  })
  expect(world([working(1)], noon, { paused: true })).toMatchObject({
    gateClosed: true,
    actor: { room: 'hall' },
  })
})
