export interface CommandWord {
    value: string;
    raw: string;
    quoted: boolean;
}
/** Read literal words and shell boundaries; never evaluate substitutions or expressions. */
export declare function parseCommandText(line: string): {
    segments: CommandWord[][];
    reasons: string[];
};
