import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { join } from 'node:path'
import { codexEnvironment, nativePowerShellEnvironment } from '../packages/host/lib/codex/runner.js'
if (process.platform === 'win32') {
  const shell = join(
    process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  )
  await Promise.all(
    [
      ['host', process.env],
      ['system-modules', nativePowerShellEnvironment(codexEnvironment(process.env), shell)],
    ].map(async ([kind, env]) => {
      const start = Date.now()
      await new Promise((resolve) => {
        const child = execFile(
          shell,
          [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(
              "$ErrorActionPreference='Stop'; $nodes=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId); [Console]::WriteLine('probe-count='+$nodes.Count); exit 0",
              'utf16le',
            ).toString('base64'),
          ],
          { env, windowsHide: true, timeout: 20000 },
          (error, stdout) => {
            console.log(
              JSON.stringify({
                kind,
                elapsedMs: Date.now() - start,
                killed: error?.killed,
                code: error?.code,
                stdout,
              }),
            )
            resolve()
          },
        )
        child.stdin?.end()
      })
    }),
  )
}
