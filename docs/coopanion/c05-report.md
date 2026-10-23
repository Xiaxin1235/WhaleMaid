# C05 异常提醒不流泪验收

## 完成情况

2026-10-23，基于 C04 `75a6b1f`，在独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支实现并本地提交 `965df441a70cc90539f38135d03ca902dae3a5b0`：`fix: no tears for task errors; show a brief worried look instead`。版本保持 0.4.13，未 push、未发布。

| 项目       | 结果                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| error 状态 | 进入动作及持有表情均为 `worried`；皱眉、额侧汗滴，不产生眼下泪滴或泪痕                   |
| 错误通知   | 移除额外发现的 `sad` 首选候选，采用 worried/confused/neutral；已应用担心动作时不重复播放 |
| 自动入口   | 任务、通知、陪伴与 NPC 的自动动作统一阻止 `sad`／`cry`；NPC 持有表情也经过同一限制       |
| 已查看异常 | 沿用 C04 回执，点掉后立即恢复空闲；重启后同一异常不再回来                                |
| 手动预览   | 仅角色面板的独立预览允许难过/大哭，不改变主桌宠                                          |
| 上游资源   | 未修改 `web/upstream/` 动画、角色、贴图或粒子代码                                        |
| 文档       | usage、角色契约和提醒契约同步                                                            |

选择任务首选的 `worried`。它与 waiting 共用温和的担心表情，具体错误或待确认原因由信封条目和标题区分。没有增加额外 shake 动作或情绪计时器；已有状态切换只播放一次进入动作，未查看时持有不流泪的表情。

## 验证（命令与关键输出）

| 检查                    | 结果                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | 通过                                                                                                                                      |
| 提交后 `npm run build`  | 通过；commit=`965df44`、dirty=false                                                                                                       |
| `npm test`              | Vitest 247 passed、11 skipped；Node release/client 11 passed、locale 1 passed                                                             |
| `npm run test:inbox-ui` | 全套通过：初始收件箱、回复/字号 11、多屏 1、交互/拖动 16、陪伴 15                                                                         |
| 单元约束                | 8 种 mood 的 64 种前台/后台组合；全部通知类别及 initial/reminder；陪伴模式/日夜/互动/问候；NPC 行走、到达、打断的自动词与表情均无 sad/cry |
| 真实角色沙箱 UI         | 重复错误快照及同时收到错误通知，仅一次 worried；持有 worried；点掉后 neutral；手动预览 sad 和 cry 可用，主角色仍无流泪指令                |
| 真实隔离宿主            | 模型无调用的虚构 error 回合，主角色一次 worried、无 sad/cry；原生截图及动作记录一致                                                       |
| 查看与完整重启          | 原生信封点“去处理”后 idle、入口消失、落盘一条 C04 回执；停止并重启整个宿主后仍 idle，无信封入口或流泪指令                                 |
| 用户目视                | 用户明确回复“看到了，不再流泪”                                                                                                            |
| 清理                    | 测试宿主/鲸鱼停止，3184/9495 端口关闭；日常 profile 未修改                                                                                |

真实验收使用 WhaleDot `scripts/dev-host.ps1 -Profile c05 -UseUiKey -TestHome D:/dsh_plugins/WhaleDot/.dsh-dev/c05-home`，独立 DSH_HOME 与 pet-data，测试 profile 链接本地插件，只运行 Web 宿主。未启动日常桌面应用；回合由显式安装的虚构夹具经公开 sessionController.create、session.append、sessions.flush 生成，无模型调用或工具执行。

证据位于 `D:/dsh_plugins/WhaleDot/.dsh-dev/c05-evidence/`：`error-native.json`（一次 worried 与无流泪指令）、`viewed-native.json`（恢复 neutral 及落盘回执）、`restarted-native.json`（完整宿主重启后 idle）、`restarted-diagnostics.json`（实际已测构建身份）、`worried-native.png` 与 `restarted-native.png`（角色渲染截图），以及完整单元/界面日志、`cleanup.json`、`manifest.json`。

已测诊断与最终构建均为 `965df44`、dirty=false，productDigest=`b3298f19deb93bb1a221b622cf9d67a6c5849c3ecc311cb60ec84d62c9d71e67`。报告与证据留在 WhaleDot，AGPL 实现保留在 companion 仓库。

## 偏离与待确认（含对 DSH API 的假设与出处）

除提示词列出的两处 mood 映射外，还修正了 `notificationPresentation` 中错误通知的 sad 首选，否则通知路径仍可能发出眼泪。未改变异常事实、未读、审批或提问结算，也未增加 DSH API。

测试夹具沿用已在 C04 核验的公开会话接口；出处为 WhaleDot `docs/dsh-api-notes.md` 与 `.dsh-ref/0.2.1-rc.2/@deepseek-ai/dsh-session/README.md`。角色动作通过既有 API 2 主页面到沙箱的 do/set 消息验证，表情含义按当前固定版本上游 body.js 核对，未修改上游实现。

本次未改原生窗口、preload 或主进程，因此没有重复运行原生窗口全套 `test:desktop`；真实宿主与原生 Renderer 验收单独执行并记录，不能写成该全套通过。首次查看步骤的补采脚本过早读取子 frame，未取得动作记录；等角色 frame 就绪后，用同一虚构事件重新完成查看及完整重启采集。首次回执另存 `first-view-receipts.json`，最终通过证据来自补采后的完整链路。

## 需要用户目视确认的项目

隔离鲸鱼的“有未处理异常时不再流眼泪”已由用户确认。日常 profile 已 link 本仓库，用户只需**完全退出 Harness 和旧桌宠，再从开始菜单重新打开 Harness**，无需重装。日常使用时可继续观察担心表情是否自然，以及点掉异常后是否恢复正常空闲。

## 已知问题 / 下一步建议

worried 仍带额侧汗滴，这是所选表情的原有表现；本次移除的是自动 sad/cry 的泪滴与泪痕。第三方角色可能自行定义表情外观，本次约束针对宿主发出的 sad/cry 指令与内置角色，未重写第三方动画。角色面板手动预览仍可有眼泪。

测试宿主与测试鲸鱼均已停止，独立测试目录和证据保留供复核；未修改日常 profile 或其用户数据。
