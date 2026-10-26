# C13B：桌宠通过 Harness 审批卡作答

日期：2026-10-25。范围依据 [C13B](../../prompts/C13B-桌宠审批走Harness卡片.md) 与 [通用上下文](../../prompts/C00-鲸鱼插件通用上下文.md)。产品改动只在 `D:/dsh_plugins/dsh-coopanion`，WhaleMaid 仅保存报告与隔离证据；本报告不提交。

## 完成情况

已实现客户端审批桥接、宿主路由、原生 IPC 和两种风格的信封按钮。沿 Harness 现有 `PendingApproval.answer()` 作答，没有新增 `approval/request` 回答者，没有修改审批请求、策略或 WhaleMaid 自动审批实现。开关 `inlineApprovals` 默认开启，中英文设置与文档同步；只有允许一次和拒绝，菜单与托盘没有审批按钮。

| 部分   | 行为                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 客户端 | 与 NotificationClient 同属插件生命周期，独立于设置页；复用同一 clientId。订阅公开 sessionStatus，750ms 轮询并即时处理变更；只上报可答审批，displayReason 经 locale 解析后优先使用，原因移除控制字符并限 600 字，不含工具参数。关闭开关不上报审批摘要、不调用 answer。                     |
| 宿主   | 按客户端保存最近列表，5 秒离线撤下可答入口。由原生审批日志的 sessionId/callId 关联原信封项，多客户端只显示一项；路由到最近上报客户端，并预留一次在途作答，等待匹配 clientId/key/指令身份的回执。                                                                                          |
| 校验   | Electron 验证本窗口主 frame 和当前待答项，Host 再验请求格式、运行代次、待答真值、开关、并发状态。客户端复核自己的 clientId、精确 key、answerable 和两种答案；重复指令不再次作答。失败有 stale、offline、duplicate、disabled、missing、already-answered、call-failed、timeout 等明确反馈。 |
| 界面   | 来源会话、可读原因、允许一次／拒绝和打开源会话。允许不获默认焦点，打开后等待 1 秒，回车不允许；拒绝立即可点。成功后显示已允许／已拒绝，Harness 先答显示已处理；离线或关闭时只有 Harness 入口。安静模式沿原规则只亮信封。                                                                  |

## API 查证与偏离

通过 `npm pack` 取得两个 rc.3 包，归档、声明和 npm 元数据保存在 `.dsh-dev/c13b-evidence/`：

| 公开出处                                                      | 核对结果                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dsh-client-ui-approval `lib/types/client/contract/slots.d.ts` | PendingApproval 的 key/sessionId/kind/toolName/callId/reason/displayReason/answerable 和 answer 两种结果均存在。运行时客户端通过 registerPendingInteraction 发布原审批对象。                                                                              |
| dsh-client-ui-session `lib/types/client/index.d.ts`           | uiSession、sessionStatus、SessionStatus.pendingInteraction 均公开；getSnapshot/subscribe 来自 HostObservable。可通过 ctx.inject(['uiSession'], …) 接入。                                                                                                  |
| 包与构建                                                      | 两个包只作 import type 的开发依赖，没有打包或 require 它们的运行时代码。npm-shrinkwrap 同步，verify:metadata 通过。rc.3 类型包要求 Cordis ~4.0.5，开发 Cordis 从 4.0.4 升为 4.0.5，仍在原兼容范围内；首次依赖解析冲突输出保留。                           |
| 生命周期                                                      | 真实审批出现时未打开桌宠设置页，桥接仍正常。另用独立 Electron 包装窗口加载真实 Harness Web，窗口隐藏到托盘且设置页关闭，只有该客户端在线时仍能在桌宠拒绝；20 次上报最大间隔 765ms。官方桌面版自身的托盘窗口未单独实测，不将包装窗口结论冒充该项实机结果。 |
| 多客户端                                                      | 同一真实调用在两个 Web 客户端分别生成 approval:3、approval:2；桌宠只有一项，桌宠允许后两边卡片均结束。见 02-multiple-clients.json 和两端截图。                                                                                                            |

## 验证

前置仓库在 whaledot-local，HEAD 为 37a9971，工作区干净。基线 npm test、npm run test:inbox-ui 均通过后才开始改动。

| 检查                         | 结果／证据                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线                         | Vitest 296 通过、11 项原有跳过，后续 Node 检查通过；完整收件箱入口通过。baseline-test.log、baseline-inbox-ui.log。                                                                                                              |
| 新增单元                     | 12 项通过，涵盖审批类型、摘要无参数、身份与答案校验、重复投递、离线、多客户端路由、关闭、过期、回执与超时／卸载。                                                                                                               |
| 最终 npm test                | 35 文件通过、1 文件原有跳过；308 项通过、11 项原有跳过。其后 Node 发布／客户端／语言检查通过。test-final-complete.log。                                                                                                         |
| build / typecheck / metadata | 均通过。build-final.log、typecheck-final-complete.log、metadata-final.log。客户端构建检查确认两个新类型包的运行时代码未进入产物。                                                                                               |
| 最终 test:inbox-ui           | 完整入口通过，新增两种风格 × 两种语言，验证 1 秒、回车、默认焦点、立即拒绝、回执、两端结算、离线提示与安静模式。inbox-ui-final.log。                                                                                            |
| 最终 test:desktop            | desktop-final-retry.log 通过：原生焦点、全屏层级、多屏／字号、角色、托盘、IPC、收件箱重启、恢复和卸载。前一次在系统鼠标断言处失败，目标 DIP 396,375、回读 618,856；保留 desktop-final.log，未修改断言，用户暂停输入后重跑通过。 |
| git diff --check             | 通过。无版本号修改、发布或推送。                                                                                                                                                                                                |

## 隔离真实验收

使用 whaledot-p02、DSH Desktop CLI 0.2.1-rc.3、3182、独立 WhaleMaid dataDir、独立 DSH_PET_TEST_DATA_DIR 与测试鲸鱼 9498；Playwright 经专用 Chromium 9497 和鲸鱼 CDP 读取 DOM、点击并截图。没有在日常 profile 运行模型或修改日常权限；没有调用 Codex 或 Decisions API。模型测试只有本次虚构仓库内的删除和小 HTML 下载，均要求失败后不重试、不更换工具。

| 项目            | 实际结果                                                                                                                                   | 证据                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 桌宠拒绝      | Harness 卡片结束，victim.txt 保留，唯一 rejected 审计。                                                                                    | 01-before-reject.png、01-pet-rejected.png、01-harness-before-reject.png、01-reject-events.json                                                                                                                                         |
| 2 桌宠允许一次  | 两个客户端有不同本地 key，桌宠一项；允许后两端结束，命令执行后文件删除，审计 allowed-once。                                                | 02-multiple-clients.json、02-harness-primary.png、02-harness-secondary.png、02-pet-before-allow.png、02-pet-allowed.png、02-allow-events.json                                                                                          |
| 3 Harness 先答  | 桌宠显示已在 Harness 处理并移出，文件保留、唯一拒绝。                                                                                      | 03-harness-first-before.png、03-harness-first-after.png、03-harness-first-events.json                                                                                                                                                  |
| 4 普通下载      | WhaleMaid 自动 allowed-once，有自动审批记录、downloaded.txt 生成；打开信封期间的 DOM 观察未见审批卡。                                      | 04-download-pet.png、04-download-pet-observation.json、04-download-events.json、04-auto-records.json                                                                                                                                   |
| 5 安静模式      | 新删除审批只亮信封，气泡／提醒框／信封面板未自动打开；打开信封后可拒绝，文件保留。                                                         | 05-quiet-arrival.png、05-quiet-before.png、05-quiet-after.png、05-quiet-events.json                                                                                                                                                    |
| 6 全部 Web 关闭 | 全部关闭后待答项保留，按钮为 0、只有 Harness 提示；重开后恢复 1 组按钮，文件保留。随后仅隐藏的 Electron/Web 客户端在线也能拒绝，审计唯一。 | 06-all-web-closed.png、06-web-reopened.png、06-offline-summary.json、06-offline-events.json、06-hidden-client-pet.png、06-hidden-client-rejected.png、06-hidden-client-observation.json、06-final-events.json                          |
| 7 关闭开关      | 无按钮，仅提示去 Harness；原生 Settings 关闭／重开确实同步，重开恢复按钮。最终版本显示 Harness 处理反馈，文件保留。                        | 07-disabled-before.png、07-disabled-events.json、07-settings-zh.png、07-final-disabled-pet.png、07-final-disabled-setting.png、07-final-reenabled.png、07-final-harness-handled.png、07-switch-ui-live-events.json、07-settings-en.png |

原始失败保留：第 2 次删除在脚本点击前被其他客户端允许，自动审批记录为空，未把它算作自动化成功，后续用户将测试交给脚本才重新生成独立审批；02-unattributed-allow-events.json 保留该历史。受控允许测试最初在命令完成前检查文件，断言失败，随后只等待并核对同一调用，未重发。开关关闭后的处理提示确有一处遗漏，已补齐并以最终 Chromium 四组合及原生真实开关／处理验收验证。首次离线尝试仍有启动器自动打开的 Edge 测试页在线，不算全部离线；用户随后关闭额外测试页，另做最终核对。

## 清理与待确认

最终总账见 acceptance-summary.json：9 次虚构工具调用、9 条 asked、9 条一一配对的 decided（3 次 allowed-once、6 次 rejected，包含保留的干扰试次）。真实验收 1–7 均已核对；没有隐去干扰试次或将脚本早期失败覆盖为通过。Settings 的中英文标签和默认开启均在真实 Harness 页面确认。非 rc.3 宿主没有做本轮运行验收；额外读取了 0.2.0-rc.2 的 sessionStatus 公开声明，仅作为类型历史核对。

| 清理项       | 结果                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日常自动审批 | 已关闭，final-auto-approval-state.json 保存最终状态与本次唯一普通下载自动放行记录。                                                                                                                            |
| 进程和端口   | 已停止本次宿主、鲸鱼、专用 Chromium 和隐藏 Electron 包装窗口；3182/9497/9498/9499 无监听，采集的自有进程均无残留。                                                                                             |
| 隔离配置     | 原 cordis.patch.yml 已逐字节恢复；没有替换日常 profile。                                                                                                                                                       |
| 临时仓库     | **仍保留**在 D:/dsh_plugins/WhaleDot/.dsh-dev/c13b-evidence/fixture。本次没有创建派生工作树，故没有 git worktree remove 对象。自动审批审核拒绝了组合清理命令，返回 blocked by policy；未通过其他方式重试删除。 |
| 记录         | cleanup.json 明确 fixtureRemoved=false，其余进程／配置清理完成。证据、失败日志与配置备份保留供审查。                                                                                                           |

产品已在 whaledot-local 本地提交 `876ce93`（父提交 `37a9971`），标题 `feat: answer approvals from the pet through Harness approval cards`；产品工作区干净，本报告不提交。没有推送、发布或修改版本号。官方 Desktop 自身的托盘隐藏仍属未单独实机验收项；已完成的隐藏试验是隔离 Electron 容器中的真实 Harness Web 客户端。

## 审查（Claude）

**可以接受。** `876ce93` 的做法符合 C13B 的设计：

- 宿主从不自己作答，只把用户在桌宠里的点击转给某个 Harness 窗口已上报的卡片；
- 卡片必须与原生审批日志里同一会话、同一调用对得上；
- Harness 窗口一侧再核对精确的 `key`、`answerable` 和两种答案；
- 重复、离线、超时都返回明确的失败码。

Claude 复测：`npm run build`、`npm run typecheck`、`npm test`、`npm run test:inbox-ui`、`npm run verify:metadata`、`npm run test:desktop` 全部通过。截图 `02-pet-before-allow.png`、`06-all-web-closed.png` 与报告描述一致。

**发现的问题（属于提示词，不是实现）**：普通会话里，桌宠只显示可读原因，即模型自己填写的提权理由（例如 “C13B allow-once acceptance”），看不到实际要运行的命令。Harness 卡片则会附上工具详情。用户在桌宠里点“允许一次”时，依据的只是模型的自述。这是因为 C13B 要求“不下发工具参数”，对审批来说限制过严。建议后续修正：对 `bash` / `pwsh` 审批，宿主按 `callId` 从会话事件中取出命令，脱敏后截断到 500 字，显示在原因上方。WhaleMaid 目标模式的危险审批原因里已包含类别和目标，不受影响。

**其他**：

- 未删除的临时仓库 `.dsh-dev/c13b-evidence/fixture`（没有派生工作树）已由 Claude 删除；
- 官方桌面版隐藏到托盘时能否作答，仍未在实机上单独验证。
