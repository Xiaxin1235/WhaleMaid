import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { COMPANION_ALLOWED_TOOLS } from './tools.js'
import { COMPANION_PRESET } from './service.js'

interface Mask {
  key: string
  off: () => void
}

/**
 * Other plugins (an agent team profile, shell or file tools) register global tools for every preset.
 * The gate already denies them in her session, but a model that can see them keeps trying, then asks
 * the user for more permission. Hide every global tool she is not allowed to call.
 */
export function installCompanionToolMask(
  ctx: Context,
  allowed: ReadonlySet<string> = COMPANION_ALLOWED_TOOLS,
): void {
  ctx.inject(['tools'], (child) => {
    const masks = new Map<Agent, Mask>()
    const sync = (agent: Agent) => {
      if (agent.session.header.agentPreset !== COMPANION_PRESET) return
      const tools = agent.ctx.get('tools') as Context['tools'] | undefined
      if (!tools) return
      // restrict() rejects names that are not registered globally; keep only the ones that are.
      const allow = [...allowed].filter((name) => tools.get(name) !== undefined).sort()
      const key = allow.join('\n')
      const current = masks.get(agent)
      if (current?.key === key) return
      current?.off()
      masks.delete(agent)
      if (allow.length === 0) return
      try {
        masks.set(agent, { key, off: tools.restrict({ allow }) })
      } catch {
        // The gate still denies everything outside the allow list.
      }
    }
    for (const agent of child.get('agents')?.list() ?? []) sync(agent)
    child.on('agent/created', ({ agent }) => {
      sync(agent)
      return undefined
    })
    child.on(
      'agent/pre-step',
      async (payload, next) => {
        sync(payload.agent)
        return next()
      },
      { prepend: true },
    )
    child.on('agent/disposed', ({ agent }) => {
      masks.delete(agent)
    })
    child.effect(() => () => {
      for (const mask of masks.values()) mask.off()
      masks.clear()
    })
  })
}
