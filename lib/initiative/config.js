import Schema from '@deepseek-ai/schemastery';
import { defaultInitiativeSettings, DEFAULT_INITIATIVE_LIMITS, DETECTORS, DETECTOR_LEVELS, LEVELS, } from '#whalemaid/core';
import { z } from 'zod';
import { I1_DETECTORS, DetectorSettingsSchema } from '#whalemaid/core';
const I1PanelSnapshot = z.strictObject({
    enabled: z.boolean(),
    detectors: z.record(z.enum(I1_DETECTORS), DetectorSettingsSchema),
    channels: z.strictObject({ brief: z.boolean(), cards: z.literal(false), asks: z.literal(false) }),
});
/** I1 saved every field on any panel edit, even the disabled placeholder switches. */
export function isLegacyInitiativePanelSnapshot(raw) {
    return I1PanelSnapshot.safeParse(raw).success;
}
const detector = (id) => Schema.object({
    enabled: Schema.boolean().default(true).volatile(),
    maxLevel: Schema.union([...LEVELS])
        .default(DETECTOR_LEVELS[id])
        .volatile(),
}).default({});
export const InitiativeConfigSchema = Schema.object({
    enabled: Schema.boolean().default(true).volatile(),
    detectors: Schema.object(Object.fromEntries(DETECTORS.map((id) => [id, detector(id)]))).default({}),
    channels: Schema.object({
        brief: Schema.boolean().default(true).volatile(),
        cards: Schema.boolean().default(true).volatile(),
        asks: Schema.boolean().default(false).volatile(),
    }).default({}),
    limits: Schema.object({
        cardIntervalHours: Schema.natural()
            .min(1)
            .max(168)
            .default(DEFAULT_INITIATIVE_LIMITS.cardIntervalHours)
            .volatile(),
        cooldownDays: Schema.natural().min(1).max(30).default(DEFAULT_INITIATIVE_LIMITS.cooldownDays).volatile(),
    }).default({}),
    companion: Schema.object({ journal: Schema.boolean().default(true).volatile() }).default({}),
}).default({});
export function readInitiativeConfig(config, legacyPanelSnapshot = false) {
    const settings = defaultInitiativeSettings();
    settings.enabled = config?.enabled?.get() ?? settings.enabled;
    for (const id of DETECTORS) {
        const entry = config?.detectors?.[id];
        settings.detectors[id].enabled = entry?.enabled?.get() ?? settings.detectors[id].enabled;
        settings.detectors[id].maxLevel = entry?.maxLevel?.get() ?? settings.detectors[id].maxLevel;
    }
    for (const channel of ['brief', 'cards', 'asks'])
        settings.channels[channel] = config?.channels?.[channel]?.get() ?? settings.channels[channel];
    if (legacyPanelSnapshot)
        settings.channels.cards = true;
    for (const limit of ['cardIntervalHours', 'cooldownDays'])
        settings.limits[limit] = config?.limits?.[limit]?.get() ?? settings.limits[limit];
    settings.companion.journal = config?.companion?.journal?.get() ?? settings.companion.journal;
    return settings;
}
//# sourceMappingURL=config.js.map