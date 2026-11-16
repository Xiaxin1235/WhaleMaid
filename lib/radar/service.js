import { realpath } from 'node:fs/promises';
import { relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RADAR_DETECTOR_SOURCE, RADAR_SOURCES, INITIATIVE_HOUR, isWithinScopePath, normalizeScopePath, redactSecrets, } from '#whalemaid/core';
import { localDay } from '../autopilot/day.js';
import { productionIdGen, sha256 } from '../store/index.js';
import { RadarClient, RadarRequestError } from './client.js';
import { dependencyVersion, projectDependencies, record, registryExcerpt } from './dependencies.js';
import { githubMatcher, githubRepo, observeGitHub } from './github.js';
import { gitPreview, observeGit } from './git.js';
export class RadarService {
    store;
    scopes;
    ports;
    client;
    jobs = new Map();
    observed = new Set();
    excerpts = new Set();
    lifetime = new AbortController();
    unwatch;
    constructor(store, scopes, ports) {
        this.store = store;
        this.scopes = scopes;
        this.ports = ports;
        this.client = ports.client ?? new RadarClient();
        this.unwatch = store.watchInitiative(() => this.controlsChanged());
    }
    settings() {
        return this.ports.settings();
    }
    now() {
        return this.ports.now?.() ?? Date.now();
    }
    target(id) {
        const goal = this.store.goals.get(id);
        const scope = this.scopes.activeScopeFor(id);
        if (!goal || !scope || !['active', 'paused'].includes(goal.status))
            return undefined;
        return { goal, scope };
    }
    sameScope(subscription, target) {
        return (!!target && subscription.scopeId === target.scope.id && subscription.scopeHash === target.scope.hash);
    }
    active(subscription, source) {
        const settings = this.settings();
        return (!this.lifetime.signal.aborted &&
            this.store.status().state === 'ok' &&
            settings.enabled &&
            subscription.enabled &&
            settings.sources[source] &&
            subscription.sources[source] &&
            (source !== 'github' || !!subscription.repo) &&
            this.sameScope(subscription, this.target(subscription.id)));
    }
    async preview(id) {
        const target = this.target(id);
        if (!target)
            throw Error('radar-authorization-required');
        const root = await realpath(target.goal.projectRoot);
        if (relative(target.goal.projectRoot, root) !== '')
            throw Error('radar-project-root-moved');
        const [git, dependencies] = await Promise.all([
            gitPreview(root, this.lifetime.signal),
            projectDependencies(root, target.scope),
        ]);
        const live = this.target(id);
        if (live?.scope.hash !== target.scope.hash || live.scope.id !== target.scope.id)
            throw Error('radar-authorization-required');
        const snapshot = {
            goalId: id,
            scopeHash: target.scope.hash,
            dependencies,
            localGit: git.localGit,
            ...('repo' in git && git.repo ? { repo: git.repo } : {}),
        };
        return { ...snapshot, token: sha256.hash(JSON.stringify([target.scope.id, snapshot])) };
    }
    async subscribe(input) {
        if (!input.enabled) {
            const previous = this.store.radar.get(input.goalId);
            if (previous)
                this.store.radar.update({ ...previous, enabled: false });
            this.controlsChanged();
            this.ports.onFacts(input.goalId);
            return this.detail(input.goalId);
        }
        const preview = await this.preview(input.goalId);
        const target = this.target(input.goalId);
        if (!target || preview.token !== input.token || preview.scopeHash !== target.scope.hash)
            throw Error('radar-preview-changed');
        const repo = input.repo ? githubRepo(input.repo) : preview.repo;
        if ((input.repo && !repo) ||
            (input.sources.github && !repo) ||
            (input.sources.localGit && !preview.localGit) ||
            !RADAR_SOURCES.some((source) => input.sources[source]))
            throw Error('radar-invalid-sources');
        const previous = this.store.radar.get(input.goalId);
        const retained = previous && this.sameScope(previous, target) ? previous : undefined;
        const sources = {
            dependencies: input.sources.dependencies,
            localGit: input.sources.localGit,
            github: input.sources.github,
        };
        const dependencies = sources.dependencies ? preview.dependencies : [];
        const unchanged = retained &&
            retained.repo === repo &&
            RADAR_SOURCES.every((source) => retained.sources[source] === sources[source]) &&
            JSON.stringify(retained.dependencies) === JSON.stringify(dependencies);
        this.store.radar.update({
            ...retained,
            id: input.goalId,
            scopeId: target.scope.id,
            scopeHash: target.scope.hash,
            enabled: true,
            sources,
            repo,
            dependencies,
            confirmedAt: unchanged ? retained.confirmedAt : this.now(),
            revision: unchanged ? retained.revision : randomUUID(),
            daily: previous?.daily,
            lastNetworkAt: previous?.lastNetworkAt,
            lastAutomaticAt: previous?.lastAutomaticAt,
        });
        this.controlsChanged();
        this.ports.onFacts(input.goalId);
        return this.detail(input.goalId);
    }
    async detail(id) {
        if (!this.store.goals.get(id))
            throw Error('goal-not-found');
        const subscription = this.store.radar.get(id);
        const target = this.target(id);
        return {
            settings: this.settings(),
            subscribed: !!subscription?.enabled && this.sameScope(subscription, target),
            ...(subscription ? { subscription } : {}),
            eligible: !!target,
            hold: this.hold(id),
            observations: this.store.radar.observations(id).slice(-12).reverse(),
            credentialConfigured: await this.ports.credentials.status().catch(() => false),
        };
    }
    metrics() {
        const first = new Date(this.now());
        first.setDate(first.getDate() - 6);
        const since = localDay(first.getTime());
        return this.store.radar
            .list()
            .flatMap((sub) => sub.daily ?? [])
            .filter((row) => row.day >= since)
            .reduce((sum, row) => ({
            checks: sum.checks + row.checks,
            passed: sum.passed + row.passed,
            requests: sum.requests + row.requests,
        }), { checks: 0, passed: 0, requests: 0 });
    }
    async setCredential(value) {
        await this.ports.credentials.set(value).catch(() => {
            throw Error('radar-credential-unavailable');
        });
        return { configured: await this.ports.credentials.status().catch(() => false) };
    }
    hold(id) {
        const sub = this.store.radar.get(id);
        return sub && this.sameScope(sub, this.target(id)) ? sub.hold : undefined;
    }
    /** Called in the shared notification effect transaction. */
    settle(id, hash, choice, at) {
        const sub = this.store.radar.get(id);
        if (!sub || this.hold(id)?.hash !== hash)
            throw Error('radar-conflict-changed');
        this.store.radar.update({ ...sub, hold: undefined, acknowledged: hash, settled: { hash, at, choice } });
    }
    findingLive(id, detector, observationId) {
        const sub = this.store.radar.get(id);
        const observation = this.store.radar.observation(observationId);
        return (!!sub && observation?.revision === sub.revision && this.active(sub, RADAR_DETECTOR_SOURCE[detector]));
    }
    facts(goal) {
        const facts = { goal };
        const sub = this.store.radar.get(goal.id);
        if (!sub)
            return facts;
        const rows = this.store.radar.observations(goal.id);
        for (const source of RADAR_SOURCES) {
            if (source === 'localGit' && this.hold(goal.id)) {
                const held = rows.findLast((row) => row.git?.conflict?.hash === sub.hold?.hash);
                if (held)
                    facts.localGit = held;
            }
            else if (this.active(sub, source)) {
                const latest = rows.findLast((row) => !row.purpose && row.source === source && row.revision === sub.revision);
                if (latest && source !== 'localGit')
                    facts[source] = latest;
            }
        }
        return facts;
    }
    controlsChanged() {
        for (const job of [...this.jobs.values(), ...this.excerpts]) {
            const sub = this.store.radar.get(job.id);
            if (!sub || sub.revision !== job.revision || !this.active(sub, job.source))
                job.abort.abort();
        }
    }
    observe(id) {
        void this.check(id).catch(() => this.ports.log());
    }
    async check(id, manual = false) {
        const sub = this.store.radar.get(id);
        if (!sub)
            return;
        const now = this.now();
        const interval = this.settings().checkHours * INITIATIVE_HOUR;
        const first = !this.observed.has(id);
        const due = manual ||
            ((first || sub.lastAutomaticAt === undefined || localDay(sub.lastAutomaticAt) !== localDay(now)) &&
                now >= (sub.lastNetworkAt ?? -Infinity) + interval);
        const retryAt = this.store.radar.observations(id).findLast((row) => row.source === 'github')?.retryAt;
        const sources = RADAR_SOURCES.filter((source) => this.active(sub, source) &&
            (source === 'localGit' || (due && (source !== 'github' || (retryAt ?? 0) <= now))));
        if (!sources.length)
            return;
        if (!manual)
            this.observed.add(id);
        if (sources.some((source) => source !== 'localGit' && !this.jobs.has(id + ':' + source)))
            this.store.radar.update({ ...sub, lastNetworkAt: now, ...(!manual ? { lastAutomaticAt: now } : {}) });
        await Promise.all(sources.map((source) => this.launch(sub, source, now)));
    }
    launch(sub, source, at) {
        const key = sub.id + ':' + source;
        const pending = this.jobs.get(key);
        if (pending && !pending.abort.signal.aborted)
            return pending.done;
        const abort = new AbortController();
        const job = { id: sub.id, source, revision: sub.revision, abort, done: Promise.resolve() };
        job.done = this.collect(sub, source, at, abort.signal).finally(() => {
            if (this.jobs.get(key) === job)
                this.jobs.delete(key);
        });
        this.jobs.set(key, job);
        return job.done;
    }
    async collect(sub, source, at, signal) {
        const target = this.target(sub.id);
        if (!target || !this.active(sub, source))
            return;
        const observations = this.store.radar.observations(sub.id);
        const row = this.observation(sub, source, at);
        try {
            if (source === 'localGit') {
                const previous = observations.findLast((old) => old.revision === sub.revision && old.git)?.git;
                const runs = this.store.runs.all().filter((run) => run.status === 'running');
                const relevant = runs.filter((run) => this.store.tasks.get(run.taskId)?.goalId === sub.id);
                const known = new Set(this.store.goals
                    .list()
                    .filter((goal) => normalizeScopePath(goal.projectRoot) === normalizeScopePath(target.goal.projectRoot))
                    .flatMap((goal) => this.store.checkpoints.list(goal.id).map((checkpoint) => checkpoint.commit)));
                row.git = await observeGit({
                    root: target.goal.projectRoot,
                    scope: target.scope,
                    previous,
                    known,
                    runs: relevant,
                    worktreeRoot: this.ports.worktreeRoot,
                    couldHaveWritten: this.ports.couldHaveWritten,
                    runStillLive: this.ports.runStillLive,
                }, signal);
            }
            else if (source === 'dependencies') {
                row.versions = [];
                for (const dep of sub.dependencies) {
                    signal.throwIfAborted();
                    const name = encodeURIComponent(dep.name);
                    const url = new URL(dep.ecosystem === 'npm'
                        ? 'https://registry.npmjs.org/' + name
                        : 'https://pypi.org/pypi/' + name + '/json');
                    row.versions.push(await this.client.get(url, signal, row, (body) => dependencyVersion(dep, body)));
                }
            }
            else {
                const root = normalizeScopePath(target.goal.projectRoot);
                const paths = target.scope.allowedPaths.flatMap((path) => {
                    const normalized = normalizeScopePath(path);
                    return root && normalized && isWithinScopePath(normalized, root)
                        ? [normalized.slice(root.length + 1)]
                        : [];
                });
                for (const checkpoint of this.store.checkpoints.list(sub.id).slice(-8))
                    paths.push(...checkpoint.files.slice(0, 100));
                const titles = [target.goal.title, ...this.store.tasks.list(sub.id).map((task) => task.title)];
                const match = githubMatcher(titles, paths);
                const token = await this.ports.credentials.token();
                row.github = await observeGitHub(this.client, sub.repo, {
                    token,
                    partition: sha256.hash(JSON.stringify([sub.revision, titles, paths])),
                }, sub.confirmedAt, match, signal, row);
            }
        }
        catch (error) {
            row.failure =
                error instanceof RadarRequestError
                    ? error.reason
                    : source === 'localGit'
                        ? 'git-unavailable'
                        : 'check-failed';
            if (error instanceof RadarRequestError)
                row.retryAt = error.retryAt;
        }
        if (signal.aborted || this.lifetime.signal.aborted || this.store.status().state !== 'ok')
            return;
        const live = this.store.radar.get(sub.id);
        if (!live || live.revision !== sub.revision || !this.active(live, source))
            return;
        let conflict = row.git?.conflict;
        if (!this.ports.conflictEnabled() || conflict?.hash === live.acknowledged)
            conflict = undefined;
        if ((!conflict || live.hold) && row.git?.conflict)
            delete row.git.conflict;
        this.record(conflict && !live.hold ? { ...live, hold: { ...conflict, at } } : live, row);
        this.ports.onFacts(sub.id);
    }
    observation(sub, source, at) {
        return {
            id: productionIdGen.next('radar'),
            goalId: sub.id,
            revision: sub.revision,
            at,
            source,
            requests: 0,
            cacheHits: 0,
            etags: [],
        };
    }
    record(sub, row) {
        const day = localDay(row.at);
        const daily = (sub.daily ?? []).filter((entry) => entry.day !== day);
        const today = sub.daily?.find((entry) => entry.day === day);
        daily.push({
            day,
            checks: (today?.checks ?? 0) + Number(!row.purpose),
            passed: (today?.passed ?? 0) + Number(!row.purpose && !row.failure),
            requests: (today?.requests ?? 0) + row.requests,
        });
        daily.sort((a, b) => a.day.localeCompare(b.day));
        this.store.transaction(() => {
            this.store.radar.update({ ...sub, daily: daily.slice(-8) });
            this.store.radar.insert(row);
        });
    }
    /** Only an owner request for a stored evidence reference can read a remote excerpt. */
    async excerpt(id, ownerSignal) {
        const finding = this.store.opportunities.get(id);
        const goalId = finding?.subject.goalId;
        const ref = finding?.evidence.find((item) => item.kind === 'radar');
        if (!goalId || !ref?.hash)
            throw Error('radar-excerpt-unavailable');
        const sub = this.store.radar.get(goalId);
        const observed = this.store.radar.observation(ref.id);
        if (!sub ||
            observed?.goalId !== goalId ||
            observed.revision !== sub.revision ||
            !this.active(sub, observed.source))
            throw Error('radar-excerpt-unavailable');
        const dep = observed.versions?.find((item) => item.hash === ref.hash);
        const issue = observed.github?.related.find((item) => item.hash === ref.hash);
        if (!dep && !issue)
            throw Error('radar-excerpt-unavailable');
        const row = { ...this.observation(sub, observed.source, this.now()), purpose: 'excerpt' };
        const abort = new AbortController();
        const signal = AbortSignal.any([abort.signal, ownerSignal, this.lifetime.signal]);
        const job = {
            id: goalId,
            source: observed.source,
            revision: sub.revision,
            abort,
            done: Promise.resolve(),
        };
        let excerpt = '';
        job.done = (async () => {
            try {
                if (dep) {
                    const name = encodeURIComponent(dep.name);
                    const version = encodeURIComponent(dep.latest);
                    const endpoint = dep.ecosystem === 'npm'
                        ? `https://registry.npmjs.org/${name}/${version}`
                        : `https://pypi.org/pypi/${name}/${version}/json`;
                    excerpt = await this.client.get(new URL(endpoint), signal, row, (body) => registryExcerpt(body, dep.ecosystem));
                }
                else if (issue && sub.repo) {
                    const token = await this.ports.credentials.token();
                    const endpoint = new URL(`https://api.github.com/repos/${sub.repo}/issues/${issue.number}`);
                    excerpt = await this.client.get(endpoint, signal, row, (body) => {
                        const data = record(body);
                        return typeof data.body === 'string' ? data.body.slice(0, 1200) : '';
                    }, { token, partition: sub.revision, cache: false });
                    if (token)
                        excerpt = excerpt.replaceAll(token, '[redacted]');
                }
            }
            catch (error) {
                row.failure = error instanceof RadarRequestError ? error.reason : 'check-failed';
                if (error instanceof RadarRequestError)
                    row.retryAt = error.retryAt;
            }
            const live = this.store.radar.get(goalId);
            if (!signal.aborted && live?.revision === sub.revision && this.active(live, observed.source))
                this.record(live, row);
        })();
        this.excerpts.add(job);
        try {
            await job.done;
            signal.throwIfAborted();
            if (row.failure)
                throw Error('radar-excerpt-unavailable');
            return { excerpt: redactSecrets(excerpt).slice(0, 600) };
        }
        finally {
            this.excerpts.delete(job);
        }
    }
    async dispose() {
        this.unwatch();
        this.lifetime.abort();
        this.client.dispose();
        const jobs = [...this.jobs.values(), ...this.excerpts];
        for (const job of jobs)
            job.abort.abort();
        await Promise.allSettled(jobs.map((job) => job.done));
    }
}
//# sourceMappingURL=service.js.map