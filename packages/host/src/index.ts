import type { Context } from '@deepseek-ai/cordis'

export const name = 'whaledot'

/** Log plugin loading without letting initialization errors escape to DSH. */
export function apply(ctx: Context): void {
  try {
    // Cordis 4.0.4: lib/types/context.d.ts and lib/types/logger.d.ts.
    ctx.logger('whaledot').info('plugin loaded')
  } catch (error) {
    console.error('[whaledot] failed to load plugin', error)
  }
}
