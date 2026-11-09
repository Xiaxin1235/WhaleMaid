import { z } from 'zod'
import type { OpportunityCandidate, DetectorId } from './initiative/model.js'
import type { ProjectGoal } from './model/goal.js'
import { GoalIdSchema, ScopeIdSchema } from './model/ids.js'

export const RADAR_SOURCES = ['dependencies', 'localGit', 'github'] as const
export const RadarSourcesSchema = z.strictObject({
  dependencies: z.boolean(),
  localGit: z.boolean(),
  github: z.boolean(),
})
export type RadarSource = (typeof RADAR_SOURCES)[number]
export const RadarSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  sources: RadarSourcesSchema,
  checkHours: z.int().min(1).max(168),
})
export type RadarSettings = z.infer<typeof RadarSettingsSchema>
export const DEFAULT_RADAR: RadarSettings = {
  enabled: false,
  sources: { dependencies: true, localGit: true, github: true },
  checkHours: 24,
}

const ref = z.string().max(240)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const oid = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/)
export const RadarRepoSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i)
export const RadarDependencySchema = z.strictObject({
  ecosystem: z.enum(['npm', 'pypi']),
  name: ref,
  current: ref.optional(),
  exact: z.boolean(),
  // Retained only for the local comparison, never sent to a registry.
  range: ref,
})
export const RadarPreviewSchema = z.strictObject({
  goalId: GoalIdSchema,
  scopeHash: hash,
  token: hash,
  repo: RadarRepoSchema.optional(),
  dependencies: z.array(RadarDependencySchema),
  localGit: z.boolean(),
})
export type RadarPreview = z.infer<typeof RadarPreviewSchema>
export type RadarDependency = z.infer<typeof RadarDependencySchema>
export const RadarSubscribeSchema = z.strictObject({
  goalId: GoalIdSchema,
  token: hash,
  enabled: z.boolean(),
  sources: RadarSourcesSchema,
  repo: z.string().trim().max(240),
})

const time = z.number().nonnegative()
const RadarConflictSchema = z.strictObject({
  hash,
  paths: z.array(z.string().max(1024)).max(100),
  previous: oid,
  head: oid,
})
export type RadarConflict = z.infer<typeof RadarConflictSchema>
export const RadarSubscriptionSchema = z.strictObject({
  id: GoalIdSchema,
  scopeId: ScopeIdSchema,
  scopeHash: hash,
  enabled: z.boolean(),
  sources: RadarSourcesSchema,
  repo: RadarRepoSchema.optional(),
  dependencies: z.array(RadarDependencySchema),
  confirmedAt: time,
  revision: z.string(),
  lastAutomaticAt: time.optional(),
  lastNetworkAt: time.optional(),
  hold: z.strictObject({ ...RadarConflictSchema.shape, at: time }).optional(),
  acknowledged: hash.optional(),
  settled: z.strictObject({ hash, at: time, choice: z.enum(['continue', 'pause']) }).optional(),
  daily: z
    .array(
      z.strictObject({
        day: z.string(),
        checks: z.int().nonnegative(),
        passed: z.int().nonnegative(),
        requests: z.int().nonnegative(),
      }),
    )
    .max(8)
    .optional(),
})
export type RadarSubscription = z.infer<typeof RadarSubscriptionSchema>

const VersionSchema = z.strictObject({
  ecosystem: z.enum(['npm', 'pypi']),
  name: ref,
  current: ref.optional(),
  latest: ref,
  incompatible: z.boolean(),
  breaking: z.boolean(),
  deprecated: z.boolean(),
  hash,
})
const CiSchema = z.strictObject({ id: z.int().positive(), failure: z.boolean() })
const ItemSchema = z.strictObject({ number: z.int().positive(), kind: z.enum(['issue', 'pr']), hash })
export const RadarGitSchema = z.strictObject({
  head: oid,
  ref: ref.optional(),
  // Git state from the primary checkout only. The run checkout can move independently.
  changes: z.array(z.string().max(1024)).max(100),
  dirty: z.array(z.strictObject({ path: z.string().max(1024), hash })).max(100),
  external: z.array(oid).max(100),
  conflict: RadarConflictSchema.optional(),
})
export type RadarGit = z.infer<typeof RadarGitSchema>
export const RadarGitHubSchema = z.strictObject({
  branch: ref,
  runs: z.array(CiSchema),
  related: z.array(ItemSchema),
})
export const RadarObservationSchema = z.strictObject({
  id: z.string(),
  goalId: GoalIdSchema,
  revision: z.string(),
  at: time,
  source: z.enum(RADAR_SOURCES),
  purpose: z.literal('excerpt').optional(),
  requests: z.int().nonnegative(),
  cacheHits: z.int().nonnegative(),
  etags: z.array(z.strictObject({ endpoint: hash, tag: ref })).max(32),
  failure: z.string().max(80).optional(),
  retryAt: time.optional(),
  versions: z.array(VersionSchema).optional(),
  git: RadarGitSchema.optional(),
  github: RadarGitHubSchema.optional(),
})
export type RadarObservation = z.infer<typeof RadarObservationSchema>
export type RadarVersion = z.infer<typeof VersionSchema>
export type RadarGitHub = z.infer<typeof RadarGitHubSchema>

export const RADAR_DETECTORS = ['radarDependency', 'radarCI', 'radarConflict', 'radarRelated'] as const
export const RADAR_DETECTOR_SOURCE = {
  radarDependency: 'dependencies',
  radarCI: 'github',
  radarConflict: 'localGit',
  radarRelated: 'github',
} as const
export type RadarDetector = keyof typeof RADAR_DETECTOR_SOURCE
export type RadarFacts = {
  goal: Pick<ProjectGoal, 'id' | 'status'>
  dependencies?: RadarObservation
  github?: RadarObservation
  localGit?: RadarObservation
}

function candidate(
  facts: RadarFacts,
  detector: DetectorId,
  observation: RadarObservation,
  key: string,
  score: number,
  digest?: string,
): OpportunityCandidate {
  return {
    detector,
    subject: { goalId: facts.goal.id },
    dedupeKey: JSON.stringify([detector, facts.goal.id, key]),
    evidence: [{ kind: 'radar', id: observation.id, ...(digest ? { hash: digest } : {}) }],
    summary: detector,
    score,
  }
}

/** The input contains only typed snapshots. Each source fails independently. */
export const radarDetectors = {
  radarDependency(facts: RadarFacts) {
    const source = facts.dependencies
    if (!source || source.failure) return []
    return (source.versions ?? [])
      .filter((v) => v.incompatible || v.breaking || v.deprecated)
      .map((v) =>
        candidate(
          facts,
          'radarDependency',
          source,
          JSON.stringify([v.ecosystem, v.name, v.current, v.latest]),
          0.8,
          v.hash,
        ),
      )
  },
  radarCI(facts: RadarFacts) {
    const source = facts.github
    if (!source || source.failure || facts.goal.status !== 'active') return []
    const runs = source.github?.runs ?? []
    if (runs.length < 2 || !runs[0]?.failure || !runs[1]?.failure) return []
    return [
      candidate(
        facts,
        'radarCI',
        source,
        runs
          .slice(0, 2)
          .map((run) => run.id)
          .join(':'),
        0.85,
      ),
    ]
  },
  radarConflict(facts: RadarFacts) {
    const source = facts.localGit
    const conflict = source?.git?.conflict
    if (!source || source.failure || !conflict || !['active', 'paused'].includes(facts.goal.status)) return []
    return [candidate(facts, 'radarConflict', source, conflict.hash, 1, conflict.hash)]
  },
  radarRelated(facts: RadarFacts) {
    const source = facts.github
    if (!source || source.failure) return []
    return (source.github?.related ?? []).map((item) =>
      candidate(facts, 'radarRelated', source, `${item.kind}:${item.number}`, 0.5, item.hash),
    )
  },
} satisfies Record<RadarDetector, (facts: RadarFacts) => OpportunityCandidate[]>
