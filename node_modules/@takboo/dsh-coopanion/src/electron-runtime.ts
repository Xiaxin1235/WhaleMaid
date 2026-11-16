import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { NativeStartError } from './desktop-lifecycle.ts';

const exec = promisify(execFile);
const installLimitMs = 120_000;
const mirrorUrl = 'https://registry.npmmirror.com/-/binary/electron/';
const mirrorKeys = ['npm_config_electron_mirror', 'NPM_CONFIG_ELECTRON_MIRROR', 'npm_package_config_electron_mirror', 'ELECTRON_MIRROR'];

export type RuntimeSourcePreference = 'auto' | 'official' | 'mirror';
export type RuntimeDownloadSource = 'official' | 'mirror' | 'custom';
export interface PreparedRuntime { executable: string; downloadSource?: RuntimeDownloadSource; }

function classify(error: unknown) {
  const value = error as { code?: string; killed?: boolean; stderr?: string } | undefined;
  const detail = `${value?.code ?? ''} ${value?.stderr ?? ''}`;
  if (value?.killed) return 'timeout';
  if (/\b(?:EACCES|EPERM|EBUSY|EROFS)\b/i.test(detail)) return 'access';
  if (/\bENOSPC\b/i.test(detail)) return 'disk';
  if (/ERR_DLOPEN_FAILED|native binding|failed to extract|checksum|integrity/i.test(detail)) return 'archive';
  if (/\b(?:EAI_AGAIN|ENOTFOUND|ECONN\w+|ETIMEDOUT|ENETUNREACH)\b|fetch failed|HTTPError|(?:status|response) code [45]\d\d|unable to verify the first certificate/i.test(detail)) return 'network';
  return 'other';
}

function failure(reason: ReturnType<typeof classify>, locale: string | undefined, both: boolean): NativeStartError {
  const zh = locale?.toLowerCase().startsWith('zh') ?? true;
  const hints = {
    timeout: ['下载或解压超时，检查网络后点击重启。', 'Download or extraction timed out. Check the connection, then select Restart.'],
    access: ['安装目录不可写或文件被占用，完全退出 Harness 后重开，再点击重启。', 'The install directory is locked or unwritable. Quit Harness completely, reopen it, then select Restart.'],
    disk: ['磁盘空间不足，腾出空间后点击重启。', 'Free up disk space, then select Restart.'],
    network: ['无法下载 Electron，检查网络连接或代理后点击重启。', 'Could not download Electron. Check the network connection or proxy, then select Restart.'],
    archive: ['下载的文件校验失败或无法解压，请检查系统阻止记录与安装包后重启。', 'The downloaded file failed verification or could not be extracted. Check system block logs and the package, then select Restart.'],
    other: ['检查安装日志或使用完整安装包重装后点击重启。', 'Check the installation log or reinstall the complete package, then select Restart.'],
  };
  const tried = both && (reason === 'network' || reason === 'timeout')
    ? zh ? '已尝试官方和国内镜像。' : 'Tried the official source and the mirror. '
    : '';
  // Installer output can contain local paths, mirror URLs and proxy settings.
  return new NativeStartError(`${zh ? '桌宠运行组件安装失败' : 'Could not install the desktop pet runtime'} (${reason}). ${tried}${hints[reason][zh ? 0 : 1]}`, false);
}

function installerEnvironment(source: RuntimeDownloadSource): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  for (const key of Object.keys(env)) {
    // Pin the installer to the version and checksums included in the Electron npm package.
    if (/^(?:(?:npm_config|npm_package_config)_)?electron_(?:custom_?version|use_?remote_?checksums)$/i.test(key) ||
      (source !== 'custom' && /^(?:(?:npm_config|npm_package_config)_)?electron_(?:mirror|custom_?dir|custom_?filename)$/i.test(key))) delete env[key];
  }
  if (source === 'mirror') env.ELECTRON_MIRROR = mirrorUrl;
  return env;
}

/** Prepare a verified Electron distribution before the native window is launched. */
export async function prepareElectronRuntime(
  signal?: AbortSignal, locale?: string, preference: RuntimeSourcePreference = 'auto',
  packageRoot?: string, attemptLimitMs = installLimitMs,
): Promise<PreparedRuntime> {
  signal?.throwIfAborted();
  let attempted = 0;
  try {
    const root = packageRoot ?? dirname(createRequire(import.meta.url).resolve('electron/package.json'));
    const override = process.env.ELECTRON_OVERRIDE_DIST_PATH;
    const dist = override || join(root, 'dist');
    const entry = process.platform === 'win32' ? 'electron.exe'
      : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
    const executable = join(dist, entry);
    const marker = join(root, 'path.txt');
    const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
    const ready = async () => {
      try {
        return (await stat(executable)).isFile() && (override || (
          (await readFile(marker, 'utf8')) === entry &&
          (await readFile(join(dist, 'version'), 'utf8')).trim().replace(/^v/, '') === version));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    };
    if (await ready()) return { executable };
    if (override) throw new Error('Configured Electron distribution is missing');
    // The installer writes the marker only after extraction completes.
    await rm(marker, { force: true });
    const sources: RuntimeDownloadSource[] = mirrorKeys.some(key => process.env[key]) ? ['custom']
      : preference === 'auto' ? ['official', 'mirror'] : [preference];
    const deadline = performance.now() + sources.length * attemptLimitMs;
    for (const source of sources) {
      signal?.throwIfAborted();
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0) throw failure('timeout', locale, attempted === 2);
      attempted++;
      try {
        const installer = exec(process.execPath, [join(root, 'install.js')], {
          cwd: root, env: installerEnvironment(source), windowsHide: true,
          signal, timeout: Math.min(attemptLimitMs, remaining), maxBuffer: 128 * 1024,
        });
        // An abort rejects execFile before the child releases its Windows handles.
        const closed = new Promise<void>(resolve => installer.child.once('close', () => resolve()));
        try { await installer; }
        finally { await closed; }
      } catch (error) {
        signal?.throwIfAborted();
        const reason = classify(error);
        if (reason === 'timeout' && await ready()) return { executable, downloadSource: source };
        if (attempted < sources.length && (reason === 'network' || reason === 'timeout')) continue;
        throw failure(reason, locale, attempted === 2);
      }
      signal?.throwIfAborted();
      if (!await ready()) throw new Error('Electron executable missing after installation');
      return { executable, downloadSource: source };
    }
    throw new Error('No Electron download source');
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof NativeStartError) throw error;
    throw failure(classify(error), locale, attempted === 2);
  }
}
