import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { defaultInitiativeSettings, DETECTORS, DETECTOR_LEVELS, LEVELS } from '@whalemaid/core'
import type { DetectorId, InitiativeLevel } from '@whalemaid/core'

export interface InitiativeConfig {
  enabled?: Volatile<boolean>
  detectors?: Partial<
    Record<DetectorId, { enabled?: Volatile<boolean>; maxLevel?: Volatile<InitiativeLevel> }>
  >
  channels?: { brief?: Volatile<boolean>; cards?: Volatile<boolean>; asks?: Volatile<boolean> }
}
export interface InitiativeConfigInput {
  enabled?: boolean
  detectors?: Partial<Record<DetectorId, { enabled?: boolean; maxLevel?: InitiativeLevel }>>
  channels?: { brief?: boolean; cards?: boolean; asks?: boolean }
}
const detector = (id: DetectorId) =>
  Schema.object({
    enabled: Schema.boolean().default(true).volatile(),
    maxLevel: Schema.union([...LEVELS])
      .default(DETECTOR_LEVELS[id])
      .volatile(),
  }).default({})

export const InitiativeConfigSchema = Schema.object({
  enabled: Schema.boolean().default(true).volatile(),
  detectors: Schema.object(Object.fromEntries(DETECTORS.map((id) => [id, detector(id)]))).default({}),
  channels: Schema.object({
    brief: Schema.boolean().default(true).volatile(),
    cards: Schema.boolean().default(false).volatile(),
    asks: Schema.boolean().default(false).volatile(),
  }).default({}),
}).default({})

export function readInitiativeConfig(config?: InitiativeConfig) {
  const settings = defaultInitiativeSettings()
  settings.enabled = config?.enabled?.get() ?? settings.enabled
  for (const id of DETECTORS) {
    const entry = config?.detectors?.[id]
    settings.detectors[id].enabled = entry?.enabled?.get() ?? settings.detectors[id].enabled
    settings.detectors[id].maxLevel = entry?.maxLevel?.get() ?? settings.detectors[id].maxLevel
  }
  for (const channel of ['brief', 'cards', 'asks'] as const)
    settings.channels[channel] = config?.channels?.[channel]?.get() ?? settings.channels[channel]
  return settings
}
