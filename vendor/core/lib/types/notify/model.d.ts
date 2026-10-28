import { z } from 'zod';
export declare const NotificationPreferencesSchema: z.ZodObject<{
    quietHours: z.ZodOptional<z.ZodObject<{
        start: z.ZodString;
        end: z.ZodString;
    }, z.core.$strict>>;
    maxPerHour: z.ZodDefault<z.ZodInt>;
    muted: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export declare const UserNoteSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    notificationId: z.ZodOptional<z.core.$ZodBranded<z.ZodString, "NotificationId", "out">>;
    source: z.ZodOptional<z.ZodEnum<{
        companion: "companion";
        decision: "decision";
    }>>;
    at: z.ZodNumber;
    text: z.ZodString;
}, z.core.$strict>;
export declare const NotificationChoiceSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    notificationId: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
    suggestionId: z.ZodString;
    reason: z.ZodString;
    action: z.ZodString;
    source: z.ZodEnum<{
        panel: "panel";
        inbox: "inbox";
    }>;
    at: z.ZodNumber;
    result: z.ZodEnum<{
        succeeded: "succeeded";
        failed: "failed";
        pending: "pending";
    }>;
    detail: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type NotificationChoice = z.infer<typeof NotificationChoiceSchema>;
export declare const InboxSessionSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    at: z.ZodNumber;
}, z.core.$strict>;
export declare const DeliveryRecordSchema: z.ZodObject<{
    id: z.ZodString;
    goalId: z.core.$ZodBranded<z.ZodString, "GoalId", "out">;
    notificationId: z.core.$ZodBranded<z.ZodString, "NotificationId", "out">;
    at: z.ZodNumber;
    result: z.ZodEnum<{
        cancelled: "cancelled";
        failed: "failed";
        started: "started";
        answered: "answered";
    }>;
    detail: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
