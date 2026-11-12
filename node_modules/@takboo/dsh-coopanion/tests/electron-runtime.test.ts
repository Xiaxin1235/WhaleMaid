import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareElectronRuntime, type RuntimeSourcePreference } from '../src/electron-runtime.ts';

const require = createRequire(import.meta.url);
const electron = require.resolve('electron/package.json');
const version: string = require(electron).version;
const entry = process.platform === 'win32' ? 'electron.exe'
  : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
const asset = `electron-v${version}-${process.platform}-${process.arch}.zip`;
const good = zipSync({ [entry]: Buffer.from('verified fixture'), version: Buffer.from(version) });
const corrupt = zipSync({ [entry]: Buffer.from('untrusted fixture'), version: Buffer.from(version) });
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let root: string, server: ReturnType<typeof createServer>, requests: string[], origin: string;
let responses: Record<string, 'ok' | 'corrupt' | 'hold' | 'unavailable'>;
let observed: (path: string) => void;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'coopanion-electron-test-'));
  requests = [];
  responses = {};
  observed = () => {};
  server = createServer((request, response) => {
    const path = request.url!;
    requests.push(path);
    observed(path);
    const source = path.split('/')[1]!;
    const result = responses[source] ?? 'unavailable';
    if (result === 'hold') return;
    if (result === 'unavailable') { response.writeHead(503).end(); return; }
    if (path.endsWith('SHASUMS256.txt')) { response.end(`${digest(corrupt)} *${asset}\n`); return; }
    response.end(result === 'ok' ? good : corrupt);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const key of Object.keys(process.env)) {
    if (/^(?:(?:npm_config|npm_package_config)_)?electron_/i.test(key)) vi.stubEnv(key, undefined);
  }
  const preload = join(root, 'fixture.mjs');
  await Promise.all([
    copyFile(join(dirname(electron), 'install.js'), join(root, 'install.js')),
    writeFile(join(root, 'package.json'), JSON.stringify({ version })),
    writeFile(join(root, 'checksums.json'), JSON.stringify({ [asset]: digest(good) })),
    writeFile(preload, `
const fetchArtifact = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input);
  if (url.hostname === 'github.com' && url.pathname.startsWith('/electron/electron/releases/download/')) {
    if (process.env.FIXTURE_INSTALL_ERROR) throw new Error(process.env.FIXTURE_INSTALL_ERROR);
    return fetchArtifact(${JSON.stringify(origin)} + '/official/' + url.pathname.split('/').slice(-2).join('/'), options);
  }
  if (url.hostname === 'registry.npmmirror.com') {
    return fetchArtifact(${JSON.stringify(origin)} + '/mirror/' + url.pathname.split('/').slice(-2).join('/'), options);
  }
  if (url.origin === ${JSON.stringify(origin)}) return fetchArtifact(input, options);
  throw new Error('unexpected download destination');
};`),
  ]);
  vi.stubEnv('NODE_OPTIONS', `--import=${pathToFileURL(preload).href}`);
  vi.stubEnv('NODE_PATH', dirname(dirname(electron)));
  vi.stubEnv('npm_config_arch', process.arch);
  vi.stubEnv('npm_config_platform', process.platform);
  vi.stubEnv('electron_config_cache', join(root, 'cache'));
  vi.stubEnv('FIXTURE_INSTALL_ERROR', undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

const install = (preference: RuntimeSourcePreference = 'auto', signal?: AbortSignal, timeout = 5_000) =>
  prepareElectronRuntime(signal, 'zh', preference, root, timeout);
const request = (source: string) => `/${source}/v${version}/${asset}`;

it('uses the checked mirror after a 503 and reuses the installed runtime', async () => {
  responses.mirror = 'ok';
  const prepared = await install();
  expect(prepared.downloadSource).toBe('mirror');
  expect(await readFile(prepared.executable, 'utf8')).toBe('verified fixture');
  expect(await install()).toEqual({ executable: prepared.executable });
  expect(requests).toEqual([request('official'), request('mirror')]);
});

it('tries the mirror after the official attempt times out', async () => {
  responses.official = 'hold';
  responses.mirror = 'ok';
  expect((await install('auto', undefined, 1600)).downloadSource).toBe('mirror');
  expect(requests).toEqual([request('official'), request('mirror')]);
});

it('reports two network failures without publishing the download addresses', async () => {
  const error = await install().catch(error => error as Error);
  expect(String(error)).toMatch(/\(network\).*已尝试官方和国内镜像/);
  expect(String(error)).not.toMatch(/https?:|127\.0\.0\.1/);
  expect(requests).toEqual([request('official'), request('mirror')]);
});

it('rejects a modified mirror ZIP before extraction even with remote checksums requested', async () => {
  responses.mirror = 'corrupt';
  vi.stubEnv('electron_use_remote_checksums', '1');
  vi.stubEnv('npm_config_electron_use_remote_checksums', '1');
  vi.stubEnv('ELECTRON_CUSTOM_VERSION', '1.0.0');
  await expect(install()).rejects.toThrow(/\(archive\).*下载的文件校验失败/);
  expect(requests).toEqual([request('official'), request('mirror')]);
  await expect(readFile(join(root, 'dist', entry))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(root, 'path.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([['EACCES', 'access'], ['ENOSPC', 'disk']])('does not switch sources on %s', async (code, category) => {
  vi.stubEnv('FIXTURE_INSTALL_ERROR', code);
  responses.mirror = 'ok';
  await expect(install()).rejects.toThrow(`(${category})`);
  expect(requests).toEqual([]);
});

it.each(['official', 'mirror'] as const)('uses only %s when selected', async source => {
  await expect(install(source)).rejects.toThrow('(network)');
  expect(requests).toEqual([request(source)]);
});

it('respects a user mirror and its path overrides without adding built-in sources', async () => {
  vi.stubEnv('ELECTRON_MIRROR', `${origin}/custom/`);
  vi.stubEnv('ELECTRON_CUSTOM_DIR', 'release-{{ version }}');
  vi.stubEnv('ELECTRON_CUSTOM_FILENAME', 'custom-name.zip');
  await expect(install('mirror')).rejects.toThrow('(network)');
  expect(requests).toEqual([`/custom/release-${version}/custom-name.zip`]);
});

it('cancels the installer while its mirror request is pending', async () => {
  responses.mirror = 'hold';
  const stop = new AbortController();
  const mirrorStarted = new Promise<void>(resolve => { observed = path => { if (path === request('mirror')) resolve(); }; });
  const outcome = install('auto', stop.signal).catch(error => error);
  await Promise.race([mirrorStarted, outcome.then(error => { throw error; })]);
  stop.abort();
  await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
  expect(requests).toEqual([request('official'), request('mirror')]);
  await expect(readFile(join(root, 'path.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});
