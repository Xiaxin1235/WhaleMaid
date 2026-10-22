import { z } from 'zod'
import { ProjectGoalSchema, ScopeIdSchema } from '@whaledot/core'

export const LanguageSchema = z.enum(['auto', 'zh-CN', 'en'])
export const EmptyRequestSchema = z.strictObject({})
export const LanguageRequestSchema = z.strictObject({ language: LanguageSchema })
export const PausedSchema = z.strictObject({ paused: z.boolean() })
export const RevokeScopeSchema = z.strictObject({ scopeId: ScopeIdSchema })
export const TakeoverSchema = z.strictObject({ confirm: z.literal(true) })
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
