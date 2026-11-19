/** The subset of a DSH session event the companion reads; anything else is ignored. */
export interface TranscriptEvent {
    type: string;
    seq: number;
    time?: number;
    data?: unknown;
}
export interface TranscriptMessage {
    seq: number;
    role: 'user' | 'assistant' | 'tool';
    text: string;
}
export interface TranscriptPage {
    messages: TranscriptMessage[];
    /** Pass as `beforeSeq` to read the preceding page; absent when the start was reached. */
    nextBeforeSeq?: number;
    truncated: boolean;
}
export interface TranscriptOptions {
    beforeSeq?: number;
    maxMessages?: number;
    maxChars?: number;
}
/** Latest messages before `beforeSeq`, newest kept, secrets redacted, bounded by count and characters. */
export declare function readTranscript(events: readonly TranscriptEvent[], options?: TranscriptOptions): TranscriptPage;
/** The latest `session/title` value, if the session has one. */
export declare function transcriptTitle(events: readonly TranscriptEvent[]): string | undefined;
