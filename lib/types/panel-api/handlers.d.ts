import { z } from 'zod';
import { LanguageResponseSchema } from './contract.js';
import type { PanelStatus } from './contract.js';
/** Pure validation/projection. The adapter supplies live host facts, never wire-supplied facts. */
export declare function status(input: unknown, snapshot: PanelStatus): PanelStatus;
export declare function goals(input: unknown, records: unknown): {
    id: string & z.core.$brand<"GoalId">;
    title: string;
    objective: string;
    expectedOutcome: string;
    projectRoot: string;
    acceptance: string[];
    stopConditions: string[];
    mode: "suggest" | "autonomous" | "high";
    status: "completed" | "cancelled" | "draft" | "active" | "paused" | "succeeded";
    autopilot: {
        enabled: boolean;
        enabledAt?: number | undefined;
        disabledReason?: string | undefined;
    };
    createdAt: number;
    version: number;
    inboxSessionId?: string | undefined;
    scopeId?: (string & z.core.$brand<"ScopeId">) | undefined;
    confirmedAt?: number | undefined;
    stalled?: number | undefined;
}[];
export declare function languagePatch(input: unknown): {
    language: "zh-CN" | "en" | "auto";
};
export declare function panelError(code: string, message: string): {
    error: {
        code: string;
        message: string;
    };
};
export declare function failure(error: unknown): {
    error: {
        code: string;
        message: string;
    };
};
export { LanguageResponseSchema };
