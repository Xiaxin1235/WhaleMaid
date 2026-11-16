import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { isPathAllowed } from '#whalemaid/core';
import { sha256 } from '../store/index.js';
import { githubRepo } from './github.js';
const exec = promisify(execFile);
const oid = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const flags = [
    '--no-pager',
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    '-c',
    'core.quotePath=false',
];
function git(cwd, signal, args) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
    return exec('git', [...flags, ...args], {
        cwd,
        signal,
        env: {
            ...env,
            GIT_OPTIONAL_LOCKS: '0',
            GIT_NO_LAZY_FETCH: '1',
            GIT_ALLOW_PROTOCOL: '',
            GIT_TERMINAL_PROMPT: '0',
        },
        encoding: 'utf8',
        timeout: 3500,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
    }).then(({ stdout }) => stdout);
}
const gitOptional = (root, signal, args, absent = 1) => git(root, signal, args).catch((error) => {
    if (error.code === absent)
        return '';
    throw error;
});
async function checkout(root, signal) {
    const cwd = await realpath(root);
    if (relative(resolve(root), cwd) !== '')
        throw Error('project-root-moved');
    const actual = (await git(cwd, signal, ['rev-parse', '--show-toplevel'])).trim();
    if (relative(cwd, await realpath(actual)) !== '')
        throw Error('project-root-required');
    return cwd;
}
export async function gitPreview(root, signal) {
    try {
        const cwd = await checkout(root, signal);
        // Read the configured URL rather than applying Git URL rewrites.
        const origin = await gitOptional(cwd, signal, ['config', '--get', 'remote.origin.url']);
        return { localGit: true, repo: githubRepo(origin) };
    }
    catch {
        signal.throwIfAborted();
        return { localGit: false };
    }
}
function safePath(path) {
    return (path.length <= 1024 &&
        !/[\\:\p{Cc}]/u.test(path) &&
        path.split('/').every((part) => part && !['.', '..', '.git'].includes(part.toLowerCase())));
}
async function state(root, signal) {
    // Older Git versions can try a lazy fetch while resolving missing objects.
    const promisor = await gitOptional(root, signal, [
        'config',
        '--name-only',
        '--get-regexp',
        '^(extensions\\.partialclone|remote\\..*\\.promisor)$',
    ]);
    if (promisor.trim())
        throw Error('git-partial-clone');
    // Status can invoke a configured clean/process filter when it refreshes a changed path.
    const filters = await gitOptional(root, signal, ['config', '--name-only', '--get-regexp', '^filter\\.']);
    const names = [
        ...new Set(filters
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .flatMap((key) => {
            const name = key.match(/^filter\.([\w.-]+)\.(?:process|clean|smudge|required)$/i)?.[1];
            if (!name)
                throw Error('git-filter-unsupported');
            return [name];
        })),
    ];
    const overrides = names.flatMap((name) => [
        '-c',
        `filter.${name}.clean=`,
        '-c',
        `filter.${name}.process=`,
        '-c',
        `filter.${name}.required=false`,
    ]);
    const [head, ref, status] = await Promise.all([
        git(root, signal, ['rev-parse', '--verify', 'HEAD']).then((value) => value.trim()),
        gitOptional(root, signal, ['symbolic-ref', '-q', 'HEAD']).then((value) => value.trim()),
        git(root, signal, [
            ...overrides,
            'status',
            '--porcelain=v1',
            '-z',
            '--no-renames',
            '--untracked-files=all',
            '--ignore-submodules=all',
        ]),
    ]);
    if (!oid.test(head))
        throw Error('git-invalid-head');
    const entries = status
        .split('\0')
        .filter((line) => safePath(line.slice(3)))
        .slice(0, 100);
    const dirty = await Promise.all(entries.map(async (entry) => {
        const path = entry.slice(3);
        // Only name and stat metadata, including for a protected path.
        const stat = await lstat(join(root, path)).catch(() => undefined);
        return { path, hash: sha256.hash(JSON.stringify([entry, stat?.mtimeMs, stat?.ctimeMs, stat?.size])) };
    }));
    return { head, ...(ref && ref.length <= 240 && !/[\p{Cc}]/u.test(ref) ? { ref } : {}), dirty };
}
export async function observeGit(input, signal) {
    const root = await checkout(input.root, signal);
    const primary = await state(root, signal);
    const previous = input.previous?.head;
    const recent = input.previous?.dirty ?? [];
    const changed = primary.dirty.filter((entry) => !recent.some((old) => old.hash === entry.hash));
    const external = [];
    let commitPaths = [];
    const changedRef = !!input.previous && input.previous.ref !== primary.ref;
    if (previous && (previous !== primary.head || changedRef)) {
        const log = await git(root, signal, [
            'log',
            '--format=%H',
            '-n',
            '100',
            primary.head,
            '^' + previous,
            '--',
        ]);
        const commits = log
            .trim()
            .split(/\r?\n/)
            .filter((value) => oid.test(value));
        if (!commits.length && !input.known.has(primary.head))
            commits.push(primary.head);
        external.push(...commits.filter((commit) => !input.known.has(commit)));
        if (external.length && previous !== primary.head) {
            const paths = await git(root, signal, [
                'diff',
                '--no-ext-diff',
                '--no-textconv',
                '--name-only',
                '-z',
                '--no-renames',
                '--ignore-submodules=all',
                previous,
                primary.head,
                '--',
            ]);
            commitPaths = paths.split('\0').filter(safePath).slice(0, 100);
            if (external.length < commits.length) {
                // A mixed range may contain paths changed only by an owned checkpoint.
                const externalPaths = new Set();
                for (const commit of external.slice(0, 12)) {
                    const names = await git(root, signal, [
                        'diff-tree',
                        '--root',
                        '--no-commit-id',
                        '--no-renames',
                        '--name-only',
                        '-r',
                        '-m',
                        '-z',
                        commit,
                        '--',
                    ]);
                    for (const path of names.split('\0').filter(safePath))
                        externalPaths.add(path);
                }
                commitPaths = commitPaths.filter((path) => externalPaths.has(path));
            }
        }
    }
    const changes = [...new Set([...primary.dirty.map((entry) => entry.path), ...commitPaths])].slice(0, 100);
    const projectChanges = [...changed.map((entry) => entry.path), ...commitPaths];
    const withinProject = { ...input.scope, allowedPaths: [root] };
    const evidence = new Map();
    let before = previous ?? primary.head;
    let head = primary.head;
    for (const path of projectChanges) {
        const abs = join(root, path);
        const runTouches = input.runs.some((run) => input.runStillLive(run) && isPathAllowed(input.scope, abs));
        const protectedPath = !isPathAllowed(withinProject, abs);
        if ((runTouches || protectedPath) &&
            !input.runs.some((run) => relative(root, run.worktreePath) === '' && input.couldHaveWritten(run, abs)))
            evidence.set(path, changed.find((entry) => entry.path === path)?.hash ?? primary.head);
    }
    for (const run of input.runs) {
        if (!oid.test(run.baseCommit) || !input.runStillLive(run))
            continue;
        if (relative(join(input.worktreeRoot, input.scope.goalId), run.worktreePath) !== '')
            continue;
        const worktree = await checkout(run.worktreePath, signal);
        const live = await state(worktree, signal);
        if (!input.runStillLive(run))
            continue;
        if (live.head !== run.baseCommit && !input.known.has(live.head)) {
            const delta = await git(worktree, signal, [
                'diff',
                '--no-ext-diff',
                '--no-textconv',
                '--name-only',
                '-z',
                '--no-renames',
                '--ignore-submodules=all',
                run.baseCommit,
                live.head,
                '--',
            ]);
            for (const path of delta.split('\0').filter(safePath).slice(0, 100))
                if (!input.couldHaveWritten(run, join(worktree, path)))
                    evidence.set(path, live.head);
            if (input.runStillLive(run)) {
                before = run.baseCommit;
                head = live.head;
            }
        }
        if (!input.runStillLive(run))
            continue;
        for (const { path, hash } of live.dirty)
            if (!input.couldHaveWritten(run, join(worktree, path)))
                evidence.set(path, hash);
    }
    const paths = [...evidence.keys()].sort().slice(0, 100);
    const conflict = paths.length
        ? {
            previous: before,
            head,
            paths,
            hash: sha256.hash(JSON.stringify([before, head, paths.map((path) => [path, evidence.get(path)])])),
        }
        : undefined;
    return { ...primary, changes, external, ...(conflict ? { conflict } : {}) };
}
//# sourceMappingURL=git.js.map