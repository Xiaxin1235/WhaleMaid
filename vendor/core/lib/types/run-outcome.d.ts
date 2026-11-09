import type { TaskState } from './model/common.js';
/** Turn completion is execution evidence only; acceptance is a later, independent step. */
export declare function runEndToTaskState(run: {
    endReason?: string | null | undefined;
    endSource?: string | null | undefined;
    reason?: string | undefined;
}): {
    state: TaskState;
    reason: string;
};
