import Schema from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import type { DetectorId, InitiativeLevel } from '#whalemaid/core';
/** I1 saved every field on any panel edit, even the disabled placeholder switches. */
export declare function isLegacyInitiativePanelSnapshot(raw: unknown): boolean;
export interface InitiativeConfig {
    enabled?: Volatile<boolean>;
    detectors?: Partial<Record<DetectorId, {
        enabled?: Volatile<boolean>;
        maxLevel?: Volatile<InitiativeLevel>;
    }>>;
    channels?: {
        brief?: Volatile<boolean>;
        cards?: Volatile<boolean>;
        asks?: Volatile<boolean>;
    };
    limits?: {
        cardIntervalHours?: Volatile<number>;
        cooldownDays?: Volatile<number>;
    };
    companion?: {
        journal?: Volatile<boolean>;
    };
}
export interface InitiativeConfigInput {
    enabled?: boolean;
    detectors?: Partial<Record<DetectorId, {
        enabled?: boolean;
        maxLevel?: InitiativeLevel;
    }>>;
    channels?: {
        brief?: boolean;
        cards?: boolean;
        asks?: boolean;
    };
    limits?: {
        cardIntervalHours?: number;
        cooldownDays?: number;
    };
    companion?: {
        journal?: boolean;
    };
}
export declare const InitiativeConfigSchema: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    detectors: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, "defined">;
    }>>, "defined">;
    channels: Schema<Schemastery.ObjectS<NoInfer<{
        brief: Schema<boolean, boolean, "volatile-defined">;
        cards: Schema<boolean, boolean, "volatile-defined">;
        asks: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        brief: Schema<boolean, boolean, "volatile-defined">;
        cards: Schema<boolean, boolean, "volatile-defined">;
        asks: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
    limits: Schema<Schemastery.ObjectS<NoInfer<{
        cardIntervalHours: Schema<number, number, "volatile-defined">;
        cooldownDays: Schema<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        cardIntervalHours: Schema<number, number, "volatile-defined">;
        cooldownDays: Schema<number, number, "volatile-defined">;
    }>>, "defined">;
    companion: Schema<Schemastery.ObjectS<NoInfer<{
        journal: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        journal: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    detectors: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L2" | "L3" | "L0" | "L1", "L2" | "L3" | "L0" | "L1", "volatile-defined">;
        }>>, "defined">;
    }>>, "defined">;
    channels: Schema<Schemastery.ObjectS<NoInfer<{
        brief: Schema<boolean, boolean, "volatile-defined">;
        cards: Schema<boolean, boolean, "volatile-defined">;
        asks: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        brief: Schema<boolean, boolean, "volatile-defined">;
        cards: Schema<boolean, boolean, "volatile-defined">;
        asks: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
    limits: Schema<Schemastery.ObjectS<NoInfer<{
        cardIntervalHours: Schema<number, number, "volatile-defined">;
        cooldownDays: Schema<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        cardIntervalHours: Schema<number, number, "volatile-defined">;
        cooldownDays: Schema<number, number, "volatile-defined">;
    }>>, "defined">;
    companion: Schema<Schemastery.ObjectS<NoInfer<{
        journal: Schema<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        journal: Schema<boolean, boolean, "volatile-defined">;
    }>>, "defined">;
}>>, "defined">;
export declare function readInitiativeConfig(config?: InitiativeConfig, legacyPanelSnapshot?: boolean): {
    enabled: boolean;
    detectors: Record<"radarDependency" | "radarCI" | "radarConflict" | "radarRelated" | "repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
        enabled: boolean;
        maxLevel: "L2" | "L3" | "L0" | "L1";
    }>;
    channels: {
        brief: boolean;
        cards: boolean;
        asks: boolean;
    };
    limits: {
        cardIntervalHours: number;
        cooldownDays: number;
    };
    companion: {
        journal: boolean;
    };
};
