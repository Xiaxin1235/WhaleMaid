import { z } from 'zod'
import {
  EmptyRequestSchema,
  ErrorSchema,
  GoalsSchema,
  LanguageRequestSchema,
  LanguageResponseSchema,
  StatusSchema,
} from './contract.js'
import type { PanelStatus } from './contract.js'

/** Pure validation/projection. The adapter supplies live host facts, never wire-supplied facts. */
export function status(input: unknown, snapshot: PanelStatus): PanelStatus {
  EmptyRequestSchema.parse(input)
  return StatusSchema.parse(snapshot)
}
export function goals(input: unknown, records: unknown) {
  EmptyRequestSchema.parse(input)
  return GoalsSchema.parse(records)
}
export function languagePatch(input: unknown) {
  return LanguageRequestSchema.parse(input)
}
export function panelError(code: string, message: string) {
  return ErrorSchema.parse({ error: { code, message } })
}
export function failure(error: unknown) {
  if (error instanceof Error && ['stale-version', 'scope-full', 'contains-secret'].includes(error.message))
    return panelError(`whaledot/${error.message}`, error.message)
  if (error instanceof z.ZodError) return panelError('whaledot/invalid-input', 'Invalid panel data')
  if (error instanceof Error && 'code' in error && error.code === 'SETTINGS_CONFLICT') {
    return panelError('whaledot/settings-conflict', 'Settings changed; refresh and try again')
  }
  // Internal failures are thrown as short identifiers (draft-busy, project-root-changed, ...).
  // Pass those through so the panel can say what went wrong; anything else stays generic.
  if (error instanceof Error && /^[a-z][a-z0-9-]{2,63}$/.test(error.message))
    return panelError(`whaledot/${error.message}`, error.message)
  return panelError('whaledot/unavailable', 'Panel service unavailable')
}
export { LanguageResponseSchema }
