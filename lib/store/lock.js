import { mkdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const LockSchema = z.strictObject({
    pid: z.int().positive(),
    startedAt: z.int().nonnegative(),
    token: z.string().min(1).optional(),
});
/** Permission errors and PID reuse conservatively count as an active owner. */
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code !== 'ESRCH';
    }
}
/** Exclusive file creation, with a separate exclusive guard serializing dead-owner takeover. */
export function acquireWriterLock(dataDir, startedAt, confirmedLock) {
    const path = join(dataDir, 'whaledot.lock');
    const token = randomUUID();
    const content = JSON.stringify({ pid: process.pid, startedAt, token });
    function create() {
        try {
            writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
            return true;
        }
        catch (error) {
            if (error.code === 'EEXIST')
                return false;
            throw error;
        }
    }
    function ownerIsDead() {
        try {
            const row = LockSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
            // An incomplete/unknown lock is never grounds for stealing it.
            return row.success && !isAlive(row.data.pid);
        }
        catch {
            return false;
        }
    }
    if (!create()) {
        const canReplace = () => confirmedLock === undefined ? ownerIsDead() : readFileSync(path, 'utf8') === confirmedLock;
        if (!canReplace())
            return undefined;
        const guard = path + '.reclaim';
        try {
            const before = statSync(guard);
            if (startedAt - before.mtimeMs > 60000) {
                const current = statSync(guard);
                if (current.ino === before.ino &&
                    current.mtimeMs === before.mtimeMs &&
                    startedAt - current.mtimeMs > 60000)
                    rmdirSync(guard);
            }
        }
        catch (error) {
            if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? ''))
                throw error;
        }
        try {
            mkdirSync(guard);
        }
        catch (error) {
            if (error.code === 'EEXIST')
                return undefined;
            throw error;
        }
        try {
            // Recheck after winning the guard; another contender may already have replaced the owner.
            if (!canReplace())
                return undefined;
            unlinkSync(path);
            if (!create())
                return undefined;
        }
        finally {
            rmdirSync(guard);
        }
    }
    return () => {
        try {
            if (readFileSync(path, 'utf8') === content)
                unlinkSync(path);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    };
}
//# sourceMappingURL=lock.js.map