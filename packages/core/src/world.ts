import { z } from 'zod'
import { GoalIdSchema, TaskIdSchema } from './model/ids.js'
import { GoalStatusSchema, TaskStateSchema } from './model/common.js'
import { quietHoursActive } from './notify/policy.js'
import type { NotificationPreferences } from './notify/model.js'

const fixed = ['hall', 'kitchen', 'gallery', 'bedroom'] as const
const camera = z.strictObject({
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(0.35).max(2.5),
  room: z.union([GoalIdSchema, z.enum(fixed)]).optional(),
})
export const WorldPreferencesSchema = z.strictObject({
  enabled: z.boolean().default(false),
  petWalksIn: z.boolean().default(false),
  archived: z.array(GoalIdSchema).default([]),
  camera: camera.optional(),
})
export type WorldPreferences = z.infer<typeof WorldPreferencesSchema>
export const WorldPreferencePatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('enabled'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('petWalksIn'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('camera'), value: camera }),
  z.strictObject({ kind: z.literal('archive'), id: GoalIdSchema, value: z.boolean() }),
])
export type WorldPreferencePatch = z.infer<typeof WorldPreferencePatchSchema>

const progress = z.strictObject({ done: z.int().nonnegative(), total: z.int().positive() })
const task = z.strictObject({ id: TaskIdSchema, title: z.string(), state: TaskStateSchema })
const prop = task.extend({
  kind: z.enum(['tank', 'books', 'plant', 'lamp', 'keepsake']),
  ratio: z.number().min(0).max(1).optional(),
  count: progress.optional(),
  running: z.boolean(),
  failed: z.boolean(),
  wilted: z.boolean(),
})
const goal = z.strictObject({ id: GoalIdSchema, title: z.string() })
const room = goal.extend({
  status: GoalStatusSchema,
  slots: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  taskCount: z.int().nonnegative(),
  passed: z.int().nonnegative(),
  items: z.array(prop),
  cabinet: z.array(task),
  mess: z.number().min(0).max(3),
  decision: z.string().optional(),
  card: z.string().optional(),
  parcel: z.boolean(),
  flicker: z.boolean(),
  hold: z.boolean(),
  paused: z.boolean(),
  locked: z.boolean(),
  working: z.boolean(),
})
export const WorldSnapshotSchema = z.strictObject({
  time: z.enum(['dawn', 'day', 'evening', 'night']),
  quiet: z.boolean(),
  gateClosed: z.boolean(),
  rooms: z.array(room),
  storage: z.array(goal),
  gallery: z.array(
    goal.extend({
      summary: z.string(),
      experiences: z.array(z.string()),
      passed: z.int(),
      taskCount: z.int(),
    }),
  ),
  actor: z.strictObject({
    room: z.string(),
    motion: z.enum(['idle', 'sit-work', 'walk', 'sleep']),
    from: z.string().optional(),
    door: z.boolean().optional(),
    durationMs: z.int().optional(),
  }),
})
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>
export type WorldRoom = z.infer<typeof room>
export type WorldProp = z.infer<typeof prop>
export type WorldTaskFact = z.infer<typeof task> & {
  tests?: { passed: number; failed: number }
  steps?: z.infer<typeof progress>
  running: boolean
  failed: boolean
  stalled: boolean
}
export interface WorldGoalFact extends z.infer<typeof goal> {
  status: WorldRoom['status']
  summary: string
  experiences: string[]
  tasks: readonly WorldTaskFact[]
  stalled: number
  repeatedFailure: boolean
  decision?: string
  card?: string
  parcel: boolean
  flicker: boolean
  hold: boolean
  locked: boolean
}
export interface WorldFacts {
  goals: readonly WorldGoalFact[]
  paused: boolean
  quietHours?: NotificationPreferences['quietHours']
}

// Four rooms per floor. Each projected shell stays within its own cell including the rear walls.
export function worldLayout(ids: readonly string[]) {
  return [...fixed, ...ids].map((id, index) => ({
    id,
    floor: Math.floor(index / 4),
    x: (index % 4) * 400,
    y: Math.floor(index / 4) * 310,
  }))
}

function makeRoom(fact: WorldGoalFact): WorldRoom {
  const {
    id,
    title,
    status,
    tasks,
    stalled,
    repeatedFailure,
    decision,
    card,
    parcel,
    flicker,
    hold,
    locked,
  } = fact
  const slots = tasks.length <= 4 ? 4 : tasks.length <= 6 ? 6 : 8
  const tucked = new Set(
    tasks
      .filter((t) => t.state === 'SUCCEEDED' && !t.running)
      .slice(0, Math.max(0, tasks.length - slots))
      .map((t) => t.id),
  )
  const pick = ({ id, title, state }: WorldTaskFact) => ({ id, title, state })
  const visible = tasks.filter((t) => !tucked.has(t.id))
  const used = new Set<WorldProp['kind']>()
  const kinds = new Map<string, WorldProp['kind']>()
  // First claim the furniture with evidence, then distribute the spare kinds in task order.
  for (const t of visible) {
    const kind = t.tests ? 'tank' : t.state === 'SUCCEEDED' ? 'keepsake' : t.steps ? 'books' : undefined
    if (kind) {
      kinds.set(t.id, kind)
      used.add(kind)
    }
  }
  const items = visible.map((t): WorldProp => {
    const options = t.running
      ? (['lamp', 'plant', 'books', 'tank'] as const)
      : (['plant', 'books', 'lamp', 'tank'] as const)
    const kind = kinds.get(t.id) ?? options.find((key) => !used.has(key)) ?? options[0]
    used.add(kind)
    const total = t.tests ? t.tests.passed + t.tests.failed : 0
    const count =
      kind === 'tank' && t.tests && total > 0
        ? { done: t.tests.passed, total }
        : kind === 'books'
          ? t.steps
          : undefined
    const phase = { PENDING: 0.14, READY: 0.28, RUNNING: 0.51, VERIFYING: 0.76, SUCCEEDED: 1 } as Partial<
      Record<WorldProp['state'], number>
    >
    const ratio = count
      ? Math.min(1, count.done / count.total)
      : kind === 'plant'
        ? phase[t.state]
        : undefined
    return { ...pick(t), kind, ratio, count, running: t.running, failed: t.failed, wilted: t.stalled }
  })
  return {
    id,
    title,
    status,
    slots,
    taskCount: tasks.length,
    passed: tasks.filter((t) => t.state === 'SUCCEEDED').length,
    items,
    cabinet: tasks.filter((t) => tucked.has(t.id)).map(pick),
    mess: Math.min(3, Number(tasks.some((t) => t.failed)) + Number(repeatedFailure) + Number(stalled > 0)),
    decision,
    card,
    parcel,
    flicker,
    hold,
    paused: status === 'paused' || hold,
    locked,
    working: tasks.some((t) => t.running),
  }
}

function role(
  rooms: WorldRoom[],
  now: number,
  time: WorldSnapshot['time'],
  quiet: boolean,
  paused: boolean,
): WorldSnapshot['actor'] {
  if (paused) return { room: 'hall', motion: 'sit-work' }
  const working = rooms.filter((room) => room.working)
  const slot = Math.floor(now / 24000)
  if (working.length) {
    const current = working[slot % working.length]!
    const from = working[(slot + working.length - 1) % working.length]!
    return working.length > 1 && now % 24000 < 4200
      ? { room: current.id, from: from.id, motion: 'walk', durationMs: 2600 }
      : { room: current.id, motion: 'sit-work' }
  }
  if (time === 'night' || quiet) return { room: 'bedroom', motion: 'sleep' }
  const waiting = rooms.filter((room) => room.decision && !room.locked)
  if (waiting.length && now % 90000 < 12000) {
    const room = waiting[Math.floor(now / 90000) % waiting.length]!
    return now % 90000 < 4200
      ? { room: room.id, from: 'hall', door: true, motion: 'walk', durationMs: 2600 }
      : { room: room.id, door: true, motion: 'idle' }
  }
  return { room: 'hall', motion: 'idle' }
}

export function buildWorld(
  facts: WorldFacts,
  now: number,
  prefs: { archived: readonly string[]; timeZone: string },
): WorldSnapshot {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: prefs.timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')!.value)
  const minute = Number(parts.find((part) => part.type === 'minute')!.value)
  const time = hour < 6 || hour >= 21 ? 'night' : hour < 8 ? 'dawn' : hour < 18 ? 'day' : 'evening'
  const quiet = quietHoursActive(facts.quietHours, hour * 60 + minute)
  const archived = new Set(prefs.archived)
  const rooms: WorldRoom[] = [],
    storage: WorldSnapshot['storage'] = [],
    gallery: WorldSnapshot['gallery'] = []
  for (const fact of facts.goals) {
    const { id, title, summary, experiences } = fact
    if (archived.has(id)) storage.push({ id, title })
    else if (fact.status === 'completed' || fact.status === 'succeeded')
      gallery.push({
        id,
        title,
        summary,
        experiences,
        passed: fact.tasks.filter((task) => task.state === 'SUCCEEDED').length,
        taskCount: fact.tasks.length,
      })
    else rooms.push(makeRoom(fact))
  }
  return {
    time,
    quiet,
    gateClosed: facts.paused,
    rooms,
    storage,
    gallery,
    actor: role(rooms, now, time, quiet, facts.paused),
  }
}
