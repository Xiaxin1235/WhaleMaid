/** One watch denotes one execution. Rewatch explicitly to track another turn. */
export class RunTracker {
    clock;
    onRunEnded;
    runs = new Map();
    constructor(clock, onRunEnded) {
        this.clock = clock;
        this.onRunEnded = onRunEnded;
    }
    watch(sessionId, runId) {
        if (this.runs.has(sessionId))
            throw new Error(`Session already watched: ${sessionId}`);
        if ([...this.runs.values()].some((run) => run.runId === runId))
            throw new Error(`Run already watched: ${runId}`);
        this.runs.set(sessionId, {
            runId,
            sessionId,
            status: 'running',
            endReason: null,
            endSource: null,
            toolCalls: 0,
            startedAt: this.clock.now(),
            endedAt: null,
        });
    }
    unwatch(sessionId) {
        this.runs.delete(sessionId);
    }
    get(sessionId) {
        const run = this.runs.get(sessionId);
        return run && { ...run };
    }
    subscribe(source) {
        return source.subscribe((signal) => this.accept(signal));
    }
    accept(signal) {
        const run = this.runs.get(signal.sessionId);
        if (!run || run.status === 'ended')
            return;
        switch (signal.kind) {
            case 'turn-start':
                run.startedAt = this.clock.now();
                break;
            case 'tool-call':
                run.toolCalls++;
                break;
            case 'tool-result':
                break;
            case 'turn-end':
            case 'session-disposed':
                run.status = 'ended';
                run.endReason = signal.kind === 'session-disposed' ? 'unknown' : (signal.endReason ?? 'unknown');
                run.endSource = signal.kind;
                run.endedAt = this.clock.now();
                this.onRunEnded({ ...run });
                break;
        }
    }
}
//# sourceMappingURL=run-tracker.js.map