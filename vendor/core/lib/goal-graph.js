/** Validate dependency identity, goal ownership and acyclicity without modifying the task list. */
export function validateDag(tasks) {
    const byId = new Map();
    for (const task of tasks) {
        if (byId.has(task.id))
            return { ok: false, error: { code: 'duplicate-task-id', taskId: task.id } };
        byId.set(task.id, task);
    }
    const indegrees = new Map();
    const dependents = new Map();
    for (const task of tasks) {
        const dependencies = new Set(task.dependsOn);
        indegrees.set(task.id, dependencies.size);
        for (const dependencyId of dependencies) {
            const dependency = byId.get(dependencyId);
            if (!dependency) {
                return { ok: false, error: { code: 'dangling-dependency', taskId: task.id, dependencyId } };
            }
            if (dependency.goalId !== task.goalId) {
                return { ok: false, error: { code: 'cross-goal-dependency', taskId: task.id, dependencyId } };
            }
            const next = dependents.get(dependencyId) ?? [];
            next.push(task.id);
            dependents.set(dependencyId, next);
        }
    }
    const queue = tasks.filter((task) => indegrees.get(task.id) === 0).map((task) => task.id);
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        for (const dependent of dependents.get(id) ?? []) {
            const remaining = indegrees.get(dependent) - 1;
            indegrees.set(dependent, remaining);
            if (remaining === 0)
                queue.push(dependent);
        }
    }
    if (queue.length !== tasks.length) {
        return {
            ok: false,
            error: { code: 'cycle', taskIds: tasks.filter((t) => indegrees.get(t.id) > 0).map((t) => t.id) },
        };
    }
    return { ok: true, value: undefined };
}
function dependenciesSucceeded(task, byId) {
    return task.dependsOn.every((id) => byId.get(id)?.state === 'SUCCEEDED');
}
/** Return PENDING tasks eligible for promotion; an invalid graph yields no eligible tasks. */
export function readyTasks(tasks) {
    if (!validateDag(tasks).ok)
        return [];
    const byId = new Map(tasks.map((task) => [task.id, task]));
    return tasks.filter((task) => task.state === 'PENDING' && dependenciesSucceeded(task, byId));
}
const READ_ONLY_KINDS = ['analyze', 'research'];
const HOLDS_WRITE_SLOT = new Set(['RUNNING', 'VERIFYING', 'WAITING_APPROVAL', 'UNKNOWN', 'PAUSED']);
/** Select an oldest READY task; runningTasks must include all in-flight tasks in this project across goals. */
export function selectNextTask(goal, tasks, runningTasks, limits) {
    if (goal.status !== 'active')
        return { task: null, reason: 'goal-not-active' };
    if (!validateDag(tasks).ok)
        return { task: null, reason: 'invalid-graph' };
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const inFlightIds = new Set(runningTasks.filter((task) => HOLDS_WRITE_SLOT.has(task.state)).map((task) => task.id));
    const candidates = tasks
        .filter((task) => task.goalId === goal.id &&
        task.state === 'READY' &&
        !inFlightIds.has(task.id) &&
        dependenciesSucceeded(task, byId))
        .sort((a, b) => a.createdAt - b.createdAt);
    const writers = runningTasks.filter((task) => !READ_ONLY_KINDS.includes(task.kind) && HOLDS_WRITE_SLOT.has(task.state));
    // P01 never permits parallel project writers, even if a future persisted limit is greater than one.
    const writeSlotBusy = writers.length >= Math.min(1, limits.maxConcurrentWritePerProject);
    for (const task of candidates) {
        if (READ_ONLY_KINDS.includes(task.kind) || !writeSlotBusy)
            return { task, reason: 'selected' };
    }
    return { task: null, reason: candidates.length > 0 ? 'write-slot-busy' : 'no-ready-task' };
}
/** Build a collision-free stable key from goal, Unicode/whitespace-normalized title and kind. */
export function taskKey(goalId, normalizedTitle, kind) {
    const title = normalizedTitle.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
    return JSON.stringify([goalId, title, kind]);
}
/** Merge proposals in order, preserving a valid existing DAG and reporting each rejected proposal. */
export function mergeProposedTasks(goalId, existing, proposed) {
    const keys = new Set(existing.map((task) => taskKey(task.goalId, task.title, task.kind)));
    const ids = new Set(existing.map((task) => task.id));
    const merged = [...existing];
    const rejected = [];
    for (const task of proposed) {
        if (task.goalId !== goalId) {
            rejected.push({ task, reason: 'foreign-goal' });
            continue;
        }
        const key = taskKey(task.goalId, task.title, task.kind);
        if (keys.has(key) || ids.has(task.id)) {
            rejected.push({ task, reason: 'duplicate' });
            continue;
        }
        const candidate = { ...task, key, state: 'PENDING', attempts: 0, version: 0, createdBy: 'planner' };
        const validation = validateDag([...merged, candidate]);
        if (!validation.ok) {
            const reasons = {
                'duplicate-task-id': 'duplicate',
                'cross-goal-dependency': 'foreign-goal',
                'dangling-dependency': 'dangling-dependency',
                cycle: 'cycle',
            };
            rejected.push({ task, reason: reasons[validation.error.code] });
            continue;
        }
        keys.add(key);
        ids.add(task.id);
        merged.push(candidate);
    }
    return { tasks: merged, rejected };
}
//# sourceMappingURL=goal-graph.js.map