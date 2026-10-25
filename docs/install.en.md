# Installing WhaleMaid

[中文](install.md) | English

For WhaleMaid 1.0.0. This guide is for someone obtaining the repository for the first time. Only the Windows installation workflow has been verified; macOS and Linux are unverified. See the [usage guide](usage.en.md) for features, defaults and permission boundaries.

## 1. Prerequisites

- An installed, working DeepSeek Harness Desktop **0.2.1-rc.2 or 0.2.1-rc.3**. Other versions are unsupported.
- Node.js **≥22.19**, Git, and the pnpm version specified in `package.json`. Run `corepack enable` to enable pnpm; Corepack may need to download that version on first use.
- Access to the private repository after it is created in P19. The remote repository does not exist yet; the URL below is the planned address.

The examples use PowerShell. Completely exit Harness and back up the target profile's configuration before installing or updating your everyday environment. Do not share keys, credential files or URLs containing login tokens.

## 2. Obtain and build the code

```powershell
git clone https://github.com/Xiaxin1235/WhaleMaid.git
Set-Location WhaleMaid
pnpm install --frozen-lockfile
pnpm build
```

The repository will be created as WhaleMaid in P19; cloning will then require access. Alternatively, download a Release source archive when available to you, extract it, and run the dependency-installation and build commands at its root. Whether an archive is available depends on the actual Release.

## 3. Create a fixed copy outside the repository

```powershell
$fixedCopy = Join-Path (Split-Path (Get-Location).Path -Parent) 'whalemaid-fixed'
pnpm --filter dsh-whalemaid deploy --legacy --prod "$fixedCopy"
```

This creates a sibling of the source repository. You can choose another **absolute path outside the repository**. Do not omit `--legacy`: pnpm 11's default deploy mode rejects the project's current workspace configuration.

Harness will link to this fixed copy. Later source edits or builds will not directly change the plugin in use; replace the copy deliberately when updating. For the first deployment, choose a destination that does not yet exist.

## 4. Confirm the profile and back it up

Confirm again that Harness is fully closed. The terminal used for everyday installation should not have `DSH_HOME` set:

```powershell
$env:DSH_HOME
```

There should be no output. If it points to a test directory, use a fresh terminal without that variable, or run `Remove-Item Env:DSH_HOME` after confirming you no longer need it. **Do not launch the Harness desktop application from a terminal with a test `DSH_HOME`.**

On Windows, the bundled CLI is normally at `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`. The default desktop profile is `desktop`. The examples use that name; change `$profile` if necessary, then inspect its directory and `dsh.profile.bundles` in `package.json`. A directory name alone does not prove installation succeeded.

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$profile = 'desktop'
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$backupDir = "$profileDir-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $backupDir | Out-Null
foreach ($name in @('package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml')) {
  $item = Join-Path $profileDir $name
  if (Test-Path -LiteralPath $item) { Copy-Item -LiteralPath $item -Destination $backupDir }
}
```

If you opened a new terminal, set `$fixedCopy` again to the absolute path created in step 3. If you use a custom DSH data root, verify your own profile location; do not switch real data to the default root merely to match these examples.

## 5. Install into Harness

```powershell
& $dsh plugin --profile $profile add "link:$fixedCopy"
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid installation failed; inspect the CLI output.' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

The list should include `dsh-whalemaid` and retain the existing Harness bundles. Check this CLI's `plugin --help` for command syntax; do not substitute an older, separately installed global `dsh`.

If the legacy `dsh-whaledot` package is installed, back up the same profile, run `& $dsh plugin --profile $profile remove dsh-whaledot`, then add the new package. This avoids loading two copies; existing data remains.

## 6. Start and use WhaleMaid

Launch Harness from the **Start menu** and open **WhaleMaid** in its sidebar. Check storage availability and required-service status, then try a small, noncritical project. You must confirm authorization for a goal draft; autopilot requires a separate opt-in. Installation alone does not start execution.

To reuse existing goals, memories and authorization, the renamed project retains the `whaledot` data directory and internal configuration identifiers; it does not automatically move data. The default data directory is `<DSH_HOME>\whaledot`, normally `%USERPROFILE%\.dsh\whaledot` when `DSH_HOME` is not customized. If `dataDir` is customized, use the location shown in the panel. Stop Harness before backing up the entire data directory.

Continue with [goal entry and authorization](usage.en.md#goal-entry-and-authorization) and [boundaries](../README.en.md#boundaries).

## 7. Update

Completely exit Harness and back up configuration and data. Pull the new code, or obtain a new source archive, then reinstall dependencies and build:

```powershell
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

Keep the old fixed copy as a rollback backup by moving it to another explicit location. Repeat step 3 to generate the new copy at the **original fixed-copy path**. Verify paths before deployment so you do not overwrite source or data. If the linked path remains the same, `plugin add` is unnecessary; restart Harness from the Start menu. Source-archive users do not run `git pull`.

## 8. Uninstall or roll back

Completely exit Harness, confirm the profile and environment, then run:

```powershell
& $dsh plugin --profile $profile remove dsh-whalemaid
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid removal failed; inspect the CLI output.' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

The list should no longer contain `dsh-whalemaid`. Removal does not automatically delete WhaleMaid data; you decide whether to keep, back up or delete it. Uninstalling also does not undo project side effects. Reconcile execution state as described in the [usage guide](usage.en.md).

If an update fails, stop Harness and restore the old fixed copy to the original linked path. For configuration problems, restore the step-4 backup. Verify files and paths before restoring, then launch from the Start menu.

## 9. Optional whale desktop pet

WhaleMaid does not require a desktop pet. For a desktop character, install [`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion) separately, following that project's instructions. It uses **AGPL-3.0-or-later**; its code, character packs and media are outside WhaleMaid's MIT distribution.

The upstream version may not include all UI integration for Da Fei Yu's dedicated conversations. Presentation depends on the installed version. Goals, the notification center and companion conversations remain available in Harness without the pet.

## 10. Troubleshooting and verification scope

| Issue                               | Action                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm deploy` rejects deployment    | Include `--legacy` and choose a fixed-copy directory outside the repository.                                                   |
| WhaleMaid is missing from the panel | Check for `dsh-whalemaid` in the target profile's bundles, verify build output exists, then fully restart Harness.             |
| Incompatible host version           | Only Desktop 0.2.1-rc.2 / rc.3 are supported. Do not extend declarations or grant version exemptions to force another version. |

The Windows rehearsal used a clean local clone, an isolated `DSH_HOME` and a temporary Web profile. It verified frozen dependency installation, building, fixed-copy deployment, CLI installation, host loading and removal; see the [P18B report, in Chinese](p18b-report.md). Enabling Corepack in its default install location, private GitHub authentication, Release downloads, everyday-profile backup and installation, Start-menu launch, actual updates and configuration rollback were not exercised in this rehearsal. macOS and Linux are unverified.
