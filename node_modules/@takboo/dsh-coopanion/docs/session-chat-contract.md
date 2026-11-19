# 会话直接续接契约

支持 DSH `0.2.0-rc.2`、`0.2.1-alpha.1`、`0.2.1-rc.1` 和 `0.2.1-rc.2`。共享线协议定义在 [chat-contract.js](../web/chat-contract.js) 和[类型声明](../web/chat-contract.d.ts)，Host 准入在 [chat.ts](../src/chat.ts)，Client 草稿状态在 [session-ui.js](../web/session-ui.js)。

## 消息与回执

Renderer 生成一次提交的请求身份，经 preload → Electron main → Host 原样传递：

```json
{"type":"chat","sessionId":"exact-session-id","requestId":"client-generated-uuid","text":"用户消息","clientTimeZone":"Asia/Shanghai"}
```

文本去除首尾空白，非空且不超过 2000 个 JS 字符；请求 ID 为 1–128 个字母、数字、冒号、下划线或连字符。时区规范化为有效 IANA 时区或 UTC。目标身份不截断、不从当前关注会话重新推导。未知字段、无效身份和空文本不准入。主进程同时验证 IPC 来自自身主 frame，Host 再验证共享请求。

Host 返回同一完整 `sessionId` 和 `requestId`：

```json
{"type":"chat-result","sessionId":"exact-session-id","requestId":"client-generated-uuid","status":"accepted"}
{"type":"chat-result","sessionId":"exact-session-id","requestId":"client-generated-uuid","status":"failed","code":"session/writer-held"}
```

`accepted` 只证明消息已进入目标 Agent 收件队列，或同一身份已经准入。它不是任务完成、模型成功或磁盘 flush 屏障。完成、错误、目标状态、审批及提问继续以 Harness 的正式事件结算；没有自动审批或额外 Agent 调度。

## Host 准入和重试

1. 通过公开 `sessionQuery.observeSession` 读取目标普通会话，检查完整 header 身份和 cwd，拒绝子代理。查询缺失服务、缺失或已删除目标均反馈失败。
2. 同一目标的准入串行执行。复核 `user/message` 和所有 `agent/inbox/spliced.inserted` 中客户端 `source.rpcId` 对应的文本及时区；完全相同返回接受，不再写入，身份冲突返回 `coopanion/request-conflict`。检查包括已经领取或取消的收件记录；重试不会复活用户另行取消的队列消息。
3. 新请求核对公开模型投影 `modelSelection.next`（未选择时使用公开模型目录的默认项）是否仍在可路由目录。没有可用模型明确返回 `session/model-unavailable`，不为会话替换模型。
4. 调用公开 `sessionController.prompt`，固定 `mode: queue`、准确文本和时区。由控制器恢复冷会话及其正式 preset、模型、工具和权限；不创建替代会话、不使用已有 Agent 的直接 `followup()` 作为回退。
5. 保留控制器错误码，包括占用、权限限制、缺失会话与暂时不能接收。其他失败使用明确的不可用反馈。取消在准入前生效；宿主控制器在 `prompt` 开始之后不再观察 caller signal，已接受消息仍报告接受，后续取消任务由 Harness 负责。

宿主控制器仅检查当前 inbox 和 `user/message`，无法覆盖“已领取、尚未写入 user/message”的间隙，异步准入也存在并发窗口。持久收件记录复核与串行化均为必要行为，不能删除为单纯依赖控制器去重。Host 内保留最近 512 个请求身份用于跨目标冲突检查；重启后的去重依据目标会话中实际保留下来的正式记录。不同目标使用不同请求 ID。

## 草稿和显示

每个会话独立保存当前窗口内的草稿与提交状态。发送时固定请求内容、时区和目标，快速重复点击被发送状态拦截；切换关注会话不改变在途请求。草稿在收到完全匹配的接受回执后才清空。失败或 15 秒未收到回执保留草稿，重试使用原身份；修改正文再发送成为新请求，新消息即使正文相同也使用新 ID。接受状态不被迟到失败覆盖。

从收件箱或完整回复选择“继续对话”会显式选择该来源会话并打开桌宠输入框；“打开源会话”仍可从聊天框返回 Harness。阅读本身不切换关注会话，正在阅读的正文保持其捕获快照，新结果另计未读。草稿只保留在当前窗口运行期，重载或关闭后丢失。

启动时通过正式列表与查询恢复最多 100 个最近的普通会话，不激活冷 Agent、不调用模型，历史回复作为已读基线。Agent 分离不证明持久会话被删除，保留其续接入口；实际提交时重新核对目标是否仍存在。不可用目标保留明确失败反馈，不改投其他会话。

恢复只重建原生视图，Host 重新发送当前快照，不重新执行上述历史查询或聊天提交。崩溃前已接受消息仍在 Harness 队列，未收到接受回执的 renderer 草稿会随窗口丢失；恢复不会推断成功或自动重放输入，用户可回到源会话核对。跨进程草稿持久化仍在范围外，详见[恢复契约](desktop-recovery-contract.md)。

[文字缩放](text-readability-contract.md)只改变当前 Renderer 的样式与面板测量，保留草稿、在途请求及捕获正文；不产生新的发送、关注切换或已读确认。

## 专属陪伴会话与默认选中契约

### 专属会话识别与快照

Host 端在恢复或列出会话时，通过检查公开的会话 header：
- 若 `session.header.agentPreset === 'whaledot-companion'`，列入伴侣会话历史。
- 若存在多个符合条件的专属会话，取最近创建（`createdAt` 最大）且未删除的一个作为主伴侣会话。
- Host 快照（`PetSnapshot`）下发 `companionSessionId: string | null` 字段。
- Host 为当前会话下发 `companionRole: 'current'`，旧伴侣下发 `'earlier'`，普通会话不设此字段。Renderer 与托盘共享身份判断，只有 `companionSessionId` 指向的会话是当前伴侣。
- 当专属会话实际被删除时，次新的升为当前伴侣，或置为 `null`。Agent 分离不等于会话删除。删除所选会话仍按 C07 选择第一个剩余会话，不偏向伴侣。

### 默认聊天对象选择契约

配置项 `defaultChatTarget`（可选值 `'companion' | 'last'`，默认 `'companion'`）：
1. **双击打开聊天**：
   - 当 `defaultChatTarget !== 'last'` 且 `snapshot.companionSessionId` 存在时，双击桌宠默认选中 `companionSessionId` 打开聊天。
   - 当 `defaultChatTarget === 'last'` 或不存在 `companionSessionId` 时，保留当前活跃的 `sessionId`。
2. **会话列表排序与呈现**：
   - 只有当前专属会话在会话列表中固定置顶排序于第 0 位；旧伴侣按普通会话排序，显示「大肥鱼（旧对话）」/「Dafeiyu (earlier chat)」，卡片与来源均隐藏内部工作目录；
   - 专属会话卡片携带 `.companion-card` 类，前置角色头像（`.companion-card-portrait`），名称展示为「大肥鱼」（英文「Dafeiyu」），隐藏 `cwd` 工作目录；
   - 选中专属会话时，聊天顶部胶囊展示「和我聊天」，清空细节信息，隐藏「回到和我聊天」；
   - 选中其他工作会话时，聊天顶部胶囊展示工作会话名称与工作目录，并显示「回到和我聊天」按钮（`#chat-to-companion`），点击后无缝切换回伴侣会话。
   - 有伴侣时，列表选中工作会话后直接打开其输入框。默认对象为大肥鱼时，下一次双击会回到大肥鱼，因此必须在点选后立即允许用户与工作会话聊天；没有伴侣时保留 C07 的只关闭列表行为。
   - 当前伴侣的提示为「直接和我说就好，我会在这里回你。」（英文「Just talk to me — I’ll reply right here.」），发送按钮为「发送」/「Send」；工作会话保留转交文案。
3. **气泡、阅读器与信封来源**：
   - 专属会话产生的回复，气泡状态文本展示「大肥鱼」；
   - 阅读器标题展示「大肥鱼」，副标题隐藏工作目录只保留时间；
   - 信封列表中，回复卡片来源名称展示为「大肥鱼」，卡片细节仅展示「阅读回复」而隐去工作目录。

### 空白草稿会话

Harness 会为每个工作区保留一个尚未开始的“新会话”草稿（`session.list` 中 `blank: true`，例如 Web UI 停在某个工作区的新会话页时）。Host 快照为每个会话下发 `blank`：在收到任一 `turn/start` 或 `user/message` 之前为 `true`；当前大肥鱼会话、带待处理提问或审批的会话不算空白。

桌宠会话列表与托盘列表不显示空白草稿，除非它正是当前选中的会话；选中规则、气泡、信封来源名称不受影响。草稿一旦开始对话，就作为普通会话出现在列表里。

### 已归档会话

Harness 的工作区登记服务维护全局归档集合（`workspaceRegistry.archivedSessionIds`），Harness 侧栏默认不显示其中的会话；`sessionController.list` 不过滤它们。该服务没有变更事件，Host 每 2 秒读取一次内存中的集合（另在启动时读取），变化时下发带 `archived` 的快照。

- 会话列表与托盘列表不显示已归档会话，除非它正是当前选中的会话；选中的已归档会话标注“已归档”。
- 选中的会话已归档时，聊天输入与发送按钮禁用，说明行和输入框占位文字提示“可以在 WhaleMaid 面板或 Harness 里恢复后再继续”；两种界面风格都可见。
- 宿主的已归档会话门禁会先接受消息、再在模型步骤前静默拦下；为避免“已发送却没有回复”，Host 准入时先检查归档集合，命中则以 `session/archived` 失败并保留草稿。
- 已归档来源的未读回复仍可在信封和阅读器中阅读，但不提供“继续聊”。
- 桌宠不提供归档或恢复操作，也不调用 `archiveSession` / `unarchiveSession`；恢复后在下一次读取时自动重新出现。


## 会话名来源

显示优先级：**大肥鱼角色名 > 最新会话标题 > 工作目录名 / 第一条用户消息**。

- 当前与历史专属会话始终使用现有本地化角色名「大肥鱼」/「大肥鱼（旧对话）」，不被 Harness 标题覆盖。
- 普通会话取最新 `session/title` 事件的标题，去掉首尾空白，按 Unicode 字符最多保留 64 字；冷会话的历史标题与实时改名使用相同规则。
- 标题为空白或无效时回退：没有真人消息时显示工作目录名，首条非空真人消息到来后使用其前 64 字。后续消息不覆盖标题或首条消息的回退名；现有 `prompt` 摘要照旧更新。
- 会话列表、聊天标题、信封来源、提醒标题及托盘从同一 Host 会话模型取名。改名只影响显示，不调整会话选择、排序时间、已读或完成判断，也不向外部服务发送标题。

## 可选的回复情绪反应

`decisionsReactions` 默认关闭。`decisionsProvider` 在设置中单独选择 OpenAI 官方（默认，`gpt-6-luna`）或 OpenRouter（`openai/gpt-6-luna-decisions`），只请求所选 Decisions 服务，分别只读取 `OPENAI_API_KEY` 或 `OPENROUTER_API_KEY`，不混用、不回退。切换服务后丢弃旧请求返回。仅在 `PetModel` 提交新的最终 `PetResult` 后触发；流式内容、恢复的历史、重复 result id、WhaleMaid 自动任务（标题以 `[WhaleMaid]` 或旧的 `[WhaleDot]` 开头，或带任务前缀）、归档会话均跳过。大肥鱼回复不豁免片段截断。每个 result 最多一次；先预留共享的滚动小时配额，再异步请求，3 秒超时且不重试。请求仅含回复开头、固定问题和固定表情候选；不附加会话元数据。详细隐私边界见 [使用指南](usage.md)。

成功选择经内部 bridge 发送 `{ type: 'reaction', resultId, sessionId, expression, at }`，不进入通知队列，不改变未读、任务完成、聊天接受或审批结算，也不提供外部表情接口。渲染页检查 15 秒有效期、会话最新结果、真实角色词表及交互状态；用现有短反应时钟保持 2.5 秒，暂停自主表情映射后恢复。工作、等待、错误立即接管；拖拽、被拎起、减少动态效果时不播放，后来的点击或通知反应取代它。安静模式允许表情，但不因此打开面板。恢复与重启不重播 reaction。`reactionStatus` 只携带密钥是否存在与本次运行尝试数，计数包含请求失败，不代表服务端成功或计费次数。

## 在桌宠里回答审批

“在桌宠里回答审批”默认开启。信封中的“需要批准”事项显示来源会话和可读原因，可选“允许一次”“拒绝”，或“去 Harness 查看”。这等于按下 Harness 原审批卡的按钮，不增加审批策略，也没有“总是允许”。允许按钮在打开面板后 1 秒才可点，默认不获焦点，回车不会允许；拒绝可立即点。

需要至少一个 Harness 窗口（桌面主窗口或已连接 Web 界面）持续运行。客户端插件随窗口启动，不依赖设置页是否打开；连接离线超过 5 秒后撤下可答入口，信封仅提示“请在 Harness 里处理”。重新连接后恢复。多个客户端的同一会话／调用只显示一项，作答交给最近上报的客户端；Harness 先答后桌宠显示“已在 Harness 处理”并移出。

关闭该开关后，客户端不上报审批摘要、不作答，信封仍可打开源会话。摘要只含客户端／卡片／会话／调用身份、工具名、出现时间和最多 600 字的可读原因，除下述命令和目录外，不含其他工具参数。安静模式照常只亮信封；普通模式沿用待处理提醒。菜单和托盘没有审批按钮。

开启 WhaleMaid 日常自动审批后，已自动放行的普通命令不会到达桌宠，危险操作才会进入人工审批。多选提问和计划审阅仍在 Harness 处理。旧宿主没有 rc.3 的公开卡片能力时，仅保留 Harness 入口。


### 审批中的命令与模型说明

bash／pwsh 审批按公开会话事件的精确 callId 取得要运行的 command，可选显示 workdir。信封先显示等宽命令块及目录，再以次要文字显示“模型说明：”；说明来自模型，只作参考。其他工具继续显示原因，并提示去 Harness 查看详情。

命令和目录在宿主端隐去常见密钥／令牌及环境变量赋值中的值，去掉控制字符（保留换行），最多 12 行、500 字符，超出附“…（已截断）”。只下发处理后的 command/workdir，不附 description、justification、超时或沙箱参数。找不到对应调用、JSON 无法解析或 command 缺失时，显示“未能取得命令，请在 Harness 查看”，允许按钮保持禁用，宿主也拒绝允许请求；仍可拒绝或打开源会话。已有的 1 秒防误触与原生 Harness 卡片作答通道不变。
