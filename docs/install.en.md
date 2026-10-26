# Installing WhaleMaid

[中文](install.md) | English

For WhaleMaid 1.2.0. Core authorization and execution support Windows, macOS and Linux. The Linux pet uses X11 and requires `/usr/bin/python3` and libX11; Wayland pet behavior is not declared supported. See the [market release report](market-release-report.md) for evidence and the [usage guide](usage.en.md) for features and permission boundaries.

<a id="complete-installation"></a>

## Complete installation (recommended)

Install the prebuilt [WhaleMaid Complete 1.2.0 package](https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.0/dsh-whalemaid-full-1.2.0.tgz) through Harness **Plugins → Add plugin**. It installs WhaleMaid and its compatible Coopanion fork in one operation. No Git, pnpm or source build is needed for this route. Configure a model in Harness first.

Before upgrading from separate installations, fully exit Harness and back up the profile and data as described below. Remove the old top-level pet bundle with `dsh plugin --profile desktop remove @takboo/dsh-coopanion` and the old WhaleMaid bundle with `dsh plugin --profile desktop remove dsh-whalemaid`, then add the complete-package URL. Use Harness's bundled CLI, not an old global CLI. Do not delete data directories. The complete package owns both configuration nodes; only `dsh-whalemaid` needs to appear as a top-level bundle.

Updates use the next complete-package URL. Removing `dsh-whalemaid` removes both bundle nodes, while retaining stored data. Core services are MIT licensed; the automatically installed pet remains AGPL-3.0-or-later with its own source and notices.

The remaining instructions cover development from source and earlier separate installations.

## 1. Prerequisites

- An installed, working DeepSeek Harness Desktop **0.2.1-rc.2 or 0.2.1-rc.3**. Other versions are unsupported.
- Node.js **≥22.19**, Git, and the pnpm version specified in `package.json`. Run `corepack enable` to enable pnpm; Corepack may need to download that version on first use.
- The source is in the public GitHub repository [`Xiaxin1235/WhaleMaid`](https://github.com/Xiaxin1235/WhaleMaid).

The examples use PowerShell. Completely exit Harness and back up the target profile's configuration before installing or updating your everyday environment. Do not share keys, credential files or URLs containing login tokens.

## 2. Obtain and build the code

```powershell
git clone https://github.com/Xiaxin1235/WhaleMaid.git
Set-Location WhaleMaid
pnpm install --frozen-lockfile
pnpm build
```

Alternatively, download a source archive from the repository's Releases page, extract it, and run the dependency-installation and build commands at its root. Whether an archive is available depends on the actual Release.

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

On Windows, the bundled CLI is normally at `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`. The default desktop profile is `desktop`. The examples use that name; change `$dshProfile` if necessary, then inspect its directory and `dsh.profile.bundles` in `package.json`. A directory name alone does not prove installation succeeded.

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$dshProfile = 'desktop'
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$dshProfile"
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
& $dsh plugin --profile $dshProfile add "link:$fixedCopy"
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid installation failed; inspect the CLI output.' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

The list should include `dsh-whalemaid` and retain the existing Harness bundles. Check this CLI's `plugin --help` for command syntax; do not substitute an older, separately installed global `dsh`.

If the legacy `dsh-whaledot` package is installed, back up the same profile, run `& $dsh plugin --profile $dshProfile remove dsh-whaledot`, then add the new package. This avoids loading two copies; existing data remains.

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
& $dsh plugin --profile $dshProfile remove dsh-whalemaid
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid removal failed; inspect the CLI output.' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

The list should no longer contain `dsh-whalemaid`. Removal does not automatically delete WhaleMaid data; you decide whether to keep, back up or delete it. Uninstalling also does not undo project side effects. Reconcile execution state as described in the [usage guide](usage.en.md).

If an update fails, stop Harness and restore the old fixed copy to the original linked path. For configuration problems, restore the step-4 backup. Verify files and paths before restoring, then launch from the Start menu.

## 9. Optional whale desktop pet

WhaleMaid does not require a desktop pet. Without one, goals, the notification center, companion conversations and long-term memories remain available through Harness. The pet uses **AGPL-3.0-or-later**; its code, character packs and media are outside WhaleMaid's MIT distribution.

### Original vs companion build

WhaleMaid's own features (goals, autopilot, the notification center, Da Fei Yu conversations, memories, the daily brief, everyday auto-approval and calling Codex from conversations) do not depend on which pet you install; both work fully. The differences are on the pet side only. Compared against the original 0.4.14 (2026-10-25).

| Feature                             | Original `@takboo/dsh-coopanion` 0.4.14                                          | Companion build `Xiaxin1235/dsh-coopanion`                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Double-clicking the pet             | Opens the most recent session                                                    | Opens the dedicated Da Fei Yu conversation by default; can be switched to the most recent session |
| Dedicated Da Fei Yu session         | Treated as an ordinary session: not pinned, shows the internal working directory | Pinned and shown as "Da Fei Yu"; earlier ones marked as earlier chats; working directory hidden   |
| Approvals                           | Must be handled in Harness                                                       | "Allow once / Reject" in the envelope, with the redacted actual command and misclick protection   |
| Questions                           | Must be answered in Harness                                                      | Ordinary single-choice questions can be answered in the envelope                                  |
| Archived conversations              | Still listed; messages sent to them show as sent but never get a reply           | Not listed; when selected, input is disabled with restore instructions                            |
| Blank new-session drafts in Harness | Listed                                                                           | Hidden                                                                                            |
| Session names                       | Directory name or first message                                                  | Follow the Harness session title                                                                  |
| Quiet mode                          | None                                                                             | New messages only light the envelope, no popups                                                   |
| Reply emotion reactions             | None                                                                             | Optional, judged by the Decisions API; API key can be entered in **Settings → Desktop pet**       |
| Reply bubble                        | Shows the start of the reply                                                     | Prefers the first paragraph                                                                       |
| Fullscreen apps                     | May be covered by fullscreen windows                                             | Stays above fullscreen apps by default                                                            |
| Dismissed envelope items            | May reappear after a restart                                                     | Stay dismissed after a restart                                                                    |
| Task errors                         | Tears                                                                            | A brief worried look instead                                                                      |
| Interface style                     | Original style                                                                   | New apron-header style, with a switch back to the classic style                                   |
| Harness versions                    | rc.2 / rc.3 and earlier                                                          | Same as the original, including rc.3                                                              |

### Recommended: the WhaleMaid companion build

[`Xiaxin1235/dsh-coopanion`](https://github.com/Xiaxin1235/dsh-coopanion) is a fork of [takboo/dsh-coopanion](https://github.com/takboo/dsh-coopanion) with default branch `whaledot-local`. See the table above for what it adds over the original.

Build from source (needs Git and Node.js ≥22.19):

```powershell
git clone https://github.com/Xiaxin1235/dsh-coopanion.git
Set-Location dsh-coopanion
npm ci
npm run build
```

With Harness fully exited, in the terminal prepared in step 4 (`$dsh` and `$dshProfile` already set), run this inside that directory:

```powershell
& $dsh plugin --profile $dshProfile remove @takboo/dsh-coopanion   # only if the original pet was installed
& $dsh plugin --profile $dshProfile add "link:$((Get-Location).Path)"
```

Reopen Harness from the Start menu and check **Settings → Desktop pet**; first use downloads Electron. Ordinary chat uses the model configured in Harness.

This links the source directory directly, so do not delete or move it. To update, run `git pull`, `npm ci` and `npm run build` in that directory, then restart Harness.

Rehearsed: a clean clone of this fork checks out `whaledot-local` by default, and `npm ci` and `npm run build` succeed. The `link:` installation matches the author's everyday setup.

### Basic pet only

You can instead enter the original `@takboo/dsh-coopanion@0.4.14` in Harness under **Plugins → Add plugin** (插件 → 添加插件). As checked on 2026-10-25, [upstream package metadata](https://github.com/takboo/dsh-coopanion/blob/main/package.json) declares Desktop rc.2 / rc.3 support. The original lacks the integrations listed above.

## 10. Troubleshooting and verification scope

| Issue                               | Action                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm deploy` rejects deployment    | Include `--legacy` and choose a fixed-copy directory outside the repository.                                                   |
| WhaleMaid is missing from the panel | Check for `dsh-whalemaid` in the target profile's bundles, verify build output exists, then fully restart Harness.             |
| Incompatible host version           | Only Desktop 0.2.1-rc.2 / rc.3 are supported. Do not extend declarations or grant version exemptions to force another version. |

The Windows rehearsal used a clean local clone, an isolated `DSH_HOME` and a temporary Web profile. It verified frozen dependency installation, building, fixed-copy deployment, CLI installation, host loading and removal; see the [P18B report, in Chinese](p18b-report.md). Enabling Corepack in its default install location, cloning from GitHub, Release downloads, everyday-profile backup and installation, Start-menu launch, actual updates and configuration rollback were not exercised in this rehearsal. macOS and Linux are unverified.
