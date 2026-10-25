# C13B 鲸鱼插件：在桌宠里回答审批（经 Harness 自己的审批卡）

**前置**：`D:\dsh_plugins\dsh-coopanion` 的 `whaledot-local` 分支工作区干净，包含 `37a9971`。先跑 `npm test` 和 `npm run test:inbox-ui`，确认基线通过。若工作区不干净，先停下说明。

**执行环境**：本任务要写 `D:\dsh_plugins\dsh-coopanion`，报告和证据写在 `D:\dsh_plugins\WhaleDot`，还要能运行 Git、Chromium 和 Electron。会话必须在开始时就具备这些权限；做不到，立即停下说明。宿主为 DSH Desktop **0.2.1-rc.3**。

> **改名说明**：项目已从 WhaleDot 改名为 WhaleMaid。本地目录 `D:\dsh_plugins\WhaleDot`、隔离 profile `whaledot-p02` 保持旧名。

## 背景

C13 第二部分停在这里：把桌宠作为 `approval/request` 链上的第二个回答者，无法在桌宠先答时撤回 Harness 的审批卡（见 `docs/coopanion/c13-report.md`）。

审查时找到了**不需要第二个回答者**的公开做法：**桌宠直接按 Harness 自己审批卡上的按钮。**

- Harness 窗口里的审批卡由 `@deepseek-ai/dsh-client-ui-approval` 呈现。每个待答审批是一个 `PendingApproval` 对象，有公开的：
  - `sessionId`、`key`、`kind: 'approval'`；
  - `toolName`、`callId`、`reason`、`displayReason`；
  - `answerable`；
  - `answer(outcome: 'allowed-once' | 'rejected'): Promise<void>`。
  
  出处：rc.3 包的 `lib/types/client/contract/slots.d.ts`。
- 它通过 `@deepseek-ai/dsh-client-ui-session` 的 `ctx.uiSession.registerPendingInteraction` 发布。任何客户端插件都能从公开的 `ctx.uiSession.sessionStatus`（类型 `HostObservable<ReadonlyMap<SessionId, SessionStatus>>`，每项带 `pendingInteraction`）读到它。出处：`lib/types/client/index.d.ts`。Harness 自己的其他包也这样读。
- 鲸鱼插件本来就有一段客户端代码运行在 Harness 窗口里（设置页 `src/client/`，以及 `NotificationClient`）。它可以订阅 `sessionStatus`，并对 `kind === 'approval'` 且 `answerable` 的项调用 `answer()`。这相当于用户在 Harness 里点了按钮：卡片自然结束，宿主审计照常记录，**不存在竞争和撤回问题**。

**限制**：只有 Harness 窗口（桌面版主窗口或已连接的 Web 界面）在运行时才能这样作答。窗口隐藏到托盘时渲染进程通常仍在运行，要实测。

## 先查证（写进报告）

1. 用 `npm pack` 取得 `@deepseek-ai/dsh-client-ui-session@0.2.1-rc.3` 和 `@deepseek-ai/dsh-client-ui-approval@0.2.1-rc.3` 的类型声明，确认上述接口；只作为 `import type` 的 devDependency 引入，**不打包它们的运行时代码**。版本范围与现有 `@deepseek-ai/*` 一致，并同步 `npm-shrinkwrap.json`，让 `verify:metadata` 通过。
2. 鲸鱼插件的客户端入口能否 `ctx.inject(['uiSession'], …)`？客户端代码在哪些情况下运行：设置页没打开时是否运行（参照 `NotificationClient` 的启动方式）、窗口隐藏到托盘时是否运行？
3. 同时连着多个 Harness 客户端时（桌面窗口加远程 Web），每个客户端各有自己的 `PendingApproval`，`key` 只在本客户端内唯一。一个客户端作答后，其他客户端的卡片会不会随之结束？实测并写清楚。

## 实现

### 客户端（Harness 窗口内）

- 新增审批桥接模块，与 `NotificationClient` 的生命周期一致，不依赖设置页是否打开。
- 订阅 `ctx.uiSession.sessionStatus`。对 `kind === 'approval'` 且 `answerable` 的项，向鲸鱼插件宿主上报摘要：
  - 客户端 ID（复用现有的 clientId）；
  - `key`、`sessionId`；
  - `toolName`；
  - 可读原因：优先用 `displayReason`，经 `ctx.locale.resolveText` 解析，没有就用 `reason`；截断到 600 字，去掉控制字符；
  - 出现时间。

  项消失或变为不可答时，同步撤下。**不上报**工具参数。
- 宿主下发作答指令 `{ clientId, key, outcome }` 后，客户端必须核对：
  - `clientId` 是自己；
  - 这个 `key` 的项仍在 `sessionStatus` 里，且 `answerable`；
  - `outcome` 只能是 `allowed-once` 或 `rejected`。
  
  核对通过才调用 `answer(outcome)`，然后回执成功或失败原因（已不存在、已作答、调用失败）。
- 上报和取指令都走现有已认证的 Connection 通道，参照 `notification-state` / `notification-claim` 的做法，轮询间隔不超过 1 秒。

### 宿主端

- 按客户端维护待答审批列表；客户端超过 5 秒没有上报，就视为离线，撤下它的项。
- 同一审批在多个客户端都出现时（`sessionId` 与 `callId` 相同），桌宠只显示一项；作答指令发给最近上报的那个客户端。
- 桌宠的作答走现有已校验的 IPC 和 Host 通道，与聊天、提问回执的校验一致：
  - 来自本窗口主 frame；
  - 指向的项仍在列表中；
  - 答案只能是 `allow-once` 或 `reject`，映射为 `allowed-once` 或 `rejected`。
  
  过期、重复或不匹配的回答一律拒绝，并返回明确的失败码。
- 没有任何客户端在线时，信封里的审批只显示“请在 Harness 里处理”，没有按钮。
- **不提供**“总是允许”“本会话都允许”之类的选项，不修改审批策略。

### 桌宠界面（两种界面风格都要做）

沿用 C13 第二部分的设计：

- 待审批事项出现在信封里，标记为“需要批准”，信封计数包含审批。
- 打开后显示：
  - 来自哪个会话；
  - 要做什么，即可读原因；
  - “允许一次”和“拒绝”两个按钮，以及“去 Harness 查看”入口（打开源会话）。
- **防误触**：
  - “允许一次”不是默认焦点，按回车不会触发允许；
  - 面板打开后 1 秒内允许按钮不可点；
  - 拒绝可以立即点。
- 回答后显示“已允许”或“已拒绝”，然后移出信封。Harness 那边先答了的，显示“已在 Harness 处理”后移出。
- **安静模式**：照常只亮信封、不弹框。普通模式：新的审批像提问一样弹出提醒。
- 设置里加开关 **“在桌宠里回答审批”**，**默认开启**，中英文案。关闭后，客户端不上报、不作答，信封只提示去 Harness。
- 菜单、托盘不提供审批按钮。

### 文档

`docs/usage.md` 和 `docs/session-chat-contract.md` 说明：

- 桌宠作答等于按了 Harness 审批卡上的按钮；需要 Harness 窗口在运行；
- 只有“允许一次 / 拒绝”；
- 防误触规则；
- 开关的作用；
- 开启 WhaleMaid 日常自动审批后，普通命令不会到达桌宠，危险操作才会。

## 测试

- **单元**：
  - 只上报 `approval` 类型且可作答的项；
  - 指令核对：`clientId`、`key` 已消失、已作答、非法答案；
  - 客户端离线后撤下；
  - 多客户端去重与指令路由；
  - 下发内容不含工具参数；
  - 开关关闭时不上报、不作答。
- **界面（Chromium）**：
  - 两种界面风格下都能显示和回答；
  - 1 秒防误触；
  - 回车不触发允许；
  - 安静模式下不弹出；
  - 中英文案。
- `npm test`、`npm run test:inbox-ui`、`npm run test:desktop`、`npm run verify:metadata` 全部通过。

## 验收（隔离环境）

环境：profile `whaledot-p02`，启动命令 `$env:DSH_PET_TEST_DEBUG_PORT='9498'; & .\scripts\dev-host.ps1 -UseUiKey`；测试鲸鱼使用 `DSH_PET_TEST_DATA_DIR`；打开 Harness Web 界面作为客户端。

在 `.dsh-dev/` 下建一个临时 Git 仓库，作为普通会话的工作目录，权限预设为“需确认”。打开 WhaleMaid 日常自动审批。

1. 让模型删除仓库内一个临时文件，审批出现在桌宠信封里。在桌宠里点“拒绝”：
   - 命令没有执行；
   - Harness 里的审批卡已结束；
   - 会话日志中 `approval/decided` 为拒绝。
2. 再造一次，在桌宠里点“允许一次”：命令执行，Harness 卡片同步结束。
3. 再造一次，在 Harness 里先回答：桌宠一侧显示“已在 Harness 处理”并移出信封。
4. 让模型下载一个小文件：被日常自动审批放行，桌宠**没有**出现审批。
5. 安静模式下再造一次删除审批：只亮信封，不弹框。
6. 关闭 Harness Web 界面，再造一次：桌宠只显示“请在 Harness 里处理”，没有按钮。重新打开界面后，按钮恢复。
7. 关闭“在桌宠里回答审批”：桌宠里只有提示，没有按钮。

每步截图，并核对会话日志。

清理：

- 关闭日常自动审批；
- 停止测试宿主与测试鲸鱼，3182 / 9498 无监听；
- 恢复隔离配置；
- 删除临时仓库，用 `git worktree remove` 移除派生的工作树；
- 不在日常 profile 测试。

报告写到 `D:\dsh_plugins\WhaleDot\docs\coopanion\c13b-report.md`，证据放 `D:\dsh_plugins\WhaleDot\.dsh-dev\c13b-evidence\`。报告不要提交。

## 提交

在 coopanion 本地提交 `feat: answer approvals from the pet through Harness approval cards`，**不推送**。完成后停下，等审查。

## 不做

- 不在 `approval/request` 链上加回答者，不修改审批请求对象，不用私有字段或猴子补丁。
- 不加“总是允许”，不改审批策略，不自动批准任何东西（自动批准是 WhaleMaid 的事）。
- 不处理多选提问和计划审阅（仍在 Harness）。
- 不改 WhaleMaid。
