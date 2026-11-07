# 提醒接口：protocol 1

共享定义位于 [notification-contract.ts](../src/notification-contract.ts)，网页通知适配器位于 [system-notifications.ts](../src/client/system-notifications.ts)。Host、DSH Client 与桌宠随同一安装包消费这些定义。

## 身份与事件

提醒 id 使用 `[sessionId, turn, seq, category, stage]` 的 JSON 元组编码；请求 id 使用 `[sessionId, kind, nativeId]`。各字段保留完整值。稍后提醒使用可选调度轮次；无日志 callId 的运行请求使用完整 runtime UUID 并标记 `source: runtime`，上下文 turn／seq 保留已提交锚点。runtime 元组依次追加 UUID 与可选调度轮次。`stage` 区分 `initial` 和 `reminder`。

类别为 `reply`、`goal-progress`、`completed`、`approval`、`question`、`error`、`stopped`、`interrupted`、`blocked`、`max-tokens`。每条提醒带标题、预览、源时间和对应请求 id 列表；合并互动通过请求列表关联各自的结算状态。

error 的进入动作与持有表情统一使用不流泪的 `worried`；同一状态不重复播放，通知到达不重复播放已经应用的担心动作。自动动作（含陪伴/NPC）不调用 `sad`／`cry`，仅角色面板的手动预览保留它们。查看异常后沿 C04 本机回执立即释放担心状态；提醒类别、错误事实和未读语义不变。

审批从 `approval/asked` 与 `approval/decided` 的原生 id 配对。提问从公开 `user-questions/request` 获取运行中的提示，从 `ctx.sessionProjections.snapshot(session, ['userQuestions'])` 获取持久限时提问的 `open`、`continued` 和 `settled` 状态。具体请求由完整 `callId` 定位。

限时提问返回 pending 后，回合结束仍保持 `continued`。接收 `user-question-reply` 的 user message 后结算对应问题；补提醒按投影中的有效请求安排。阻塞请求在其答复／取消信号结算时结束等待。Host 对恢复状态进行折叠，实时事件产生新的提醒。

## 完成语义

Host 的共享 `CompletionTracker` 使用支持版本的 `@deepseek-ai/dsh-goal` 公共 `applyGoalProjection` 严格折叠已提交事件，不读取工具调用参数或工具输出作为成功依据。该宿主包声明为 peer；目标服务未运行、历史缺失、未知版本或投影折叠失败时立即使用 `reply`，不等待目标状态。失败后的流保持保守降级。

| 已提交事实 | 类别 / 角色 | 结果与文案 |
|---|---|---|
| 普通回合 completed、没有可确认的新目标完成 | reply / idle | 本轮回复已生成；保留全文、未读与继续入口 |
| 当前目标 active，回合 completed | goal-progress / idle | 本轮回复已生成，目标仍在进行中 |
| 本轮内同一完整目标身份提交 complete，回合 completed | completed / happy | 目标已完成；庆祝约 2.5 秒 |
| 当前目标 paused / blocked | stopped / idle 或 blocked / waiting | 目标暂停或受阻；保留结果及异常入口 |
| 回合 error / aborted / interrupted / blocked / max-tokens | 沿用相应异常类别 | 即使本轮提交过 complete，也不以回合结束报成功 |

提醒可附带 `goal: { id, revision, round }`，每个字段保留完整值；`round` 为严格投影中已接纳轮数。`completed` 专指确认的新目标完成，`reply` 和 `goal-progress` 都不触发成功神态。目标完成身份只结算一次，历史终态不把后续普通回合变成成功。宿主在回合外提交终态（如自动轮数耗尽后 block）也更新角色和提醒，以该 `goal/change` 的 seq 为锚点。

类别和可选 goal 字段是 protocol 1 的同包扩展，Host / Client / Electron 必须一起更新；不在持久配置中保存提醒，所以旧配置沿用默认值，旧通知不会迁移为新通知。历史恢复折叠目标及回复作为已读基线，不重放提醒。审批与 continued 提问仍独立结算，阅读和打开会话不代表审批或答复。角色、系统通知和托盘通过共享类别呈现，正文保持原文。

发送接受回执独立于提醒与任务结果，详见[会话续接契约](session-chat-contract.md)。阅读结果不改变关注会话；显式点击“继续对话”才选择来源会话并打开输入框。审批继续由 Harness 的实际处理结算；提问也可通过原请求的信封答复结算。

## 运行与领取

`NotificationRuntime` 包含阶段、运行代次 `generation`、显示状态版本 `visibilityRevision`、原生可见性、休眠状态和有界错误。

包含 `recovering` 阶段与可选 `desiredVisible`、`recoveryAttempt`（0–3）、`retryAt`（Host 时间戳）。恢复等待不具备投递资格；显示意图不代表原生可见性。新代必须收到自己的 visibilityRevision，旧领取仅结算迟到证据，不再进入其他通道。具体启动、停止、锁屏及结果基线见[桌面恢复契约](desktop-recovery-contract.md)。旧配置没有新增持久字段，默认行为保持；Host / Client / Electron 随包同步。

Host 按运行状态、显示状态及用户设置选择通道。系统投递需要 Host 颁发的 `DeliveryClaim`，其中包含不可推断的 token、完整提醒、客户端 id、运行代次、显示状态版本及过期时间。

| Connection 方法 | 请求 | Host 返回／行为 |
|---|---|---|
| `coopanion/notification-state` | 空对象或可选 locale | `NotificationSnapshot`：protocol、运行状态及待处理请求 |
| `coopanion/notification-claim` | clientId、generation | 当前有效 `DeliveryClaim` 或 null |
| `coopanion/notification-receipt` | `DeliveryReceipt` | 验证 token、客户端、提醒及代次后记录回执 |
| `coopanion/notification-test` | clientId、generation | 用户操作创建或复用公开源会话，返回对应完整提醒的领取；角色运行且隐藏时可用 |
| `coopanion/notification-snooze` | interactionId、generation | 为当前有效请求重新安排到期时间 |

方法使用对应 `/api/coopanion/<endpoint>` 的公开 Connection 载体。请求按共享严格 schema 校验。Host 负责服务端领取令牌、单次领取、停止取消、迟到回执处理与请求结算；入口装配见 [index.ts](../src/index.ts)。

## 网页通知

`SystemNotifications` 提供 `status()`、`requestPermission()`、`deliver(claim)` 和 `dispose()`。运行时注入实际 Web Notification API、回执函数、源会话操作与时钟。

`status()` 报告网页权限，系统授权保持 `unknown`。`requestPermission()` 由启用按钮触发。`deliver()` 验证领取期限、网页权限和本客户端的 token 去重，使用提醒 id 作为通知 tag，并保持系统通知静音。

回执分为 `requested`、`shown`、`clicked`、`failed`、`unknown`。构造通知产生 requested；实际 onshow 产生 shown；实际 onclick 产生 clicked 并调用对应完整 sessionId 的会话操作；onerror 和构造失败产生 failed。回执字段完整关联原领取。OS 授权、通知中心留存及窗口激活以实机结果记录。

`dispose()` 释放事件回调和本地引用，已送达通知由 OS 管理留存。Client 按 Host 运行代次管理适配器生命周期，并接入权限说明、测试反馈及状态刷新。

## 配置与动作

通知配置包括 `notifications=true`、`systemNotifications=false`、`reminders=true`、`reminderDelayMs=600000`。提醒延迟允许 1 分钟至 24 小时。关闭提醒取消主动投递与计时，状态和结果继续随会话更新。

打开会话、确认回复已读和稍后提醒分别操作对应会话、结果和请求。查看动作保留请求的待答／待审批状态；实际结算来自原审批／提问的处理结果。

通用异常／暂停的查看回执：点击“去处理／Take a look”打开源会话，或关闭与当前事件身份完全相同的异常提示后，Renderer 清除该轮信封和持续担心／等待神态，已排队同源无请求异常提示同步撤下。Host 提供由完整 sessionId、结束类别、turn、持久事件 seq 组成的 attentionId；本机回执按该身份保存，跨重载和 Harness 重启有效，不依赖渲染修订或显示文字。同一会话的新异常有新事件身份，仍正常提醒。无稳定事件身份的旧同包快照只保留当前窗口内查看回执。

continued 提问按完整 sessionId、continued 类型与 native callId 保存查看记录；打开其源会话或关闭含该请求的提示后，信封及同一请求的提示撤下。Host/Broker 的 pending 状态与公开投影不被改写，原会话仍可回答。open 提问和审批不接受这种回执，查看后及重启后仍保留入口；“稍后”只走现有 snooze，不写入查看记录。其他未读回复不受影响，回复仍由历史恢复建立已读基线。

Electron userData 的 inbox-receipts-v1.json 是 schema 1 本地呈现存档，最多 1000 条、30 天；仅保存身份与查看时间，不保存文字。写入串行、同目录临时文件原子 rename；退出等待已接收写入完成。损坏档从空恢复，下次有效写入替换它；写入失败保持原有效档，当前窗口仍可查看，控制台给出固定提示。main 只接受自身可信主 frame 且匹配当前可查看状态的键。回执不修改任务状态、聊天来源、Host 托盘事实或请求结算，不能将失败标为成功。

## 检查

`npm run test:n0` 检查共享协议和网页适配器，并构建私有原型。`npm run test:n0:host -- --runtime <runtime-dir> --version <dsh-version>` 在实际安装的宿主包上检查公开请求、投影、审批配对和取消语义。

三平台 CI 执行共享检查并保留原型摘要；十二组实际安装检查分别执行对应宿主版本的接口检查并上传报告。每份 Host 报告记录源码 commit、插件版本、包实现摘要及实际控制样本事件。

独立 `textScale` 是呈现偏好，不改变类别、提醒身份、已读/结算或驻留时间；详见[文字契约](text-readability-contract.md)。

[陪伴邀请](companionship-contract.md)是独立本地互动，不进入本 protocol 的提醒类别、领取、收件箱、已读或审批结算；任务及阅读占用出现时立即撤去邀请。今天安静只影响陪伴，不更改本契约的任务通知偏好。

## 信封内作答（C01，本地扩展）

`inlineQuestions=true` 默认开启。Host 在 protocol 1 的 question interaction 上可附加 `questions`，包含完整 id/question/detail/header/options，供同包 Renderer 展示。审批不附加表单；multiSelect、任何 intent（含 plan-review）、未知字段、重复问题 id／选项 label、超限内容及无法确认原 live root 的请求均保留 Harness 路径。关闭设置返回旧快照和旧 waterfall 行为。

| 通道 | 消息与规则 |
| --- | --- |
| Renderer → `pet:action` → Electron main → Host | `question-answer`：interactionId、requestId、generation、answers；main 仅接受可信主 frame，三层共享严格解析器 |
| Host → main → Renderer | `question-answer-result`：相同关联字段、accepted／failed、有界分类 code；旧请求回执不改变新表单 |
| 原 live request | `user-questions/request` 的回答与下游 Harness 回答竞争同一次结算；独立下游 AbortSignal 关闭另一界面，不取消调用方 signal、Agent 或回合 |
| continued request | public `userQuestions.answer(agent,callId,answer)`；REPLY_QUEUED 拒绝重复，false 为过期；不创建会话、不 prompt 或伪造工具结果 |

Host 重新检查当前 running 代次、待答 id、原 live root 及 source signal、整批问题 id 和选项 label 完全相同。最多 16 题、每题 32 个选项；问题 id 2048、问题 8192、detail 65536、选项 label 4096、说明 8192、header 256 字符，总展示 JSON 131072 字符；超限不截断身份。requestId 最多 128 个限定字符，其他文字最多 2000 字符，单选 custom 覆盖 selected。通用 DSH 问题没有 allowOther 字段，custom 是原 API 的答案数据；不解释成动作、命令或权限。

表单按问题和运行代次保留草稿，原状态结算后撤下；选择／其他互斥，提交后禁止重复。十秒未收到回执只报未确认，不自动重发。公开接口接纳答复和任务完成分别判断。取消、别处已答、过期代次、伪造标签和批次缺题不得产生第二次答复；使用 `tests/notification-integration.test.ts`、`tests/question-contract.test.js`、收件箱浏览器与原生 IPC 测试验证。公开 DSH 0.2.1-rc.2 的出处见 WhaleDot `docs/dsh-api-notes.md` 第 20 节。

## 安静模式（C09，本地扩展）

`quietMode: Volatile<boolean>` 默认 false，经过现有 `preference` 布尔白名单、`settings.mutate('dsh-coopanion', ...)` 与 configure 同步；菜单和托盘显示已确认值，保存失败不提前翻转。设置页与 Client 领取偏好使用同一字段，旧配置默认 false。

安静模式只取消主动呈现，不关闭 `notifications`：Host 保留回复、请求快照、原 live root 答题与 snooze，拒绝系统领取，不排入新的投递；Client 在领取后、构造系统通知前再次检查。已提交 OS 的通知不能撤回，迟到回执仅作为原领取的证据。进入安静模式时撤销待投递与旧自动提醒机会，安静期间的新请求不安排自动补提醒（`automaticReminders=1` 表示机会已消耗，不表示已送达）。显式 snooze 仍可安排新的到期时间；安静时到期消耗此次调度且不投递，关闭后不会补投。未到期的显式 snooze 仍按到期时的偏好处理。

Renderer 在 `showNextReply`、`presentNextNotice` 和 `message.notice` 入口拦截自动卡片；撤下已显示气泡不产生已读。安静期间收到的完整 result id 仅记入呈现集合，通知展示队列清空，关闭后不重放；信封阅读、主动聊天、当前阅读快照和草稿保留。仅信封计数的一次轻跳作为可选提示，减少动态效果时停用。

陪伴邀请、反馈及应用诊断 toast 使用最多三种本窗口本地卡片，独立于 protocol 1 请求、领取、已读与结算；同种内容合并。它们进入信封计数，用户打开信封后才显示操作。邀请的持久日预算仍由原 CompanionStore 处理；本地入口保留到用户选择或关闭陪伴，不因原浮动卡十秒到期而消失。窗口重启或换角色清空本地卡片，不推断任务或邀请已处理。

检查包含 `npm test`、`test:inbox-ui` 内的中英文／新版经典场景、`tests/companionship-ui.mjs` 的邀请保留，以及 `test:desktop` 的原生托盘同步。浏览器替身和受控通知检查不代表真实宿主／OS 送达验收。
