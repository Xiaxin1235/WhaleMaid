import { z } from 'zod';
import { CompanionActionSchema } from '../companion/actions.js';
import { GoalIdSchema, TaskIdSchema } from '../model/ids.js';
export const DETECTORS = [
    'repeatedFailure',
    'stallWarning',
    'noAcceptance',
    'budgetBurn',
    'pendingBacklog',
    'idleGoal',
    'leftovers',
];
export const DetectorSchema = z.enum(DETECTORS);
export const LEVELS = ['L0', 'L1', 'L2', 'L3'];
export const InitiativeLevelSchema = z.enum(LEVELS);
export const DETECTOR_LEVELS = {
    repeatedFailure: 'L2',
    stallWarning: 'L2',
    noAcceptance: 'L1',
    budgetBurn: 'L3',
    pendingBacklog: 'L2',
    idleGoal: 'L1',
    leftovers: 'L1',
};
export const INITIATIVE_DAY = 86400000;
export const INITIATIVE_TTL = 7 * INITIATIVE_DAY;
export const INITIATIVE_NOTIFICATION_KIND = 'initiative';
export const DetectorSettingsSchema = z.strictObject({
    enabled: z.boolean(),
    maxLevel: InitiativeLevelSchema,
});
export const InitiativeSettingsSchema = z.strictObject({
    enabled: z.boolean(),
    detectors: z.record(DetectorSchema, DetectorSettingsSchema),
    channels: z.strictObject({ brief: z.boolean(), cards: z.boolean(), asks: z.boolean() }),
});
export function defaultInitiativeSettings() {
    return InitiativeSettingsSchema.parse({
        enabled: true,
        detectors: Object.fromEntries(DETECTORS.map((id) => [id, { enabled: true, maxLevel: DETECTOR_LEVELS[id] }])),
        channels: { brief: true, cards: false, asks: false },
    });
}
export const OpportunityEvidenceSchema = z.strictObject({
    kind: z.enum(['goal', 'task', 'verification', 'run', 'notification']),
    id: z.string().min(1),
    commandIndex: z.int().nonnegative().optional(),
    hash: z.string().optional(),
});
export const OpportunitySchema = z.strictObject({
    id: z.string().min(1),
    detector: DetectorSchema,
    subject: z.strictObject({ goalId: GoalIdSchema.optional(), taskId: TaskIdSchema.optional() }),
    dedupeKey: z.string().min(1),
    evidence: z.array(OpportunityEvidenceSchema).max(12),
    summary: z.string(),
    score: z.number().min(0).max(1),
    level: InitiativeLevelSchema,
    actions: z.array(CompanionActionSchema),
    status: z.enum(['open', 'delivered', 'accepted', 'snoozed', 'dismissed', 'muted', 'expired']),
    createdAt: z.number(),
    expiresAt: z.number(),
    outcomeAt: z.number().optional(),
});
export function resolveLevel(candidate, settings) {
    const detector = settings.detectors[candidate.detector];
    if (!settings.enabled || !detector.enabled || candidate.score < 0.3)
        return 'L0';
    const ceiling = Math.min(LEVELS.indexOf(DETECTOR_LEVELS[candidate.detector]), LEVELS.indexOf(detector.maxLevel));
    const level = LEVELS[ceiling];
    if ((level === 'L3' && !settings.channels.asks) || (level === 'L2' && !settings.channels.cards))
        return settings.channels.brief ? 'L1' : 'L0';
    return level === 'L1' && !settings.channels.brief ? 'L0' : level;
}
/** A future delivery can use this factor without changing an already-open finding's score. */
export function opportunityNovelty(now, previous) {
    if (now < (previous?.cooldownUntil ?? 0))
        return 0;
    return Math.max(0, 1 - Math.max(0, (previous?.snoozedUntil ?? now) - now) / INITIATIVE_TTL);
}
//# sourceMappingURL=model.js.map