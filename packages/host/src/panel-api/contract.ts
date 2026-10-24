import { z } from 'zod'
import {
  ProjectGoalSchema,
  SuggestionSchema,
  UserNoteSchema,
  NotificationChoiceSchema,
  NotificationPreferencesSchema,
  AutopilotEventSchema,
  PlannerStateSchema,
  VerificationSchema,
  NotificationSchema,
  TaskIdSchema,
  DecisionChoiceSchema,
  GoalIdSchema,
  RunSchema,
  CheckpointSchema,
  EvidenceSchema,
  ScopeIdSchema,
  GoalDraftSchema,
  TaskSchema,
  AuthorizationScopeSchema,
  StateTransitionSchema,
  DirectionSchema,
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
export const VerifyTaskSchema = z.strictObject({ taskId: TaskIdSchema })
export const ResolveDecisionSchema = z.strictObject({
  notificationId: z.string().min(1),
  choice: DecisionChoiceSchema,
  confirm: z.literal(true).optional(),
  goalVersion: z.int().nonnegative().optional(),
  direction: DirectionSchema.optional(),
})
export const VerificationLogSchema = z.strictObject({
  runId: z.string().min(1),
  phase: z.enum(['baseline', 'current']),
  index: z.int().nonnegative(),
})
export const SetAutopilotSchema = z.strictObject({
  goalId: GoalIdSchema,
  enabled: z.boolean(),
  confirm: z.boolean().optional(),
  scopeHash: z.string().optional(),
})
export const TraceRequestSchema = z.strictObject({ goalId: GoalIdSchema })
export const TraceResponseSchema = z.strictObject({ markdown: z.string(), filename: z.string() })
export const NotificationCenterRequestSchema = z.strictObject({ goalId: GoalIdSchema.optional() })
export const NotificationCenterSchema = z.strictObject({
  preferences: NotificationPreferencesSchema,
  items: z.array(
    z.strictObject({
      notification: NotificationSchema,
      copy: z.strictObject({ header: z.string(), question: z.string(), detail: z.string() }),
      suggestions: z.array(SuggestionSchema),
      notes: z.array(UserNoteSchema),
      choices: z.array(NotificationChoiceSchema),
      goal: ProjectGoalSchema.pick({ id: true, title: true, version: true, status: true }).optional(),
    }),
  ),
})
export const RouteSuggestionSchema = z.strictObject({
  suggestionId: z.string().min(1),
  confirm: z.literal(true).optional(),
  goalVersion: z.int().nonnegative().optional(),
  direction: DirectionSchema.optional(),
})
export const RouteResultSchema = z.strictObject({
  ok: z.boolean(),
  reason: z.string().optional(),
  goalId: GoalIdSchema.optional(),
  openPanel: z.boolean().optional(),
  state: z.string().optional(),
  files: z.array(z.string()).optional(),
  stat: z.string().optional(),
})
export const ReminderSchema = z.strictObject({ notificationId: z.string().min(1) })
export const PANEL_METHODS = [
  'companion-drafts',
  'companion-action-events',
  'memory-proposals',
  'memory-proposal-resolve',
  'memories-consolidate',
  'memory-draft-settings',
  'memories-list',
  'memory-update',
  'memory-archive',
  'memory-restore',
  'memory-delete',
  'memories-export',
  'notification-center',
  'notification-preferences',
  'route-suggestion',
  'remind-notification',
  'notification-navigation',
  'set-autopilot',
  'export-trace',

  'verify-task',
  'reconcile-task',
  'resolve-decision',
  'verification-log',

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
  'companion-rebuild',
] as const
export type PanelMethod = (typeof PANEL_METHODS)[number]
export const CompanionDraftsSchema = z.array(
  z.strictObject({
    draftId: z.string(),
    proposalId: z.string(),
    sessionId: z.string(),
    confirmedAt: z.number(),
    text: z.string(),
    projectRoot: z.string(),
    state: z.enum(['running', 'ready', 'failed']),
  }),
)
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
  globalPaused: z.boolean().default(false),
  scope: AuthorizationScopeSchema.nullable(),
  activeScope: AuthorizationScopeSchema.nullable(),
  tasks: z.array(TaskSchema),
  transitions: z.array(StateTransitionSchema),
  runs: z.array(RunSchema).default([]),
  checkpoints: z.array(CheckpointSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  verifications: z.array(VerificationSchema).default([]),
  notifications: z.array(NotificationSchema).default([]),
  autopilotEvents: z.array(AutopilotEventSchema).default([]),
  plannerState: PlannerStateSchema.nullable().default(null),
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
export const CompanionStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('disabled') }),
  z.strictObject({ state: z.literal('starting') }),
  z.strictObject({ state: z.literal('ready'), sessionId: z.string() }),
  z.strictObject({ state: z.literal('error'), message: z.string() }),
])
export const CompanionRebuildSchema = z.strictObject({ confirm: z.literal(true) })
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
  companion: CompanionStatusSchema.optional(),
})
export const GoalsSchema = z.array(ProjectGoalSchema)
export const LanguageResponseSchema = z.strictObject({ language: LanguageSchema })
export const ErrorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
})
export type PanelStatus = z.infer<typeof StatusSchema>
export const PANEL_CHANNEL = '/api'
export const PANEL_PREFIX = 'whaledot'
