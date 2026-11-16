import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
/** Local diagnostics never retain messages, tool arguments, results, or raw events. */
export class DebugLog {
    dataDir;
    signalsEnabled;
    maxBytes;
    constructor(dataDir, signalsEnabled = false, maxBytes = 1024 * 1024) {
        this.dataDir = dataDir;
        this.signalsEnabled = signalsEnabled;
        this.maxBytes = maxBytes;
    }
    signal(signal) {
        if (!this.signalsEnabled)
            return;
        const { sessionId, kind, at, toolName, endReason } = signal;
        this.append('signals.jsonl', { sessionId, kind, at, toolName, endReason });
    }
    host(message, error) {
        this.append('host.log', {
            at: Date.now(),
            message,
            ...(error instanceof Error ? { error: error.message } : {}),
        });
    }
    append(file, value) {
        try {
            const dir = join(this.dataDir, 'debug');
            mkdirSync(dir, { recursive: true });
            const path = join(dir, file);
            const line = JSON.stringify(value) + '\n';
            let size = 0;
            try {
                size = statSync(path).size;
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
            if (size > 0 && size + Buffer.byteLength(line) > this.maxBytes) {
                rmSync(path + '.1', { force: true });
                renameSync(path, path + '.1');
            }
            appendFileSync(path, line, { mode: 0o600 });
        }
        catch {
            // Diagnostic IO failure must not interrupt a DSH event or recurse into logging.
            console.error('[whaledot] diagnostic log unavailable');
        }
    }
}
//# sourceMappingURL=debug-log.js.map