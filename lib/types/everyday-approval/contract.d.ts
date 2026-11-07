import { z } from 'zod';
export declare const EverydayApprovalRecordSchema: z.ZodObject<{
    at: z.ZodNumber;
    sessionId: z.ZodString;
    sessionName: z.ZodString;
    cwd: z.ZodString;
    command: z.ZodString;
    classification: z.ZodLiteral<"safe">;
}, z.core.$strict>;
export type EverydayApprovalRecord = z.infer<typeof EverydayApprovalRecordSchema>;
export declare const EverydayApprovalPanelSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    records: z.ZodArray<z.ZodObject<{
        at: z.ZodNumber;
        sessionId: z.ZodString;
        sessionName: z.ZodString;
        cwd: z.ZodString;
        command: z.ZodString;
        classification: z.ZodLiteral<"safe">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const EverydayApprovalSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    confirm: z.ZodOptional<z.ZodLiteral<true>>;
}, z.core.$strict>;
export declare function everydayApprovalCopy(locale: 'zh-CN' | 'en'): {
    title: string;
    history: string;
    description: string;
    risk: string;
    disable: string;
    empty: string;
    time: string;
    session: string;
    cwd: string;
    command: string;
    classification: string;
    safe: string;
};
