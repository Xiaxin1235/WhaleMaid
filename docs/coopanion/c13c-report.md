# C13C：桌宠审批显示实际命令

日期：2026-10-25。依据 [C13C](../../prompts/C13C-桌宠审批显示命令.md) 与 [通用上下文](../../prompts/C00-鲸鱼插件通用上下文.md)。产品代码只改 `D:/dsh_plugins/dsh-coopanion`；本报告与证据留在 WhaleMaid，报告不提交。

## 完成情况

审批卡现在依次显示标题、等宽命令块／可选目录、次要的“模型说明：”和操作按钮。命令取自同一会话中 callId 精确匹配且工具名一致的公开 tool/call 事件，不采用模型理由作为命令来源。

| 项目       | 实现                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 取值       | 新增 src/approval-command.ts，只解析 bash／pwsh 对应调用的 arguments JSON，白名单取 command 和可选 workdir；NotificationBroker 在 approval/asked 时保存处理后的展示数据，历史恢复沿同一路径。                                             |
| 脱敏       | 常见 sk-、GitHub、AKIA、Bearer、Slack 令牌及 NAME=value／$env:NAME=value 赋值值替换为 [REDACTED]；先规范化换行、制表符并去掉其他控制／格式字符，再脱敏，最后限 12 行、500 个 JS 字符（含必要的“…（已截断）”标记），避免截断暴露令牌前缀。 |
| 下发       | 新增严格的 approvalCommand 展示对象，仅含 shell／other 分类及处理后的 command/workdir；没有把原 arguments、description、justification、超时或沙箱字段放入该对象。原审批原因仍沿 C13B 通道显示，明确标注模型说明。                         |
| 缺少命令   | 对调用缺失、坏 JSON、缺字段、非字符串或处理后空命令，显示“未能取得命令，请在 Harness 查看”。允许按钮禁用，宿主也以 approval/command-unavailable 拒绝允许请求；拒绝和源会话入口可用，不显示稍后提醒。                                      |
| 非 shell   | 保留既有原因与作答方式，在说明下提示“详情请在 Harness 查看”。                                                                                                                                                                             |
| 界面与流程 | 新版／经典、中英文均实现；命令块可换行且不撑破信封。C13B 的 1 秒防误触、默认焦点、回车规则和 PendingApproval.answer 作答通道不变，没有新增审批回答者或更改策略。                                                                          |
| 文档       | 同步 docs/usage.md、docs/session-chat-contract.md，更新原“不含工具参数”措辞的例外并说明处理后的命令预览、缺失时不能允许、模型说明只作参考。                                                                                               |

## 验证（命令与关键输出）

前置仓库：whaledot-local，HEAD 876ce93，工作区干净。先完成两项基线再改产品代码；CLI 现场核对为 DSH 0.2.1-rc.3，未改依赖、版本号或 WhaleMaid 产品实现。

| 检查                                | 结果                                                                                                                                                                                   | 证据                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 基线 npm test                       | Vitest 308 通过、11 项原有跳过；后续 Node 发布／客户端／语言检查通过。                                                                                                                 | baseline-test.log                                              |
| 基线 test:inbox-ui                  | 完整入口通过，无过滤。                                                                                                                                                                 | baseline-inbox.log                                             |
| 新增单元                            | 22 项，覆盖精确 callId、可选目录、公开事件恢复、字段白名单、令牌／环境赋值、控制字符、行数／长度、缺少命令的 Host 拒绝门禁和非 shell。                                                 | approval-command.test.ts、test-final-ui.log                    |
| 最终 npm test                       | 36 文件通过、1 文件原有跳过；330 项通过、11 项原有跳过。后续 Node 检查全部通过。                                                                                                       | test-final-ui.log                                              |
| build / typecheck / verify:metadata | 全部通过。                                                                                                                                                                             | build-final.log、typecheck-final-ui.log、metadata-final-ui.log |
| 最终 test:inbox-ui                  | 完整入口通过。四种风格／语言组合验证命令块、目录、模型说明标签及次要样式、360px 长命令布局、缺命令禁用允许及无稍后提醒；既有防误触与结算继续通过。                                     | inbox-final-ui.log、tests/approval-ui.mjs                      |
| test:desktop                        | 用户确认输入环境后全套通过，涵盖原生窗口、焦点、全屏、多屏／字号、IPC、收件箱、恢复与干净退出。                                                                                        | desktop-confirmed.log                                          |
| 最终缺命令原生补测                  | 最后收紧了缺命令时不显示稍后提醒；额外在隐藏的真实 Electron Renderer 中验证四组合 DOM 和经 main frame 的拒绝 IPC，未移动系统鼠标、未调用模型。它是夹具测试，不能代替下述真实模型验收。 | focused-native-ui.json、focused-native-ui-final.log            |
| git diff --check                    | 通过。                                                                                                                                                                                 | 提交前核对                                                     |

保留失败：原生测试前两轮在 SetCursorPos 处收到 Cannot move native test cursor，未进入主要检查，未修改断言；用户确认 Windows 输入环境后第三轮通过，见 desktop-final.log、desktop-retry.log、desktop-confirmed.log。隐藏窗口的额外截图曾因没有可绘制表面超时，保留 focused-native-ui-screenshot-timeout.log；隐藏窗口补测最终只核对 DOM／IPC，真实可见 UI 截图使用下表三个现场样本。

## 隔离真实验收

使用 whaledot-p02、DSH_HOME=.dsh-dev、独立 WhaleMaid dataDir 和独立 DSH_PET_TEST_DATA_DIR；只启动官方 CLI 的 Web 宿主及测试鲸鱼。Playwright 经专用 Chromium 9497 和鲸鱼 9498 的 CDP 读取 DOM、点击并截图，没有使用浏览器控制工具。WhaleMaid 日常自动审批全程关闭，最终自动审批记录为 0。

真实预算为 3 个模型步骤。测试插件通过公开 agent/pre-step 为每项仅准入一个步骤，并拒绝后续步骤；通过公开 agent/request-error 关闭测试会话的自动重试。三个步骤各生成一次 pwsh 调用；拒绝后不再请求模型写总结。测试门禁只在 .dsh-dev/c13c-evidence/probe-host.mjs，未进入产品代码。调用前保留 real-call-ledger.json，最终对账 step/start=3、tool/call=3、approval/asked=3、approval/decided=3，三条决定均唯一且为 rejected；没有追加第 4 次调用。见 model-budget.jsonl、acceptance-audit.json、final-events.json。

| 项目       | 实际结果                                                                                                                                  | 证据前缀                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 中文删除 | 命令块为 Remove-Item -LiteralPath victim.txt，与 Harness 原审批详情一致；模型说明标签可见。截图后在桌宠拒绝，victim.txt 保留。            | delete-zh-harness.png、delete-zh-pet.png、delete-zh-rejected.png、delete-zh-comparison.json、delete-zh-events.json |
| 2 假令牌   | Harness 原命令包含指定的虚构 sk-test 令牌，桌宠为 echo [REDACTED] > token.txt；整张桌宠卡片不含该假令牌。截图后拒绝，token.txt 没有生成。 | token-zh-harness.png、token-zh-pet.png、token-zh-rejected.png、token-zh-comparison.json、token-zh-events.json      |
| 3 英文删除 | 命令与 Harness 一致，Model explanation／Run in 文案可见；截图后在桌宠拒绝，victim.txt 保留。                                              | delete-en-harness.png、delete-en-pet.png、delete-en-rejected.png、delete-en-comparison.json、delete-en-events.json |

## 偏离与待确认（含 API 出处）

- 公开来源：本机 dsh-session 类型的 tool/call／arguments 以及既有 Session.snapshotEvents()；宿主现有按 callId 查找事件的写法与 C13B 的 approval/asked.callId 配对。没有读取工具私有字段、其他会话、文件内容或客户端传入参数来生成命令块。
- 启动器复用 dev-host.ps1 的隔离 CLI、profile 和 UI-key 语义，但在本次证据中的包装脚本加入 --no-open，避免像 C13B 那样额外打开 Edge 测试客户端。没有修改 WhaleMaid 的启动脚本；桌宠数据另外放到本次 evidence/pet-data，隔离更明确。
- 权限采用公开 permissionPresets 的 workspace-write，测试调用显式请求提权，从而进入需要人工回答的 Harness 原审批卡；没有修改默认策略或打开日常自动审批。所有工具最终被拒绝，没有实际执行删除或写令牌文件。
- 三个真实样本覆盖完整接线；令牌种类、环境赋值、截断和缺失数据的覆盖来自单元、Chromium 与原生夹具检查，不将这些称作额外真实模型样本。

## 需要用户目视确认的项目

没有追加用户操作要求。已读取现场原生截图检查命令、目录、说明标签和布局；没有取得本轮用户人工目视签字。前述原生输入配合只用于系统鼠标测试，不代表用户对界面内容签字。

## 已知问题／下一步建议

清理详情见 cleanup.json：日常自动审批始终关闭，测试宿主／鲸鱼／专用 Chromium 已停止，3182/9497/9498 无监听，隔离 cordis.patch.yml 已逐字节恢复。最终原生夹具检查退出后再次核对端口。

**临时仓库仍保留**：D:/dsh_plugins/WhaleDot/.dsh-dev/c13c-evidence/fixture。自动审批审核拒绝了删除该目录的命令，返回 blocked by policy；按提示词要求没有换方式删除、修改权限或扩大范围。本轮没有创建派生工作树。

产品已在 whaledot-local 本地提交 `9f7e309`（父提交 `876ce93`），标题 `fix: show the command in pet approvals`；产品工作区干净。报告不提交，不推送、不发布，停下等审查。

连续样本沿用同一打开的信封：token-zh-pet.png 下方的“已拒绝”是上一个样本遗留的通用反馈，当前卡片截图时仍待答。本轮按每个新的 approval id 核对唯一拒绝及文件状态，不据该通用反馈判定当前请求已结算；提示残留是 C13B 已有呈现行为，本次没有扩展修改。

## 审查（Claude）

**可以接受。** `9f7e309` 只从同一会话中 `callId` 精确匹配、工具名一致的 `tool/call` 事件取命令，只保留 `command` 和 `workdir`。处理顺序是：先去掉隐藏字符，再脱敏，最后截断，避免截断后露出半截令牌。取不到命令时，桌宠和宿主两边都拒绝“允许一次”。截图 `token-zh-pet.png` 中，假令牌显示为 `[REDACTED]`，目录完整，“模型说明：”标签可见。

Claude 复测：`npm run build`、`npm run typecheck`、`npm test`、`npm run test:inbox-ui`、`npm run verify:metadata` 通过。`npm run test:desktop` 在移动系统鼠标一步失败（`Cannot move native test cursor`），与报告中前两轮相同，属于测试时机器正在使用的环境问题；执行者在用户确认后的完整重跑已通过。

**小问题（C13B 已有，不阻塞）**：作答反馈“已拒绝”会留在信封里，下一张仍在等待的审批卡下面也会看到它，容易误以为新的那张已被拒绝。下次改桌宠审批时，在新卡片出现时清掉上一条反馈。

未删除的临时仓库 `.dsh-dev/c13c-evidence/fixture` 已由 Claude 删除。
