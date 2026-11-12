import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isPathAllowed } from '#whalemaid/core';
import semver from 'semver';
import { parse as parseToml } from 'smol-toml';
import { sha256 } from '../store/index.js';
export const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const list = (value) => (Array.isArray(value) ? value : []);
export const string = (value) => (typeof value === 'string' ? value : undefined);
const npmName = /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/i;
const pythonName = /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/i;
const pythonVersion = /^\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?$/i;
export function npmDependencies(value) {
    const pkg = record(value);
    return Object.entries({ ...record(pkg.devDependencies), ...record(pkg.dependencies) }).flatMap(([name, raw]) => {
        const range = string(raw)?.trim();
        if (!range ||
            range.length > 240 ||
            name.length > 214 ||
            !npmName.test(name) ||
            !semver.validRange(range))
            return [];
        const current = semver.minVersion(range)?.version;
        return [{ ecosystem: 'npm', name, range, current, exact: !!semver.valid(range) }];
    });
}
export function pythonDependency(requirement) {
    const clean = string(requirement)?.split(/\s+#/, 1)[0]?.split(';', 1)[0]?.trim();
    const match = clean?.match(/^([a-z\d][a-z\d._-]*)(?:\[[^\]]+\])?\s*(.*)$/i);
    const name = match?.[1]?.toLowerCase().replace(/[-_.]+/g, '-');
    const range = match?.[2]?.replace(/^\((.*)\)$/, '$1').trim();
    if (!name ||
        !pythonName.test(name) ||
        name.length > 214 ||
        range === undefined ||
        range.length > 240 ||
        (range && !/^(?:[~^<>=!*]|\d)[\w\d.^~<>=!*, |+-]*$/.test(range)))
        return [];
    const pinned = range.match(/^(?:===?|)(\d[^\s,]*)$/)?.[1];
    const baseline = pinned ?? range.match(/^(?:>=|>|~=|\^|~)(\d[^\s,]*)/)?.[1];
    const current = baseline && pythonVersion.test(baseline) ? baseline : undefined;
    return [{ ecosystem: 'pypi', name, range, current, exact: !!(pinned && current) }];
}
export function tomlDependencies(text) {
    const value = parseToml(text);
    const project = list(record(value.project).dependencies).flatMap(pythonDependency);
    const poetry = record(record(value.tool).poetry);
    const main = Object.entries(record(poetry.dependencies)).flatMap(([name, raw]) => {
        if (name.toLowerCase() === 'python')
            return [];
        const fields = record(raw);
        if (fields.path || fields.git || fields.url || fields.source)
            return [];
        const version = string(raw) ?? string(fields.version);
        return version === undefined ? [] : pythonDependency(name + ' ' + version);
    });
    return [...project, ...main];
}
export async function projectDependencies(root, scope) {
    const filenames = [
        'package.json',
        'pyproject.toml',
        ...(await readdir(root))
            .filter((name) => /^requirements[^/\\]*\.txt$/i.test(name))
            .sort()
            .slice(0, 32),
    ];
    const found = new Map();
    for (const filename of filenames) {
        const path = join(root, filename);
        if (!isPathAllowed(scope, path))
            continue;
        try {
            const stat = await lstat(path);
            if (!stat.isFile() || stat.size > 1024 * 1024 || relative(path, await realpath(path)) !== '')
                continue;
            const handle = await open(path, 'r');
            let body;
            try {
                const buffer = Buffer.alloc(Math.min(stat.size + 1, 1024 * 1024 + 1));
                const { bytesRead } = await handle.read(buffer);
                if (bytesRead > stat.size)
                    continue;
                body = buffer.subarray(0, bytesRead).toString('utf8');
            }
            finally {
                await handle.close();
            }
            const text = body.replace(/^\uFEFF/, '');
            const dependencies = filename === 'package.json'
                ? npmDependencies(JSON.parse(text))
                : filename === 'pyproject.toml'
                    ? tomlDependencies(text)
                    : text.split(/\r?\n/).flatMap(pythonDependency);
            for (const dependency of dependencies) {
                const key = dependency.ecosystem + ':' + dependency.name;
                if (!found.has(key) || (dependency.exact && !found.get(key)?.exact))
                    found.set(key, dependency);
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw Error('manifest-unreadable');
        }
    }
    return [...found.values()];
}
function version(value, ecosystem) {
    if (!value)
        return undefined;
    if (ecosystem === 'npm')
        return semver.parse(value);
    if (!pythonVersion.test(value))
        return undefined;
    const match = value.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    return {
        major: Number(match?.[1]),
        minor: Number(match?.[2] ?? 0),
        patch: Number(match?.[3] ?? 0),
        prerelease: /(?:a|b|rc|\.dev)\d/i.test(value) ? [value] : [],
    };
}
export function registryExcerpt(body, ecosystem) {
    const metadata = ecosystem === 'pypi' ? record(record(body).info) : record(body);
    return [metadata.releaseNotes, metadata.changelog, metadata.summary, metadata.description]
        .flatMap((note) => (typeof note === 'string' && note.trim() ? [note.slice(0, 1200)] : []))
        .join('\n')
        .slice(0, 1200);
}
export function dependencyVersion(dependency, value) {
    const pkg = record(value);
    const npm = dependency.ecosystem === 'npm';
    const versions = record(pkg.versions);
    const rawLatest = string(npm ? record(pkg['dist-tags']).latest : record(pkg.info).version);
    const latest = rawLatest && rawLatest.length <= 240 ? rawLatest : undefined;
    const next = version(latest, dependency.ecosystem);
    const current = version(dependency.current, dependency.ecosystem);
    if (!latest || !next)
        throw Error('invalid-registry-response');
    const newer = !!current &&
        (!next.prerelease.length || !!current.prerelease.length) &&
        (npm
            ? semver.gt(latest, dependency.current)
            : next.major > current.major ||
                (next.major === current.major &&
                    (next.minor > current.minor || (next.minor === current.minor && next.patch > current.patch))));
    const crossing = !!current && (next.major > current.major || (next.major === 0 && next.minor > current.minor));
    const incompatible = newer && crossing && (dependency.exact || !npm || !semver.satisfies(latest, dependency.range));
    const metadata = npm ? record(versions[latest]) : record(pkg.info);
    const notes = [metadata.releaseNotes, metadata.changelog, metadata.summary, pkg.releaseNotes, pkg.changelog]
        .map((note) => string(note)?.slice(0, 8000) ?? '')
        .join('\n');
    const npmDeprecated = string(record(versions[dependency.current ?? '']).deprecated);
    const files = list(record(pkg.releases)[dependency.current ?? '']);
    const deprecated = dependency.exact &&
        (npm ? !!npmDeprecated : files.length > 0 && files.every((file) => record(file).yanked === true));
    return {
        ecosystem: dependency.ecosystem,
        name: dependency.name,
        current: dependency.current,
        latest,
        incompatible,
        breaking: newer && /\bbreaking\b|破坏性/i.test(notes),
        deprecated,
        hash: sha256.hash(JSON.stringify([dependency.name, dependency.current, latest, notes, npmDeprecated, deprecated])),
    };
}
//# sourceMappingURL=dependencies.js.map