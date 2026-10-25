# P18：发布准备

2026-10-25，America/Los_Angeles。从干净的 master `ef75b09` 开始，已包含 P17 `243ad44` 及审查记录。执行期间并发任务另提交 `c591288` 更新 C02 提示词，保持该提交，不归入本次改动。本次仅整理文档、包元数据、许可证分发与开发检查脚本；未修改功能代码、版本号或独立鲸鱼仓库，未发布、未推送、未打 tag。

## 许可边界：范围、方法与结论

对照只读本地仓库 D:/dsh_plugins/dsh-coopanion，固定提交 `c97ad54db201231075b272d4ca66efc71dc5e23e`，包声明 AGPL-3.0-or-later。初次扫描时参考工作区干净，后续出现其他任务的未提交改动，因此最终对照通过 Git 对象读取固定提交，不混入并发工作区内容。WhaleDot 的检查范围是当前 Git 跟踪文件的工作区内容，含源码、测试、脚本、提示词、文档及六份 HTML 草图；不是扫描整个磁盘或被忽略的历史联调目录，也不以本次结论替代全部 Git 历史的溯源。

| 检查          | 方法与发现                                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全文件        | WhaleDot 290 个跟踪文件与参考提交 1567 个文件逐一计算 SHA-256，不依赖文件名。WhaleDot 没有相同的非平凡完整文件，也没有单独的图片、音效、视频或角色压缩包文件。唯一短文件匹配是空的 .gitkeep 与对方空诊断文件，不能作为代码复制证据。               |
| 部分代码/文案 | 对代码、样式、HTML、Markdown 的非空行逐行 trim，检查 16 行窗口，窗口至少 240 字符，超过 8000 字符的单行不进入窗口；参考索引 16983 个唯一窗口。没有相同窗口。可发现改名、带额外前后文的直接复制，不保证发现重写、翻译或重排。                       |
| 内嵌媒体      | 比较文本内 SVG 和 image/audio/video data URI 的归一化哈希，避免只看媒体扩展名；WhaleDot 原有草图中的 18 个内嵌图形没有匹配参考仓库。草图提交 `bc6ac99` 先于独立插件的 C06 实现，保留为设计记录，不作为角色资源发行。                               |
| 协作报告      | docs/coopanion 下十一份历史报告是实现/验收说明，最长围栏代码块 5 行，内容为测试命令或输出；没有超过 15 行的连续代码引用，无需删改长源码引用。短 API 名、界面标签与路径是说明文字，不是打包的插件实现。                                             |
| 依赖和接入    | 根、core、host 三份 package.json 均无 @takboo/dsh-coopanion 的直接、开发、peer、optional 或 bundled 依赖；检查模块引用和包内 AGPL 标记。实际协作使用 DSH 会话、提问、审批；ctx.get('coopanion') 仅检测可选服务是否存在，没有导入或调用其窗口实现。 |

结论：在上述当前工作区和参考快照、哈希/片段/媒体及人工说明审阅范围内，**未发现来自独立鲸鱼插件的代码、角色包、音效或大段文案被混入 WhaleDot**。这不是对所有可能改写来源、上游角色权利或全部传递依赖作出的法律保证。

新增 `scripts/check-license-boundary.mjs`，接入 `pnpm lint` / `pnpm check:license`。提供 --reference 时对已提交的参考树做全文件、片段及内嵌媒体比对，默认固定该次运行开始时的 HEAD，也可用 --revision 指定提交；未提供时明确报告未做参考比对，只执行本地静态规则，避免把普通 CI 通过说成已查证外部源。可用 --report 输出仅含计数、路径与哈希查证结果，不复制参考源码。

本地虚构仓库验证了检查器：干净样本通过；违规依赖、模块导入、改名整文件、包装后的部分复制、相同内嵌 SVG、超过十五行的引用都按预期失败。证据在 .dsh-dev/p18-evidence/check-probes.json 和切换固定 Git 对象后的 check-probes-pinned.json；没有向正式源码中植入这些样本。

## 文档整理

| 文档                        | 结果                                                                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [首页](../README.md)        | 改为用户入口，删除“独立验收和闭环未实现”等过时说明，概述当前能力与边界，链接安装、使用和开发。                                                                                                                                                                                    |
| [使用说明](usage.md)        | 目标/授权、闭环验收、通知/决策、伙伴、确认记忆、回顾、归档、管理提议、简报、高权限、数据与卸载分章，核对默认值和关闭作用；保留未知结果、旧通知自定义文字、新式改方向、Web 空伙伴预设等实际限制。                                                                                  |
| [文档索引](README.md)       | 分用户文档、开发与查证、任务报告；独立鲸鱼报告明确归为协作记录。                                                                                                                                                                                                                  |
| [变更记录](../CHANGELOG.md) | 顶部 Unreleased，按 M0/M1/M2/M3/M4 第一步列交付与实际提交号；不虚构仓库地址来生成提交链接。                                                                                                                                                                                       |
| 相对链接                    | 新增 scripts/check-doc-links.mjs 并接入 lint，离线检查跟踪文档中的内联/引用式 Markdown、HTML href/src、文档锚点和目标是否跟踪。中文、代码标题、重复标题、空格路径与同页锚点样本通过；缺失文件/锚点按预期失败。95 份跟踪文档、96 个相对目标全部通过。外部 URL 不作在线可达性承诺。 |
| 旧证据与草图                | P08/P09 的两处本地截图改为原路径说明，证据仍留本地；六份设计 HTML 只移除不存在的 support.js 引用，附草图说明，没有复制外部运行时。                                                                                                                                                |

按当前源代码、P04–P17 报告和安装指南核对行为。工程路线的早期章节保留其历史标注，不把产品规划中的桌宠自研、未实现长期调度等设想写成已交付功能；高权限仍是显式确认的命令模式，不是自动切换到 danger-full-access 预设。

## 包信息与本地包审计

| 项目                  | 结果                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| description / license | core、host 描述更新为当前用途，license 均为 MIT；根 LICENSE 仍为原 MIT 文本。每包补同字节 LICENSE 以随包分发。                                                                                                               |
| repository / 版权人   | git remote 没有地址，两包 repository 留空。现有版权行“Copyright (c) 2026 WhaleDot contributors”原样保留并复制，未据此确认真实权利人，见待确认项。                                                                            |
| engines / 版本        | 两包 Node >=22.19；host DSH 保持 0.2.1-rc.2 或 rc.3，纯 core 不新增 DSH 依赖限制。根、core、host 全部仍是 0.0.0。                                                                                                            |
| files                 | 只列 lib 下运行 JS 与类型声明、host 的两份 persona 和 cordis.patch.yml，以及 LICENSE。构建仍可产生 source map，但本地包不带 map、测试、TypeScript 源码、联调数据或提示词。                                                   |
| 实际 tarball          | pnpm --filter dsh-whaledot pack 和 core 的等价命令在 .dsh-dev/p18-evidence 生成本地包，实际读取 gzip/tar 成员并与 pack 清单逐项核对，不只看退出码或 files 字段。检查后删除两个生成包，清单和审计 JSON 保留，未提交 tarball。 |

| 本地包               | 文件数 | 压缩字节数 | 禁止内容 |
| -------------------- | -----: | ---------: | -------- |
| dsh-whaledot@0.0.0   |    118 |     322525 | 无       |
| @whaledot/core@0.0.0 |    106 |      97055 | 无       |

实际包中的 LICENSE 与根文件逐字节相同；manifest 保持 MIT / 0.0.0。host 的 workspace:* 在打包时转换为 @whaledot/core:0.0.0，因此它不是独立自含安装包，不能把内容检查通过等同于可从 npm 安装。发布前需一起决定 core/host 的正式版本和分发顺序；日常固定副本安装继续按现有指南的 deploy 路径执行。

完整文件清单见文末。证据：.dsh-dev/p18-evidence/host-pack.json、core-pack.json、package-audit.json；实际成员无 .dsh-dev、.dsh-ref、node_modules、src、tests、prompts、test/spec 文件、.map 或非声明 .ts，没有指向外部的 tar 链接。

## 验证与清理

build、test、typecheck、lint（含许可边界及链接检查）、format:check、git diff --check 均通过；Vitest 保留原有 48 文件、1181 项测试。本次没有功能改动，没有启动 Harness、桌宠或浏览器，没有进行额外真实模型调用。独立鲸鱼仓库的并发未提交改动未被本任务写入或恢复；以固定 Git 对象作为许可基线。WhaleDot 的版本号、Git remote 和根版权文本未改。

日志和许可比对 JSON 保存在 .dsh-dev/p18-evidence。自动检查不替代既有 P04–P17 真实功能验收；此任务无需重新移动桌宠或运行项目任务。

## 待用户确认

| 项目                 | 当前保留状态                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| 公开仓库地址         | 未提供、无 remote，repository 留空。                                          |
| 版权人               | 原值 WhaleDot contributors 未改；正式发行前确认真实权利人及需要保留的版权行。 |
| 首个版本号和发布时间 | 全部仍 0.0.0 / Unreleased，未打 tag；由用户决定，并统一 core/host 依赖版本。  |

仅作本地提交，完成后停下等待审查；不替用户决定发布信息。

## 本地包完整文件清单

<details>
<summary>dsh-whaledot（118 个文件）</summary>

```text
LICENSE
companion/persona.en.md
companion/persona.zh-CN.md
cordis.patch.yml
lib/autopilot/day.js
lib/autopilot/scheduler.js
lib/autopilot/trace.js
lib/bridge/run-tracker.js
lib/bridge/session-events.js
lib/client.js
lib/client/autopilot.js
lib/client/companion-actions.js
lib/client/companion-archives.js
lib/client/daily-brief.js
lib/client/format.js
lib/client/goal-decisions.js
lib/client/index.js
lib/client/intake.js
lib/client/memories.js
lib/client/memory-proposals.js
lib/client/notifications.js
lib/client/recall.js
lib/client/verification.js
lib/companion/actions.js
lib/companion/agent.js
lib/companion/archive.js
lib/companion/consent.js
lib/companion/daily-brief.js
lib/companion/drafts.js
lib/companion/memory.js
lib/companion/recall.js
lib/companion/service.js
lib/companion/session.js
lib/companion/tools.js
lib/debug-log.js
lib/execution/dsh-runner.js
lib/execution/execute-task.js
lib/execution/registry.js
lib/execution/tool-gate.js
lib/execution/worktree.js
lib/goal-intake/model.js
lib/goal-intake/project.js
lib/goal-intake/service.js
lib/goal-notices.js
lib/index.js
lib/notify/deliverer.js
lib/notify/goal-decisions.js
lib/notify/history.js
lib/notify/inbox-session.js
lib/notify/router.js
lib/panel-api/contract.js
lib/panel-api/handlers.js
lib/panel-api/index.js
lib/scope-service.js
lib/store/index.js
lib/store/lock.js
lib/store/migrations.js
lib/store/repos.js
lib/types/autopilot/day.d.ts
lib/types/autopilot/scheduler.d.ts
lib/types/autopilot/trace.d.ts
lib/types/bridge/run-tracker.d.ts
lib/types/bridge/session-events.d.ts
lib/types/client/autopilot.d.ts
lib/types/client/companion-actions.d.ts
lib/types/client/companion-archives.d.ts
lib/types/client/daily-brief.d.ts
lib/types/client/format.d.ts
lib/types/client/goal-decisions.d.ts
lib/types/client/index.d.ts
lib/types/client/intake.d.ts
lib/types/client/memories.d.ts
lib/types/client/memory-proposals.d.ts
lib/types/client/notifications.d.ts
lib/types/client/recall.d.ts
lib/types/client/verification.d.ts
lib/types/companion/actions.d.ts
lib/types/companion/agent.d.ts
lib/types/companion/archive.d.ts
lib/types/companion/consent.d.ts
lib/types/companion/daily-brief.d.ts
lib/types/companion/drafts.d.ts
lib/types/companion/memory.d.ts
lib/types/companion/recall.d.ts
lib/types/companion/service.d.ts
lib/types/companion/session.d.ts
lib/types/companion/tools.d.ts
lib/types/debug-log.d.ts
lib/types/execution/dsh-runner.d.ts
lib/types/execution/execute-task.d.ts
lib/types/execution/registry.d.ts
lib/types/execution/tool-gate.d.ts
lib/types/execution/worktree.d.ts
lib/types/goal-intake/model.d.ts
lib/types/goal-intake/project.d.ts
lib/types/goal-intake/service.d.ts
lib/types/goal-notices.d.ts
lib/types/index.d.ts
lib/types/notify/deliverer.d.ts
lib/types/notify/goal-decisions.d.ts
lib/types/notify/history.d.ts
lib/types/notify/inbox-session.d.ts
lib/types/notify/router.d.ts
lib/types/panel-api/contract.d.ts
lib/types/panel-api/handlers.d.ts
lib/types/panel-api/index.d.ts
lib/types/scope-service.d.ts
lib/types/store/index.d.ts
lib/types/store/lock.d.ts
lib/types/store/migrations.d.ts
lib/types/store/repos.d.ts
lib/types/verify/reconcile.d.ts
lib/types/verify/runner.d.ts
lib/types/verify/verify-task.d.ts
lib/verify/reconcile.js
lib/verify/runner.js
lib/verify/verify-task.js
package.json
```

</details>

<details>
<summary>@whaledot/core（106 个文件）</summary>

```text
LICENSE
lib/autopilot/model.js
lib/autopilot/planner.js
lib/autopilot/tick.js
lib/companion/actions.js
lib/companion/archive.js
lib/companion/daily-brief.js
lib/companion/recall.js
lib/companion/redact.js
lib/companion/transcript.js
lib/goal-draft.js
lib/goal-graph.js
lib/i18n/archive.js
lib/i18n/daily-brief.js
lib/i18n/index.js
lib/i18n/memory.js
lib/i18n/notifications.js
lib/i18n/recall.js
lib/index.js
lib/infra.js
lib/memory/index.js
lib/memory/proposals.js
lib/model/action.js
lib/model/authorization.js
lib/model/common.js
lib/model/evidence.js
lib/model/execution.js
lib/model/goal.js
lib/model/ids.js
lib/model/limits.js
lib/model/memory.js
lib/model/notification.js
lib/model/task.js
lib/model/transition.js
lib/notify/copy.js
lib/notify/goal-decisions.js
lib/notify/model.js
lib/notify/policy.js
lib/notify/suggestions.js
lib/read-only-command.js
lib/run-outcome.js
lib/run-scope.js
lib/scope.js
lib/task-prompt.js
lib/task-state.js
lib/tool-intent.js
lib/trusted-command-parser.js
lib/trusted-command.js
lib/types/autopilot/model.d.ts
lib/types/autopilot/planner.d.ts
lib/types/autopilot/tick.d.ts
lib/types/companion/actions.d.ts
lib/types/companion/archive.d.ts
lib/types/companion/daily-brief.d.ts
lib/types/companion/recall.d.ts
lib/types/companion/redact.d.ts
lib/types/companion/transcript.d.ts
lib/types/goal-draft.d.ts
lib/types/goal-graph.d.ts
lib/types/i18n/archive.d.ts
lib/types/i18n/daily-brief.d.ts
lib/types/i18n/index.d.ts
lib/types/i18n/memory.d.ts
lib/types/i18n/notifications.d.ts
lib/types/i18n/recall.d.ts
lib/types/index.d.ts
lib/types/infra.d.ts
lib/types/memory/index.d.ts
lib/types/memory/proposals.d.ts
lib/types/model/action.d.ts
lib/types/model/authorization.d.ts
lib/types/model/common.d.ts
lib/types/model/evidence.d.ts
lib/types/model/execution.d.ts
lib/types/model/goal.d.ts
lib/types/model/ids.d.ts
lib/types/model/limits.d.ts
lib/types/model/memory.d.ts
lib/types/model/notification.d.ts
lib/types/model/task.d.ts
lib/types/model/transition.d.ts
lib/types/notify/copy.d.ts
lib/types/notify/goal-decisions.d.ts
lib/types/notify/model.d.ts
lib/types/notify/policy.d.ts
lib/types/notify/suggestions.d.ts
lib/types/read-only-command.d.ts
lib/types/run-outcome.d.ts
lib/types/run-scope.d.ts
lib/types/scope.d.ts
lib/types/task-prompt.d.ts
lib/types/task-state.d.ts
lib/types/tool-intent.d.ts
lib/types/trusted-command-parser.d.ts
lib/types/trusted-command.d.ts
lib/types/verify/decide.d.ts
lib/types/verify/judge.d.ts
lib/types/verify/model.d.ts
lib/types/verify/parse.d.ts
lib/types/windows-path.d.ts
lib/verify/decide.js
lib/verify/judge.js
lib/verify/model.js
lib/verify/parse.js
lib/windows-path.js
package.json
```

</details>
