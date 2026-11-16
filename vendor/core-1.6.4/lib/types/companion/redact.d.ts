/** Replacement shown wherever a secret-looking value was removed. */
export declare const REDACTED = "[\u5DF2\u9690\u85CF]";
/** Hide secret-looking substrings before a transcript reaches the companion model. */
export declare function redactSecrets(text: string): string;
