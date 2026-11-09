import { z } from 'zod'
import { CompanionActionSchema } from '../companion/actions.js'
import { GoalDraftSchema } from '../goal-draft.js'
import { GoalIdSchema, TaskIdSchema } from '../model/ids.js'
import { RADAR_DETECTORS } from '../radar.js'

export const I1_DETECTORS = [
  'repeatedFailure',
  'stallWarning',
  'noAcceptance',
  'budgetBurn',
  'pendingBacklog',
  'idleGoal',
  'leftovers',
] as const
export const DETECTORS = [...I1_DETECTORS, ...RADAR_DETECTORS] as const
export const DetectorSchema = z.enum(DETECTORS)
export type DetectorId = z.infer<typeof DetectorSchema>
export const LEVELS = ['L0', 'L1', 'L2', 'L3'] as const
export const InitiativeLevelSchema = z.enum(LEVELS)
export type InitiativeLevel = z.infer<typeof InitiativeLevelSchema>
export const DETECTOR_LEVELS = {
  repeatedFailure: 'L2',
  stallWarning: 'L2',
  noAcceptance: 'L1',
  budgetBurn: 'L3',
  pendingBacklog: 'L2',
  idleGoal: 'L1',
  leftovers: 'L1',
  radarDependency: 'L2',
  radarCI: 'L2',
  radarConflict: 'L3',
  radarRelated: 'L1',
} satisfies Record<DetectorId, InitiativeLevel>
export const INITIATIVE_DAY = 86400000
export const INITIATIVE_TTL = 7 * INITIATIVE_DAY
export const INITIATIVE_NOTIFICATION_KIND = 'initiative'
export const INITIATIVE_HOUR = 3600000
export const INITIATIVE_CARD_CAPACITY = 64
export const InitiativeLimitsSchema = z.strictObject({
  cardIntervalHours: z.int().min(1).max(168),
  cooldownDays: z.int().min(1).max(30),
})
export const DEFAULT_INITIATIVE_LIMITS = { cardIntervalHours: 4, cooldownDays: 7 } as const
export const DetectorSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  maxLevel: InitiativeLevelSchema,
})
export const InitiativeSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  detectors: z.record(DetectorSchema, DetectorSettingsSchema),
  channels: z.strictObject({ brief: z.boolean(), cards: z.boolean(), asks: z.boolean() }),
  limits: InitiativeLimitsSchema,
  companion: z.strictObject({ journal: z.boolean() }),
})
export type InitiativeSettings = z.infer<typeof InitiativeSettingsSchema>
export function defaultInitiativeSettings(): InitiativeSettings {
  return InitiativeSettingsSchema.parse({
    enabled: true,
    detectors: Object.fromEntries(
      DETECTORS.map((id) => [id, { enabled: true, maxLevel: DETECTOR_LEVELS[id] }]),
    ),
    channels: { brief: true, cards: true, asks: false },
    limits: DEFAULT_INITIATIVE_LIMITS,
    companion: { journal: true },
  })
}

export const OpportunityEvidenceSchema = z.strictObject({
  kind: z.enum(['goal', 'task', 'verification', 'run', 'notification', 'radar']),
  id: z.string().min(1),
  commandIndex: z.int().nonnegative().optional(),
  hash: z.string().optional(),
})
export type OpportunityEvidence = z.infer<typeof OpportunityEvidenceSchema>
export const OpportunitySchema = z.strictObject({
  id: z.string().min(1),
  detector: DetectorSchema,
  subject: z.strictObject({ goalId: GoalIdSchema.optional(), taskId: TaskIdSchema.optional() }),
  dedupeKey: z.string().min(1),
  evidence: z.array(OpportunityEvidenceSchema).max(12),
  summary: z.string(),
  score: z.number().min(0).max(1),
  level: InitiativeLevelSchema,
  actions: z.array(CompanionActionSchema),
  status: z.enum(['open', 'delivered', 'accepted', 'snoozed', 'dismissed', 'muted', 'expired']),
  createdAt: z.number(),
  expiresAt: z.number(),
  outcomeAt: z.number().optional(),
  notificationId: z.string().optional(),
  deliveredAt: z.number().optional(),
  falsePositive: z.boolean().optional(),
  neutral: z.boolean().optional(),
  progressAt: z.number().optional(),
  progressClosed: z.boolean().optional(),
  progressGoal: GoalIdSchema.optional(),
  progressStatus: z.string().optional(),
  awaitsDraft: z.boolean().optional(),
  draft: z.strictObject({ id: z.string(), projectRoot: z.string(), content: GoalDraftSchema }).optional(),
})
export type Opportunity = z.infer<typeof OpportunitySchema>
export type OpportunityCandidate = Pick<
  Opportunity,
  'detector' | 'subject' | 'dedupeKey' | 'evidence' | 'summary' | 'score'
>

export function resolveLevel(
  candidate: Pick<OpportunityCandidate, 'detector' | 'score'>,
  settings: InitiativeSettings,
): InitiativeLevel {
  const detector = settings.detectors[candidate.detector]
  if (!settings.enabled || !detector.enabled || candidate.score < 0.3) return 'L0'
  const max =
    candidate.detector === 'budgetBurn' || candidate.detector === 'radarConflict'
      ? 3
      : candidate.detector === 'radarRelated'
        ? 1
        : 2
  const ceiling = Math.min(max, LEVELS.indexOf(detector.maxLevel))
  let level = LEVELS[ceiling]!
  if (level === 'L3' && !settings.channels.asks) level = 'L2'
  if (level === 'L2' && !settings.channels.cards) level = 'L1'
  return level === 'L1' && !settings.channels.brief ? 'L0' : level
}

export const InitiativeChoiceSchema = z.enum([
  'draft-diagnosis',
  'draft-followup',
  'pause',
  'split-note',
  'open-goal',
  'open-decision',
  'idle-pause',
  'idle-keep',
  'snooze',
  'dismiss',
  'mute',
  'inaccurate',
  'evidence',
])
export type InitiativeChoice = z.infer<typeof InitiativeChoiceSchema>

export const INITIATIVE_ADOPTIONS = {
  repeatedFailure: ['draft-diagnosis', 'pause'],
  stallWarning: ['split-note', 'pause'],
  noAcceptance: ['open-goal'],
  budgetBurn: ['pause', 'open-goal'],
  pendingBacklog: ['open-decision'],
  idleGoal: ['idle-pause', 'idle-keep'],
  leftovers: ['draft-followup'],
  radarDependency: ['draft-diagnosis', 'split-note'],
  radarCI: ['pause', 'draft-diagnosis'],
  radarConflict: ['idle-keep', 'pause', 'evidence'],
  radarRelated: [],
} as const satisfies Record<DetectorId, readonly InitiativeChoice[]>

export const INITIATIVE_FEEDBACK = ['snooze', 'dismiss', 'mute', 'inaccurate', 'evidence'] as const

export function initiativeOptions(rows: readonly Opportunity[]) {
  const lead = rows[0]
  if (!lead) return []
  const conflict = rows.find((row) => row.detector === 'radarConflict')
  if (conflict)
    return INITIATIVE_ADOPTIONS.radarConflict.map((choice) => ({ choice, opportunityId: conflict.id }))
  const offered = new Map<InitiativeChoice, string>()
  for (const row of rows) {
    for (const choice of INITIATIVE_ADOPTIONS[row.detector]) {
      if (offered.size < 2 && !offered.has(choice)) offered.set(choice, row.id)
    }
  }
  for (const choice of INITIATIVE_FEEDBACK) offered.set(choice, lead.id)
  return [...offered].map(([choice, opportunityId]) => ({ choice, opportunityId }))
}

export const InitiativeMetricsSchema = z.strictObject({
  delivered: z.int().nonnegative(),
  accepted: z.int().nonnegative(),
  interruptions: z.int().nonnegative(),
  progressed: z.int().nonnegative(),
  inaccurate: z.int().nonnegative(),
  modelCost: z.literal(0),
})

export function initiativeMetrics(rows: readonly Opportunity[], now: number, days: number) {
  const grouped = new Map<string, Opportunity[]>()
  for (const row of rows) {
    if (
      row.deliveredAt === undefined ||
      row.deliveredAt <= now - days * INITIATIVE_DAY ||
      row.deliveredAt > now
    )
      continue
    const key = row.notificationId ?? row.id
    const group = grouped.get(key) ?? []
    group.push(row)
    grouped.set(key, group)
  }
  const delivered = [...grouped.values()]
  const accepted = delivered.filter((group) => group.some((row) => row.status === 'accepted'))
  return InitiativeMetricsSchema.parse({
    delivered: delivered.length,
    accepted: accepted.length,
    interruptions: delivered.filter((group) =>
      group.some((row) => !row.neutral && ['dismissed', 'muted', 'expired'].includes(row.status)),
    ).length,
    progressed: accepted.filter((group) => group.some((row) => row.progressAt !== undefined)).length,
    inaccurate: delivered.filter((group) => group.some((row) => row.falsePositive)).length,
    modelCost: 0,
  })
}

export const InitiativeAdjustmentSchema = z.strictObject({
  at: z.number(),
  level: InitiativeLevelSchema,
  minimumScore: z.number().min(0.3).max(0.5),
  delivered: z.int().nonnegative(),
  interruptions: z.int().nonnegative(),
  accepted: z.int().nonnegative(),
})
export type InitiativeAdjustment = z.infer<typeof InitiativeAdjustmentSchema>

/** One explainable change per 30-day sample; restoring starts a fresh sample. */
export function learnInitiative(
  rows: readonly Opportunity[],
  now: number,
  level: InitiativeLevel,
  since: number,
) {
  const metrics = initiativeMetrics(
    rows.filter((row) => (row.deliveredAt ?? 0) > since),
    now,
    30,
  )
  if (metrics.delivered < 10) return undefined
  const noisy = metrics.interruptions / metrics.delivered > 0.5
  const settled = metrics.accepted + metrics.interruptions
  const rarelyAccepted = settled >= 10 && metrics.accepted / metrics.delivered <= 0.2
  if (!noisy && !rarelyAccepted) return undefined
  return InitiativeAdjustmentSchema.parse({
    delivered: metrics.delivered,
    accepted: metrics.accepted,
    interruptions: metrics.interruptions,
    at: now,
    level: noisy ? LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)] : level,
    minimumScore: rarelyAccepted ? 0.4 : 0.3,
  })
}

/** Opportunities in the next card for one goal. L3 never waits behind L2's interval. */
export function initiativeBatch(rows: readonly Opportunity[], now: number, lastCard: number, hours: number) {
  const pending = rows.filter(
    (row) => row.status === 'open' && !row.notificationId && row.createdAt <= now && row.expiresAt > now,
  )
  const question = pending.find((row) => row.level === 'L3')
  return pending
    .filter((row) =>
      question
        ? row.createdAt === question.createdAt &&
          (row.level === 'L3' || (row.level === 'L2' && now - lastCard >= hours * INITIATIVE_HOUR))
        : row.level === 'L2' && now - lastCard >= hours * INITIATIVE_HOUR,
    )
    .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function initiativeInCooldown(
  row: Opportunity,
  previous: readonly Opportunity[],
  now: number,
  days: number,
) {
  return previous.some(
    (old) =>
      old.id !== row.id &&
      old.dedupeKey === row.dedupeKey &&
      old.deliveredAt !== undefined &&
      old.deliveredAt + days * INITIATIVE_DAY > now,
  )
}

/** A future delivery can use this factor without changing an already-open finding's score. */
export function opportunityNovelty(
  now: number,
  previous?: { cooldownUntil?: number; snoozedUntil?: number },
): number {
  if (now < (previous?.cooldownUntil ?? 0)) return 0
  return Math.max(0, 1 - Math.max(0, (previous?.snoozedUntil ?? now) - now) / INITIATIVE_TTL)
}
