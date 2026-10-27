# WhaleMaid 安装说明

中文 | [English](install.en.md)

适用于 WhaleMaid 1.2.1。以下面向首次获取仓库的用户。核心授权与执行支持 Windows、macOS、Linux；Linux 桌宠使用 X11，需要 `/usr/bin/python3` 与 libX11，Wayland 桌宠未声明支持。验收范围见[市场发布报告](market-release-report.md)，功能和权限边界见[使用说明](usage.md)。

<a id="complete-installation"></a>

## 完整版安装（推荐）

最方便的是在 Harness 插件市场（[dsh-market](https://github.com/dsh-market/dsh-market#readme)）中搜索 **WhaleMaid** 一键安装；还没有插件市场时，先在 **插件 → 添加插件** 中填入 `dshmarket` 安装它。

**不要再单独安装任何版本的 Coopanion**（包括原版 `@takboo/dsh-coopanion`）：完整版已自带配套桌宠，两份桌宠同时启用会冲突。

也可以在 Harness **插件 → 添加插件** 中输入 [WhaleMaid 完整版 1.2.1 安装包](https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.1/dsh-whalemaid-full-1.2.1.tgz) 的链接。安装后按提示点击“立即启用”。一次安装自动带上适配版 Coopanion，无需另装前置插件，也无需 Git、pnpm 或自行构建。先在 Harness 中配置可用模型。

如果原来分别装过两个插件：完全退出 Harness，按下文备份 profile 配置及数据；使用桌面版自带 CLI，先运行 `dsh plugin --profile desktop remove @takboo/dsh-coopanion` 和 `dsh plugin --profile desktop remove dsh-whalemaid` 取消旧安装，再添加完整包链接。不要删除数据目录。新版由同一个完整包管理两个配置节点，顶层 bundles 只需含 `dsh-whalemaid`，无需另列桌宠依赖。

更新时安装下个完整包版本；卸载 `dsh-whalemaid` 会移除两部分配置，保留存储数据。WhaleMaid 自有代码使用 MIT，自动安装的桌宠依赖继续使用 AGPL-3.0-or-later，其对应源码和第三方声明保持独立。

下面保留源码开发及旧安装方式的操作说明。

## 1. 准备环境

- 已安装并能正常使用 DeepSeek Harness Desktop **0.2.1-rc.2 或 0.2.1-rc.3**；不支持其他版本。
- Node.js **≥22.19**、Git，以及 `package.json` 指定版本的 pnpm。先运行 `corepack enable` 启用 pnpm；首次使用时 Corepack 可能需要下载该版本。
- 源码位于公开的 GitHub 仓库 [`Xiaxin1235/WhaleMaid`](https://github.com/Xiaxin1235/WhaleMaid)。

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

> 本节只适用于从源码单独安装 WhaleMaid 的情况。使用[完整版](#complete-installation)时桌宠已经自动安装，不要再按本节另装任何版本的 Coopanion。

WhaleMaid 不依赖桌宠。没有桌宠时，仍可通过 Harness 使用目标、通知中心、伙伴对话和长期记忆。桌宠采用 **AGPL-3.0-or-later**，代码、角色包和媒体不属于 WhaleMaid 的 MIT 分发内容。

### 原版和修改版的差异

WhaleMaid 自己的功能（目标、自动推进、通知中心、大肥鱼对话、记忆、每日简报、日常自动审批、在对话中调用 Codex）与装哪个桌宠无关，两种都能完整使用。差别只在桌宠这一侧。以下对比基于原版 0.4.14（2026-10-25）。

| 功能                   | 原版 `@takboo/dsh-coopanion` 0.4.14            | 修改版 `Xiaxin1235/dsh-coopanion`                                  |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 双击桌宠               | 打开最近一个会话                               | 默认打开大肥鱼专属对话，可改为最近会话                             |
| 大肥鱼专属会话         | 当作普通会话，不置顶，显示内部工作目录         | 置顶并显示为“大肥鱼”，旧对话标注“旧对话”，隐藏工作目录             |
| 审批                   | 只能切回 Harness 处理                          | 可在信封里“允许一次 / 拒绝”，显示脱敏后的实际命令，带防误触        |
| 提问                   | 只能切回 Harness 回答                          | 普通单选提问可在信封里直接回答                                     |
| 已归档的对话           | 仍在列表中；向其发消息显示已发送，但不会有回复 | 不进列表；选中时禁用输入并说明如何恢复                             |
| Harness 空白新会话草稿 | 显示在列表中                                   | 不显示                                                             |
| 会话名                 | 工作目录名或第一句话                           | 跟随 Harness 的会话标题                                            |
| 安静模式               | 无                                             | 新消息只亮信封，不弹框                                             |
| 回复情绪表情           | 无                                             | 可选，经 Decisions API 判断；API Key 可在 **Settings → 桌宠** 填写 |
| 回复气泡               | 显示回复开头                                   | 优先显示第一段                                                     |
| 全屏应用               | 可能被全屏窗口盖住                             | 默认显示在全屏应用上方                                             |
| 信封里关掉的消息       | 重启后可能重新出现                             | 重启后不再出现                                                     |
| 任务出错               | 流泪                                           | 改为短暂的担心表情                                                 |
| 界面风格               | 原有样式                                       | 新的围裙头部样式，可切回经典样式                                   |
| Harness 版本           | rc.2 / rc.3 等                                 | 同原版，含 rc.3                                                    |

### 推荐：WhaleMaid 配套修改版

[`Xiaxin1235/dsh-coopanion`](https://github.com/Xiaxin1235/dsh-coopanion) 是 fork 自 [takboo/dsh-coopanion](https://github.com/takboo/dsh-coopanion) 的修改版，默认分支 `whaledot-local`。比原版多出的功能见上表。

从源码构建（需要 Git 和 Node.js ≥22.19）：

```powershell
git clone https://github.com/Xiaxin1235/dsh-coopanion.git
Set-Location dsh-coopanion
npm ci
npm run build
```

确认 Harness 已完全退出，在第 4 步准备好的终端里（已设置 `$dsh` 和 `$dshProfile`），于这个目录执行：

```powershell
& $dsh plugin --profile $dshProfile remove @takboo/dsh-coopanion   # 仅在装过原版时执行
& $dsh plugin --profile $dshProfile add "link:$((Get-Location).Path)"
```

从开始菜单重新打开 Harness，到 **Settings → 桌宠** 检查状态；首次使用需要下载 Electron。普通聊天沿用 Harness 中配置的模型。

这种方式直接链接源码目录，不要删除或移动它。更新时在目录里执行 `git pull`、`npm ci`、`npm run build`，再重启 Harness。

已演练：从这个 fork 干净克隆，默认取得 `whaledot-local` 分支，`npm ci` 和 `npm run build` 成功。以 `link:` 方式安装与作者日常环境的安装方式相同。

### 只要基础桌宠

也可以在 Harness 的 **插件 → 添加插件** 中输入原版 `@takboo/dsh-coopanion@0.4.14`（截至 2026-10-25，[上游包声明](https://github.com/takboo/dsh-coopanion/blob/main/package.json)支持 Desktop rc.2 / rc.3）。原版不含上面列出的配合功能。

## 10. 常见问题与验证范围

| 问题                   | 处理                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm deploy` 拒绝部署 | 确认带有 `--legacy`，且目标是仓库外的固定副本目录。                                        |
| 面板里看不到 WhaleMaid | 检查目标 profile 的 bundles 是否含 `dsh-whalemaid`，确认构建产物存在，再完全重启 Harness。 |
| 宿主版本不兼容         | 仅支持 Desktop 0.2.1-rc.2 / rc.3，不通过放宽声明或版本豁免套用其他版本。                   |

此前 P18B 的源码安装演练使用 Windows、干净的本地克隆、独立 `DSH_HOME` 和临时 Web profile，验证了冻结依赖安装、构建、固定副本、CLI 安装、宿主加载及卸载；详见 [P18B 报告](p18b-report.md)。默认位置的 Corepack 启用、从 GitHub 克隆、Release 下载、日常 profile 备份与安装、从开始菜单启动、实际更新和配置回退未在该次演练执行，macOS / Linux 当时也未验证。本次完整包的三平台证据单独记录在[市场发布报告](market-release-report.md)。
