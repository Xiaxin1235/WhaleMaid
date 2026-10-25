# WhaleMaid 安装说明

中文 | [English](install.en.md)

适用于 WhaleMaid 1.0.0。以下面向首次获取仓库的用户；只有 Windows 安装流程经过验证，macOS / Linux 尚未验证。功能、默认值和权限边界见[使用说明](usage.md)。

## 1. 准备环境

- 已安装并能正常使用 DeepSeek Harness Desktop **0.2.1-rc.2 或 0.2.1-rc.3**；不支持其他版本。
- Node.js **≥22.19**、Git，以及 `package.json` 指定版本的 pnpm。先运行 `corepack enable` 启用 pnpm；首次使用时 Corepack 可能需要下载该版本。
- 对 GitHub 仓库 `Xiaxin1235/WhaleMaid` 有访问权限（仓库目前为私有）。

下面的示例使用 PowerShell。在日常安装或更新前，完全退出 Harness，并备份目标 profile 的配置。不要把密钥、凭据文件或带登录 token 的网址发给别人。

## 2. 获取代码并构建

```powershell
git clone https://github.com/Xiaxin1235/WhaleMaid.git
Set-Location WhaleMaid
pnpm install --frozen-lockfile
pnpm build
```

也可从仓库的 Release 页面下载源码包，解压后在其根目录执行安装依赖和构建命令；源码包入口是否可用以实际 Release 为准。

## 3. 生成仓库外的固定副本

```powershell
$fixedCopy = Join-Path (Split-Path (Get-Location).Path -Parent) 'whalemaid-fixed'
pnpm --filter dsh-whalemaid deploy --legacy --prod "$fixedCopy"
```

示例把固定副本放在仓库的同级目录。也可换成其他**仓库外的绝对路径**。`--legacy` 不能省，pnpm 11 的默认 deploy 模式会拒绝本项目当前的工作区配置。

Harness 将链接这份固定副本。以后在源码仓库中修改代码或重新构建，不会直接改变正在使用的插件；更新时再有意替换副本。第一次部署应使用尚不存在的目标目录。

## 4. 确认 profile 并备份

再次确认 Harness 已完全退出。日常安装终端不应设置 `DSH_HOME`：

```powershell
$env:DSH_HOME
```

应无输出；如果它指向测试目录，换一个未设置该变量的新终端，或确认不再需要该变量后执行 `Remove-Item Env:DSH_HOME`。**不要从设有测试 `DSH_HOME` 的终端启动 Harness 桌面应用。**

Windows 下 Harness 自带 CLI 的默认位置是 `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`，桌面版默认 profile 名为 `desktop`。以下示例使用该名称；若你使用不同 profile，请替换 `$dshProfile`，并核对其目录和 `package.json` 中的 `dsh.profile.bundles`，不要只凭目录名推断安装结果。

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

如果打开了新终端，重新把 `$fixedCopy` 设置为第 3 步生成的固定副本绝对路径。使用自定义 DSH 数据根目录的用户应核对自己的 profile 路径；不要为了套用示例把真实数据切到默认目录。

## 5. 安装到 Harness

```powershell
& $dsh plugin --profile $dshProfile add "link:$fixedCopy"
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid 安装失败，请检查 CLI 输出。' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

bundles 列表应含 `dsh-whalemaid`，并保留原有 Harness bundles。命令以这份 CLI 的 `plugin --help` 为准；不要用另行安装的旧版全局 `dsh` 代替桌面版自带 CLI。

如果已安装旧包 `dsh-whaledot`，先在同一 profile 备份后执行 `& $dsh plugin --profile $dshProfile remove dsh-whaledot`，再添加新包，避免同时加载两份插件。已有数据保留。

## 6. 启动和首次使用

从**开始菜单**启动 Harness，打开侧栏的 **WhaleMaid** 面板。检查存储可用及所需服务状态，先在不重要的小项目上试用。目标草案必须经你确认授权；自动推进还需单独开启，不会因为安装就开始执行。

为复用已有目标、记忆和授权，改名后仍沿用 `whaledot` 数据目录及内部配置标识，不自动搬迁数据。默认数据目录为 `<DSH_HOME>\whaledot`；未自定义 `DSH_HOME` 时通常是 `%USERPROFILE%\.dsh\whaledot`。设置了自定义 `dataDir` 时以面板显示为准。备份数据前先停止 Harness，再备份整个数据目录。

下一步见[目标录入与授权](usage.md#目标录入与授权)及[使用边界](../README.md#使用边界)。

## 7. 更新

完全退出 Harness，备份配置和数据，然后拉取新代码（或获取新的源码包）、重新安装依赖并构建：

```powershell
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

保留旧固定副本作为回退备份，将其移到另一个明确的位置，再按第 3 步在**原固定副本路径**生成新副本。部署前核对路径，避免覆盖源码仓库或数据目录。保持链接路径不变时无需重新 `plugin add`；从开始菜单重新启动 Harness。源码包用户不用执行 `git pull`。

## 8. 卸载与回退

完全退出 Harness，在确认 profile 和环境变量后执行：

```powershell
& $dsh plugin --profile $dshProfile remove dsh-whalemaid
if ($LASTEXITCODE -ne 0) { throw 'WhaleMaid 卸载失败，请检查 CLI 输出。' }
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

列表应不再含 `dsh-whalemaid`。卸载不会自动删除 WhaleMaid 数据；是否保留、备份或删除由你决定。卸载也不负责撤回已产生的项目副作用，执行状态应按[使用说明](usage.md)核对。

更新失败时，停止 Harness 后恢复旧固定副本到原链接路径；配置异常时可恢复第 4 步备份。恢复前核对文件和路径，再从开始菜单启动。

## 9. 可选的鲸鱼桌宠

WhaleMaid 不依赖桌宠。需要桌面角色时，另行安装 [`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion)，安装方法以该项目说明为准。它采用 **AGPL-3.0-or-later**，代码、角色包和媒体不属于 WhaleMaid 的 MIT 分发内容。

上游版本未必包含与大肥鱼专属对话相关的全部界面配合，显示效果取决于所装版本。不安装桌宠仍可使用 Harness 中的目标、通知中心和伙伴会话。

## 10. 常见问题与验证范围

| 问题                   | 处理                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm deploy` 拒绝部署 | 确认带有 `--legacy`，且目标是仓库外的固定副本目录。                                        |
| 面板里看不到 WhaleMaid | 检查目标 profile 的 bundles 是否含 `dsh-whalemaid`，确认构建产物存在，再完全重启 Harness。 |
| 宿主版本不兼容         | 仅支持 Desktop 0.2.1-rc.2 / rc.3，不通过放宽声明或版本豁免套用其他版本。                   |

本次安装演练使用 Windows、干净的本地克隆、独立 `DSH_HOME` 和临时 Web profile，验证了冻结依赖安装、构建、固定副本、CLI 安装、宿主加载及卸载；详见 [P18B 报告](p18b-report.md)。默认位置的 Corepack 启用、私有 GitHub 认证、Release 下载、日常 profile 备份与安装、从开始菜单启动、实际更新和配置回退未在本次演练执行。macOS / Linux 未验证。
