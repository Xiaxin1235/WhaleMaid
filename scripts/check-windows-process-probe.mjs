import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { dirname, join } from 'node:path'
import { codexEnvironment } from '../packages/host/lib/codex/runner.js'

if (process.platform === 'win32') {
  const shell = join(
    process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  )
  const base = { ...codexEnvironment(process.env), PSModulePath: join(dirname(shell), 'Modules') }
  const safe = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE|AUTH/i.test(key),
    ),
  )
  const group = (pattern) => ({
    ...base,
    ...Object.fromEntries(Object.entries(safe).filter(([key]) => pattern.test(key))),
  })
  await Promise.all(
    [
      ['host', process.env],
      ['full-safe', safe],
      ['full-module-path', { ...base, PSModulePath: process.env.PSModulePath }],
      ['shell-runtime', group(/^(?:PS|POWERSHELL|DOTNET|COMPLUS|COR_)/i)],
      [
        'identity',
        group(/^(?:USER|HOME|LOGON|COMPUTER|SESSION|CLIENT|SYSTEM|WINDIR|PROGRAM|COMMON|ALLUSER|PUBLIC)/i),
      ],
      [
        'other-context',
        group(
          /^(?!PS|POWERSHELL|DOTNET|COMPLUS|COR_|USER|HOME|LOGON|COMPUTER|SESSION|CLIENT|SYSTEM|WINDIR|PROGRAM|COMMON|ALLUSER|PUBLIC)/i,
        ),
      ],
    ].map(async ([kind, env]) => {
      const started = Date.now()
      await new Promise((resolve) => {
        const script =
          "[Console]::WriteLine('probe-start'); $ErrorActionPreference='Stop'; $nodes=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId); [Console]::WriteLine('probe-count='+$nodes.Count); exit 0"
        const child = execFile(
          shell,
          [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64'),
          ],
          { env, windowsHide: true, timeout: 20000 },
          (error, stdout, stderr) => {
            console.log(
              JSON.stringify({
                kind,
                elapsedMs: Date.now() - started,
                code: error?.code,
                killed: error?.killed,
                signal: error?.signal,
                addedKeys: Object.keys(env)
                  .filter((key) => !(key in base))
                  .sort(),
                stdout,
                stderr,
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
