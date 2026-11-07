import { z } from 'zod';
import type { TaskKind } from '../model/common.js';
import type { CommandResult } from './parse.js';
export declare const JudgmentSchema: z.ZodObject<{
    verdict: z.ZodEnum<{
        UNKNOWN: "UNKNOWN";
        PASS: "PASS";
        FAIL: "FAIL";
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
        NOT_SCORABLE: "NOT_SCORABLE";
    }>;
    reasons: z.ZodArray<z.ZodString>;
    progress: z.ZodEnum<{
        unknown: "unknown";
        neutral: "neutral";
        improved: "improved";
        unchanged: "unchanged";
        regressed: "regressed";
    }>;
}, z.core.$strict>;
export type Judgment = z.infer<typeof JudgmentSchema>;
export interface ChangedFile {
    path: string;
    deleted?: boolean;
    addedLines?: string;
    before?: string;
    after?: string;
}
export interface JudgeInput {
    kind: TaskKind;
    endReason: string;
    deniedCalls: number;
    changedFiles: ChangedFile[];
    verifyCommands: string[];
    baseline?: CommandResult[];
    current?: CommandResult[];
    finalReplyNonempty: boolean;
}
/** Detect changes to acceptance machinery independently of the model's own account. */
export declare function acceptanceTampered(files: ChangedFile[], commands: string[]): boolean;
/** Judge measured evidence, never the model's completion claim. Report tasks have an explicit report-only rule. */
export declare function judge(input: JudgeInput): Judgment;
