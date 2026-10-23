import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from './service.js'
import { companionTools } from './tools.js'

/** Prompt variable the preset's persona row renders (`prefix: '{{whaledot_persona}}'`). */
export const PERSONA_VARIABLE = 'whaledot_persona'

interface SystemPromptVariables {
  variable(name: string, value: () => string): unknown
}

/**
 * Child plugin of the `whaledot-companion` agent preset. It runs in that agent's scope only, so the
 * persona variable and the read-only tools exist for the companion session and for no other session.
 */
export const name = 'whaledot-companion-agent'
export const inject = ['tools', 'systemPrompt', 'whaledotCompanion']

export function apply(ctx: Context): void {
  const api = ctx.whaledotCompanion
  const prompt = ctx.get('systemPrompt') as SystemPromptVariables
  prompt.variable(PERSONA_VARIABLE, () => api.persona())
  for (const tool of companionTools(api)) ctx.tools.register(tool)
}
