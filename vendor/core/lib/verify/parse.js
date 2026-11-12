import { z } from 'zod';
export const CommandResultSchema = z.strictObject({
    command: z.string(),
    status: z.enum(['passed', 'failed', 'error', 'timeout']),
    exitCode: z.number().int().nullable(),
    counts: z
        .strictObject({
        passed: z.int().nonnegative(),
        failed: z.int().nonnegative(),
        skipped: z.int().nonnegative(),
    })
        .optional(),
    durationMs: z.number().nonnegative().optional(),
    logPath: z.string().optional(),
    hash: z.string().optional(),
    tail: z.string().optional(),
});
/** Read only known runner summary lines; exit status remains authoritative. */
export function parseCommandResult(input) {
    const status = input.timedOut
        ? 'timeout'
        : input.spawnError || input.signal || input.exitCode === null
            ? 'error'
            : input.exitCode === 0
                ? 'passed'
                : 'failed';
    // eslint-disable-next-line no-control-regex -- ANSI SGR is a known test-runner decoration.
    const output = (input.stdout + '\n' + input.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    const lines = output.split(/\r?\n/);
    let counts;
    for (const line of lines) {
        const summary = /^\s*(?:Tests\s*:?\s+|=+\s*)(.*?)(?:\s*=+)?\s*$/.exec(line);
        if (summary && /\d+\s+(?:passed|failed|skipped)/.test(summary[1])) {
            const found = [...summary[1].matchAll(/(\d+)\s+(passed|failed|skipped)/g)];
            counts = { passed: 0, failed: 0, skipped: 0 };
            for (const match of found)
                counts[match[2]] = Number(match[1]);
        }
    }
    // Mocha emits separate summary lines rather than a Tests/pytest header.
    if (!counts && lines.some((line) => /^\s*\d+ passing\s+\([^)]+\)\s*$/.test(line))) {
        counts = { passed: 0, failed: 0, skipped: 0 };
        for (const line of lines) {
            const match = /^\s*(\d+) (passing|failing|pending)(?:\s+\([^)]+\))?\s*$/.exec(line);
            if (match)
                counts[match[2] === 'passing' ? 'passed' : match[2] === 'failing' ? 'failed' : 'skipped'] = Number(match[1]);
        }
    }
    // Node's TAP reporter and terminal spec reporter use the same three summary counters.
    if (!counts) {
        const node = {};
        for (const line of lines) {
            const match = /^(?:#|ℹ)\s+(pass|fail|skipped)\s+(\d+)\s*$/.exec(line);
            if (match)
                node[match[1]] = Number(match[2]);
        }
        if (node.pass !== undefined && node.fail !== undefined && node.skipped !== undefined)
            counts = { passed: node.pass, failed: node.fail, skipped: node.skipped };
    }
    return { command: input.command, status, exitCode: input.exitCode, ...(counts ? { counts } : {}) };
}
//# sourceMappingURL=parse.js.map