/** Exclusive file creation, with a separate exclusive guard serializing dead-owner takeover. */
export declare function acquireWriterLock(dataDir: string, startedAt: number, confirmedLock?: string): (() => void) | undefined;
