/** Turn completion is execution evidence only; acceptance is a later, independent step. */
export function runEndToTaskState(run) {
    const reason = run.reason ?? run.endReason ?? 'unknown';
    if (run.endSource === 'session-disposed' || run.reason)
        return { state: 'UNKNOWN', reason };
    switch (run.endReason) {
        case 'completed':
            return { state: 'VERIFYING', reason };
        case 'error':
        case 'max-tokens':
            return { state: 'FAILED', reason };
        case 'blocked':
            return { state: 'WAITING_APPROVAL', reason };
        default:
            return { state: 'UNKNOWN', reason };
    }
}
//# sourceMappingURL=run-outcome.js.map