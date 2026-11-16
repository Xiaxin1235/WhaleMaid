import { z } from 'zod';
import type { TranscriptEvent } from './transcript.js';
import type { Locale } from '../i18n/index.js';
export declare const JournalKindSchema: z.ZodEnum<{
    conversation: "conversation";
    experience: "experience";
}>;
export declare const JOURNAL_LIMIT = 300;
/** Oldest excess identities within one kind; host supplies only the persisted metadata. */
export declare function journalOverflow(rows: readonly {
    id: string;
    createdAt: number;
}[]): string[];
/** Unconfirmed recollections are data, separate from memories and authorization. */
export declare const CompanionJournalSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"conversation">;
    sessionId: z.ZodString;
    fromSeq: z.ZodInt;
    toSeq: z.ZodInt;
    id: z.ZodString;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    createdAt: z.ZodInt;
    status: z.ZodEnum<{
        active: "active";
        deleted: "deleted";
    }>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"experience">;
    refs: z.ZodArray<z.ZodString>;
    id: z.ZodString;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    sessionId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodInt;
    status: z.ZodEnum<{
        active: "active";
        deleted: "deleted";
    }>;
}, z.core.$strict>], "kind">;
export type CompanionJournal = z.infer<typeof CompanionJournalSchema>;
export declare const RecallDraftSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    skip: z.ZodLiteral<true>;
}, z.core.$strict>, z.ZodObject<{
    skip: z.ZodOptional<z.ZodUndefined>;
    text: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
}, z.core.$strict>], "skip">;
export declare const RecallQuerySchema: z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<{
        conversation: "conversation";
        experience: "experience";
    }>>;
    query: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
/** Stable date and literal text, escaping prompt-variable delimiters without interpreting content. */
export declare function journalLine(row: CompanionJournal): string;
/** Five of each kind, under a shared code-unit budget including the data-only preamble. */
export declare function renderRecall(rows: readonly CompanionJournal[], locale: Locale): string;
/** Literal retrieval, bounded by the complete JSON result, with dates and explicit truncation. */
export declare function searchRecall(rows: readonly CompanionJournal[], query: z.infer<typeof RecallQuerySchema>): {
    items: {
        id: string;
        kind: CompanionJournal["kind"];
        date: string;
        text: string;
    }[];
    total: number;
    truncated: boolean;
};
/** Only new human/assistant text from the supplied companion session; no tool or injected user sources. */
export declare function recallInput(events: readonly TranscriptEvent[], afterSeq: number): {
    seq: number;
    role: string;
    text: string;
}[];
/** Fixed-format structured experiences, never model-authored prose or action requests. */
export declare function experienceText(locale: Locale, action: string, outcome: string, title: string, at: number): string;
