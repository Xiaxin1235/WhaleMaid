import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { DEFAULT_RADAR, RADAR_SOURCES } from '@whalemaid/core'
import type { RadarSettings, RadarSource } from '@whalemaid/core'

export interface RadarConfig {
  enabled?: Volatile<boolean>
  sources?: Partial<Record<RadarSource, Volatile<boolean>>>
  checkHours?: Volatile<number>
}

export const RadarConfigSchema = Schema.object({
  enabled: Schema.boolean().default(false).volatile(),
  sources: Schema.object(
    Object.fromEntries(RADAR_SOURCES.map((id) => [id, Schema.boolean().default(true).volatile()])),
  ).default({}),
  checkHours: Schema.natural().min(1).max(168).default(DEFAULT_RADAR.checkHours).volatile(),
}).default({})

export function readRadarConfig(config: RadarConfig | undefined): RadarSettings {
  return {
    enabled: config?.enabled?.get() ?? DEFAULT_RADAR.enabled,
    checkHours: config?.checkHours?.get() ?? DEFAULT_RADAR.checkHours,
    sources: {
      dependencies: config?.sources?.dependencies?.get() ?? true,
      localGit: config?.sources?.localGit?.get() ?? true,
      github: config?.sources?.github?.get() ?? true,
    },
  }
}
