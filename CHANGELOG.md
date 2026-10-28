# Changelog

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
