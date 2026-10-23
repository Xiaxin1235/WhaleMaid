# Start the isolated WhaleDot test host (DSH Desktop's own CLI, DSH_HOME=.dsh-dev).
# The API key is read without echo and lives only in this shell process.
# -UseUiKey: ignore any DEEPSEEK_API_KEY in the environment and use the key saved in the test UI settings.
param([string]$Profile = 'whaledot-p02', [switch]$UseUiKey)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$env:DSH_HOME = Join-Path $repo '.dsh-dev'
# dsh-coopanion keeps its Electron userData under %APPDATA%\DeepSeek Whale by default; a test pet
# sharing it with the everyday Harness pet makes both fight over window and companion state.
$env:DSH_PET_TEST_DATA_DIR = Join-Path $repo '.dsh-dev\pet-data'

if ($UseUiKey) { Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue }
else {
$prompt = if ($env:DEEPSEEK_API_KEY) { 'Paste DeepSeek API Key (hidden; Enter keeps the existing environment value)' }
          else { 'Paste DeepSeek API Key (hidden; Enter to skip)' }
& {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($plain) { $env:DEEPSEEK_API_KEY = $plain }
  Remove-Variable plain -ErrorAction SilentlyContinue
}
}

$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
Write-Host "DSH_HOME=$env:DSH_HOME profile=$Profile"
& $dsh --profile $Profile
Write-Host "dsh exited with code $LASTEXITCODE"
