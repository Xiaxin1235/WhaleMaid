import { makeScope } from './fixtures.js'

// Synthetic policy isolates path-pattern matching. The real default id_rsa* also matches *.tmp/*.log.
export const gapScope = () => makeScope({ commandMode: 'trusted', protectedNames: ['.env', '*.key'] })
export const gapCommands = [
  ['forfiles /c "cmd /c del @file"', 'ask', 'delete'],
  ['rundll32 x.dll,Entry', 'deny', 'system-configuration'],
  ['regsvr32 x.dll', 'deny', 'system-configuration'],
  ['shutdown /s /t 0', 'deny', 'system-configuration'],
  ['Stop-Process -Name explorer -Force', 'ask', 'process-control'],
  ['git checkout .', 'ask', 'repository-delete'],
  ['git switch -f main', 'ask', 'repository-delete'],
  ['schtasks /create /tn x /tr calc', 'deny', 'system-configuration'],
  ['taskkill /f /im explorer.exe', 'ask', 'process-control'],
  ['npm uninstall lodash', 'ask', 'package-install'],
  ['del /q /s *.tmp', 'ask', 'recursive-delete'],
  ['Get-ChildItem *.log | % { Remove-Item $_ }', 'ask', 'delete'],
] as const
export const gapCounterCommands = [
  ['schtasks /query', 'allow'],
  ['git switch main', 'allow'],
  ['git checkout main', 'allow'],
  ['git checkout -b feat', 'allow'],
  ['npm ls', 'allow'],
  ['pnpm install --frozen-lockfile', 'ask'],
  ['forfiles /m *.txt /c "cmd /c echo @file"', 'allow'],
] as const
