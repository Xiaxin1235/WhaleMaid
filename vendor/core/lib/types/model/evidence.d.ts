import { z } from 'zod';
export declare const EvidenceSchema: z.ZodObject<{
    id: z.core.$ZodBranded<z.ZodString, "EvidenceId", "out">;
    runId: z.core.$ZodBranded<z.ZodString, "RunId", "out">;
    kind: z.ZodEnum<{
        file: "file";
        "test-report": "test-report";
        diff: "diff";
        metric: "metric";
        log: "log";
    }>;
    path: z.ZodOptional<z.ZodString>;
    hash: z.ZodOptional<z.ZodString>;
    summary: z.ZodString;
    verdict: z.ZodEnum<{
        UNKNOWN: "UNKNOWN";
        PASS: "PASS";
        FAIL: "FAIL";
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
        NOT_SCORABLE: "NOT_SCORABLE";
    }>;
}, z.core.$strict>;
export type Evidence = z.infer<typeof EvidenceSchema>;
