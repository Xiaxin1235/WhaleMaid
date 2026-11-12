# Changelog

## 1.6.3

- Restore new and existing conversations on DSH 0.2.2-rc.2. The complete package includes Coopanion 0.6.1 with the matching inbox fix.

### 中文

- 修复 DSH 0.2.2-rc.2 无法新建或继续会话的问题。完整包内置 Coopanion 0.6.1，同步修复桌宠信封的提问兼容性。

## 1.6.2

- Only one Da Fei Yu at a time. With Pet visits the mansion off she stays on the desktop and the mansion shows no second copy; turn it on and the desktop pet steps into the mansion.
- Fix the white box behind Da Fei Yu in the mansion when Harness uses the dark theme.

### 中文

- 同一时间只会有一只大肥鱼。「桌宠走进宅邸」关闭时她只留在桌面，宅邸里不再出现第二只；开启后桌面上的大肥鱼会走进宅邸。
- 修复 Harness 使用深色主题时，宅邸里大肥鱼身后出现白色方框的问题。

## 1.6.1

- Fix updating from the plugin market while Harness is running. 1.6.0 installed correctly, but loading it into the running Harness failed ("does not provide an export named WorldPreferencesSchema"), so the market reported the update as failed until Harness was restarted. The bundled core now lives in a per-release directory, so a live update always loads the new version.
- If an update to 1.6.0 reported failure, fully quit and reopen Harness; 1.6.0 is already installed. Updating to 1.6.1 from the market also works.

### 中文

- 修复 Harness 运行时从插件市场更新失败的问题。1.6.0 其实已经装好，但在运行中的 Harness 里加载时报错（"does not provide an export named WorldPreferencesSchema"），插件市场因此显示更新失败，要重启 Harness 才正常。内置核心改为按版本存放，运行中更新也会加载新版本。
- 如果更新到 1.6.0 时提示失败，完全退出并重新打开 Harness 即可，1.6.0 已经装好；也可以直接从插件市场更新到 1.6.1。

## 1.6.0

- Added the experimental Mansion, off by default. Enable it in Settings → WhaleMaid or next to Initiative. Rooms, task furnishings, letters, and keepsakes reflect project records and link to existing views.
- The complete package includes Coopanion 0.6.0. Da Fei Yu can work, walk, and sleep in the mansion. The desktop pet’s visit is a separate opt-in. A list view is available and is the default under reduced motion.

### 中文

- 新增实验功能「宅邸」，默认关闭。在设置 → WhaleMaid 或主动性卡片旁开启。房间、摆件、信件和纪念品反映项目记录，可打开已有界面。
- 完整包配套 Coopanion 0.6.0。大肥鱼会在宅邸里走动、工作和睡觉。桌宠暂离桌面需单独开启。开启减少动态效果时默认使用列表视图。

## 1.5.1

- Bundle Coopanion 0.5.9. The pet prepares its Electron runtime in the background and reports download, permission, disk and extraction failures in Settings.
- On network errors or timeouts, the pet retries the Electron download through npmmirror and verifies it against the bundled checksums.
- Add Windows desktop troubleshooting and Chinese and emoji font fallbacks.

### 中文

- 完整包内置 Coopanion 0.5.9。桌宠在后台准备 Electron 运行组件，设置页会分别提示下载、权限、磁盘空间或解压失败。
- 桌宠运行组件遇到网络错误或超时时会改用国内镜像下载，并按随包校验值核对。
- 补充 Windows 桌宠启动排查和中文、表情字体回退。

## 1.5.0

Includes the previously unreleased 1.4.0 initiative updates. There was no standalone 1.4.0 release.

- Project Radar is off by default. Each authorized goal can opt into observing direct npm/PyPI dependencies, local Git changes and its GitHub repository. The panel shows check history, request counts and errors.
- Proven external conflicts hold new runs for the affected goal. Continue, pause or review the changes from the notification or goal details. Related GitHub issues and PRs appear in the daily brief.

- Initiative suggestion cards and optional questions share the notification center and pet envelope. Cards are enabled by default and respect quiet hours, muting and delivery limits.
- Suggestions link to evidence and offer existing management actions, snoozing and feedback. Read-only investigation drafts use the existing authorization editor.
- The Initiative panel tracks effectiveness, explains reversible adjustments and can record suggestions that led to verified progress in Da Fei Yu’s journal.

### 中文

本版合入原定 1.4.0 的主动性闭环。1.4.0 未单独发布。

- 项目雷达默认关闭。可按已授权的目标订阅 npm/PyPI 直接依赖、本地 Git 改动和项目的 GitHub 仓库。面板显示检查记录、请求次数和失败原因。
- 确认存在外部冲突时，相关目标暂停启动新执行，可从通知或目标详情继续、暂停或查看改动。相关 issue 和 PR 进入每日简报。

- 主动建议卡默认开启，可选的主动询问默认关闭。通知中心和桌宠信封共用建议卡，遵守勿扰、静音和投递上限。
- 建议附带证据、已有管理动作、稍后提醒与反馈。只读排查草案仍需通过面板审核授权。
- 主动性面板显示建议效果和可撤销的自动调整，带来可验证进展的建议可写入大肥鱼的经历。

## 1.3.1

- Support DSH 0.2.2-rc.1 and open the compatibility window to 0.2.x starting at 0.2.1-rc.2. The complete package includes Coopanion 0.5.8.
- Check new DSH releases automatically and keep the 1.3.0 welcome announcement for this compatibility update.

### 中文

- 支持 DSH 0.2.2-rc.1，宿主兼容范围覆盖 0.2.1-rc.2 起的 0.2.x，完整包内置 Coopanion 0.5.8。
- 自动巡检新版 DSH，本次兼容性更新沿用 1.3.0 欢迎公告。

## 1.3.0

- **Initiative (phase 1).** Rule-based findings for repeated failures with the same cause, looming stalls, missing acceptance evidence, budgets running low, decisions left waiting, idle goals and leftovers after completion. The WhaleMaid panel lists them with evidence links, per-detector switches and maximum levels, and a seven-day count. The daily brief includes up to three findings, and Da Fei Yu can look them up read-only. Findings never send notifications, call a model or change any state. Repeated verification timeouts also count as the same failure.
- **Reliable decision questions.** Failed deliveries retry after 1, 5 and 30 minutes, then every 2 hours, within the hourly limit. Questions interrupted by a restart, mute or quiet hours are asked again once eligible; a question you close without answering waits in the panel until you ask for a reminder. Decisions still needed after 24 hours stay open, superseded options stop working, and the panel and pet can never both act on one decision. Verification questions always include accept and retry, plus rollback when available. The notification center shows each decision’s delivery history and next ask time.
- **Welcome and release guide.** A bilingual welcome dialog with Da Fei Yu artwork introduces the main features and the QQ feedback group. It appears once after installation and once more for each release with notable changes, leading with what’s new. The artwork loads only when the dialog opens. Reopen it from **WhaleMaid → Welcome & about** or **Settings → WhaleMaid → Help & feedback**, which also links to GitHub issues.

### 中文

- **主动性（第一阶段）**：用规则发现同一原因反复失败、即将停滞、验收依据不足、预算将尽、决定积压、目标长期闲置和完成后的遗留。WhaleMaid 面板列出这些发现，可展开证据，每类发现有独立开关和最高分级，并显示近 7 天统计。每日简报最多收录三条，大肥鱼也可以只读查询。发现不会发通知、不调用模型、不改任何状态。验收命令反复超时也算同一原因失败。
- **决策提问更可靠**：投递失败后按 1 分钟、5 分钟、30 分钟、之后每 2 小时重试，受每小时上限约束。因重启、静音或免打扰被中断的提问，条件允许时会重新问你；你关掉没答的提问留在面板，点「稍后提醒」才会再问。超过 24 小时仍需处理的决策保持可处理，过时的选项会失效，面板和桌宠不会对同一决策执行两次。验收提问一定包含「确认完成」和「再试一次」，可以撤销时还有「撤销后再试」。通知中心可以查看每条决策的投递经过和下次提问时间。
- **欢迎页与更新指引**：中英文欢迎弹窗配大肥鱼形象，介绍主要功能和 QQ 交流群。安装后显示一次，之后每次有明显变化的更新再显示一次，先列出更新内容。形象图只在弹窗打开时加载。可从 **WhaleMaid → 欢迎与介绍** 或 **设置 → WhaleMaid → 帮助与反馈** 再次打开，后者也有提交 GitHub 问题的入口。

## 1.2.3

- Fix PTC sessions failing before a message is sent with `tool "codex" parameters must be lossless JSON before schema projection`. Remove Zod’s non-JSON metadata from Codex and companion tool parameter schemas while preserving fields, constraints, defaults and runtime validation.
- Keep native tool mode and existing execution and approval requirements unchanged. The complete package continues to include the compatible Coopanion 0.5.7 fork.

## 1.2.2

- Include the companion approval fix so ordinary PowerShell variable values remain readable while secret formats stay redacted.

- Give the 大肥鱼 agent preset a name and description in Settings → Agent presets, so it no longer shows only its id.
- Source installs: deploy the fixed copy with `--config.package-import-method=copy`. pnpm's default hard links let a later repository build rewrite the copy in use, leaving it unloadable (the main plugin failed to import and the 大肥鱼 preset showed "never started").

## 1.2.1

- Ship the verified companion and its runtime dependencies using standard npm bundled dependencies, preserving component licenses and corresponding source. Installation works with pnpm blockExoticSubdeps enabled.
- Retain the failed 1.2.0 tag and package diagnostics; no complete 1.2.0 release was published.

## 1.2.0 (unreleased candidate)

- Add a single complete installation package that automatically installs and enables the pinned WhaleMaid Coopanion fork.
- Include the private MIT core in the host archive; no unpublished workspace package is required.
- Preserve separate source repositories, licenses and corresponding source for the AGPL companion.
- Add reproducible release packaging and package validation.
- Port core authorization, isolated worktrees, path checks, project memories and command execution to native POSIX paths, retaining Windows grant hashes and case-sensitive POSIX boundaries.
- Gate publication on all three operating systems and six complete-package installations across DSH rc.2 / rc.3.
- Include current companion work delegation and ordinary conversation tools from the main development branch.
- Pin the companion fork with passive macOS recovery, native X11 pointer tracking, bounded Windows keyboard-helper cold initialization and a fix preventing old read acknowledgements from changing the selected conversation.

## 1.1.0 - 2026-10-25

在 1.0.0 基础上新增两项可选功能，均默认关闭；另含 CI 修正。

### 新功能

- **日常自动审批**（`d2ccedb`）：普通会话里，命令行审批能精确对应到本轮调用、且识别为普通操作时，自动“允许一次”；删除、发布、安装 / 卸载、越界路径、动态执行等危险操作，以及无法解析或拿不到命令的审批，仍交给人。WhaleMaid 只会放行或交给下一位，从不替人拒绝，也不改审批策略和权限预设。目标任务会话、大肥鱼、子代理和已归档会话不在范围内。面板有自动审批记录（最近 1000 条，已脱敏）和一键关闭入口。[C13](docs/coopanion/c13-report.md)
- **在普通对话中调用 Codex**（`213063a`）：注册 `codex` 工具，DeepSeek 可让本机 Codex 在当前会话目录完成任务。每次调用都要原生审批；模型只能给出任务和模式（只读 / 可写目录），不能指定目录；同时只运行一个，超时默认 15 分钟，可设 1–60 分钟；取消时结束整个进程树；子进程只继承白名单环境变量，不带 DeepSeek 等密钥；运行日志脱敏后保存在数据目录的 `codex-runs/`。Windows 上的可写模式沿用用户 Codex 配置里的 `[windows] sandbox` 一项，并优先使用 Codex 当前的独立安装。[P20](docs/p20-report.md)

### 修正

- `52d5820`、`27fefc1`：CI 改在已验证的 Windows 平台运行，测试使用解析后的真实临时目录。

### 配合鲸鱼桌宠

以下改动在独立的鲸鱼插件修改版 [`Xiaxin1235/dsh-coopanion`](https://github.com/Xiaxin1235/dsh-coopanion)（fork 自 `@takboo/dsh-coopanion`，AGPL）中，不属于 WhaleMaid 的发行内容，安装方法见[安装说明](docs/install.md#9-可选的鲸鱼桌宠)：在桌宠信封里回答审批（经 Harness 自己的审批卡，只有“允许一次 / 拒绝”，带防误触），审批卡显示脱敏后的实际命令，以及在 Harness 设置页直接填写情绪判断的 API Key。见 [C13B](docs/coopanion/c13b-report.md)、[C13C](docs/coopanion/c13c-report.md)、[C12](docs/coopanion/c12-report.md)。

## 1.0.0 - 2026-10-25

这是 WhaleMaid 的首个版本。以下按交付里程碑组织，不把历史产品规划中的设想列为已实现功能。1.0.0 之前的本地提交号见[提交号对照](docs/提交号对照.md)。

- 统一发布 `dsh-whalemaid`、`@whalemaid/core` 1.0.0；提供中英文首页、安装与使用说明。
- 版权人为 Xiaxin1235；发布历史的作者与提交者统一使用 GitHub 隐私邮箱。

### M4 第一步：每日简报

- `243ad44`：结构化进展快照、当天首轮伙伴对话注入、伙伴只读查询、今日卡片与最近三十份历史、通知定位和热更新开关。[P17](docs/p17-report.md)

### M3：伙伴、记忆与管理协作

- `fad5b6d`：大肥鱼专属会话、人设与只读工具。[P11](docs/p11-report.md)
- `8ad8a0d`、`d6e7e54`、`e3fac84`：经确认的个人/项目记忆、经验草稿、审核整理与审查修正。[P12](docs/p12-report.md)、[P12F](docs/p12f-report.md)
- `958ceba`：用户明确请求后提议项目管理动作，宿主本人确认；没有放弃、改方向或授权扩大入口。[P13](docs/p13-report.md)
- `188601f`：用户决策卡中的放弃与改方向；保留历史、确认停止与原授权边界。[P13B](docs/p13b-report.md)
- `353851b`、`5c18e29`、`67263a5`、`5c843ab`、`a152779`：可选高权限命令模式、危险操作单次审批、分类修正、字面通配符保护、可读审批原因。[P14](docs/p14-report.md)、[修正记录](docs/p14i-report.md)
- `4e8aebf`：伙伴对话回顾与结构化经历，与已确认记忆分开。[P15](docs/p15-report.md)
- `1489654`：旧伙伴会话轮换归档与逐条/全部恢复。[P16](docs/p16-report.md)

### M2：Autopilot MVP

- `7083178`、`0e2302e`：SQLite 存储、授权版本与撤销、全局暂停、自然语言目标草案及面板确认。[P06](docs/p06-report.md)、[P07](docs/p07-report.md)
- `1eb0dc8`、`e6e6f42`：独立执行副本、任务会话、文件/命令门禁与只读路径修正。[P08](docs/p08-report.md)
- `de6cea1`、`616f9e5`：独立验收、范围检查、用户决策和有界 UNKNOWN 核对。[P09](docs/p09-report.md)
- `c158921`、`190e2ee`：有预算和并发约束的依赖任务闭环、规划与重启恢复。[P10](docs/p10-report.md)

### M1：通知交互

- `57b126e`：通知策略、DSH 原生问题投递、固定意图智能选项、幂等路由、通知中心与勿扰。[P04/P05](docs/p04-p05-report.md)

### M0：基础联通

- `56b643d`、`2d1e80d`：workspace、纯领域模型与任务状态机。
- `921ffe9`、`0107ce9`：DSH 会话事件桥、API 查证和未知结果/任务提议修正。[P02](docs/p02-report.md)
- `f1d02eb`：已认证的 WhaleDot 面板与语言设置。[P03](docs/p03-report.md)

鲸鱼窗口、动画、声音和信封界面的改动位于独立 AGPL 仓库，不是本 MIT 包的交付物；其协作验收报告列在[文档索引](docs/README.md)。
