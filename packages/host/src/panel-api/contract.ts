import { z } from 'zod'
import {
  ProjectGoalSchema,
  GoalIdSchema,
  RunSchema,
  CheckpointSchema,
  EvidenceSchema,
  ScopeIdSchema,
  GoalDraftSchema,
  TaskSchema,
  AuthorizationScopeSchema,
  StateTransitionSchema,
} from '@whaledot/core'

export const LanguageSchema = z.enum(['auto', 'zh-CN', 'en'])
export const EmptyRequestSchema = z.strictObject({})
export const LanguageRequestSchema = z.strictObject({ language: LanguageSchema })
export const PausedSchema = z.strictObject({ paused: z.boolean() })
export const RevokeScopeSchema = z.strictObject({ scopeId: ScopeIdSchema })
export const TakeoverSchema = z.strictObject({ confirm: z.literal(true) })
export const ExecuteNextSchema = z.strictObject({ goalId: GoalIdSchema })
export const ExecuteResultSchema = z.strictObject({
  started: z.boolean(),
  reason: z.string(),
  runId: z.string().optional(),
})
export const PANEL_METHODS = [
  'execute-next',
  'status',
  'goals',
  'language',
  'set-paused',
  'revoke-scope',
  'takeover-store',
  'draft-goal',
  'draft-status',
  'cancel-draft',
  'project-facts',
  'confirm-goal',
  'goal-detail',
  'set-goal-paused',
] as const
export type PanelMethod = (typeof PANEL_METHODS)[number]
export const ProjectFactsSchema = z.strictObject({
  projectRoot: z.string(),
  isGit: z.boolean(),
  clean: z.boolean(),
  branch: z.string().nullable(),
  candidateCommands: z.array(
    z.strictObject({
      command: z.string(),
      class: z.enum(['safe', 'needs-approval', 'forbidden']),
      reasons: z.array(z.string()),
    }),
  ),
})
export const DraftStatusSchema = z.strictObject({
  state: z.enum(['running', 'ready', 'failed']),
  draft: GoalDraftSchema.optional(),
  projectFacts: ProjectFactsSchema.optional(),
  error: z.string().optional(),
})
export const DraftStartedSchema = z.strictObject({ draftId: z.string() })
export const GoalDetailSchema = z.strictObject({
  goal: ProjectGoalSchema,
  scope: AuthorizationScopeSchema.nullable(),
  activeScope: AuthorizationScopeSchema.nullable(),
  tasks: z.array(TaskSchema),
  transitions: z.array(StateTransitionSchema),
  runs: z.array(RunSchema).default([]),
  checkpoints: z.array(CheckpointSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
})
export const ConfirmResultSchema = z.strictObject({
  goal: ProjectGoalSchema,
  scope: AuthorizationScopeSchema,
  rejected: z.array(
    z.strictObject({
      task: TaskSchema,
      reason: z.enum(['foreign-goal', 'duplicate', 'dangling-dependency', 'cycle']),
    }),
  ),
})
export const ServicesSchema = z.strictObject({
  gateway: z.boolean(),
  commands: z.boolean(),
  userQuestions: z.boolean(),
  approval: z.boolean(),
  permissionPresets: z.boolean(),
  tools: z.boolean(),
})
export const StatusSchema = z.strictObject({
  version: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  dataDir: z.string().min(1),
  services: ServicesSchema,
  coopanion: z.boolean(),
  language: LanguageSchema,
  store: z.strictObject({
    state: z.enum(['ok', 'read-only', 'error']),
    corruptRows: z.int().nonnegative(),
    message: z.string().optional(),
  }),
  paused: z.boolean(),
})
export const GoalsSchema = z.array(ProjectGoalSchema)
export const LanguageResponseSchema = z.strictObject({ language: LanguageSchema })
export const ErrorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
})
export type PanelStatus = z.infer<typeof StatusSchema>
export const PANEL_CHANNEL = '/api'
export const PANEL_PREFIX = 'whaledot'
