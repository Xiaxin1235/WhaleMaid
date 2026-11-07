import Schema from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import type { DetectorId, InitiativeLevel } from '#whalemaid/core';
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
}
export declare const InitiativeConfigSchema: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    detectors: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
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
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    detectors: Schema<Schemastery.ObjectS<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        [k: string]: Schema<Schemastery.ObjectS<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: Schema<boolean, boolean, "volatile-defined">;
            maxLevel: Schema<"L0" | "L1" | "L2" | "L3", "L0" | "L1" | "L2" | "L3", "volatile-defined">;
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
}>>, "defined">;
export declare function readInitiativeConfig(config?: InitiativeConfig): {
    enabled: boolean;
    detectors: Record<"repeatedFailure" | "stallWarning" | "noAcceptance" | "budgetBurn" | "pendingBacklog" | "idleGoal" | "leftovers", {
        enabled: boolean;
        maxLevel: "L0" | "L1" | "L2" | "L3";
    }>;
    channels: {
        brief: boolean;
        cards: boolean;
        asks: boolean;
    };
};
