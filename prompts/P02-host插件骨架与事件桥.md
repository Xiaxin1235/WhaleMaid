# P02 host：DSH 插件骨架、事件桥、Desktop 通信（M0）

## 目标
让 `dsh-whaledot` 能被 DSH 装载，订阅真实会话事件，把它们投影成**结构化的 Agent 状态**，通过本地 WebSocket 推送给桌面端。

## 先调研（写代码前完成，并在回报中列出出处）
1. 读 `dshfind` 教程 `dev/04-listen-events`、`core/09-event-system`，以及 `@linxin666/dsh-pet/src/event-projection.ts`、`src/index.ts`、`src/host/*`：弄清楚
   - 插件如何拿到会话事件（是 `ctx.on('session/event', …)` 还是别的服务），事件对象结构（`type`、`time`、`sessionId`、`turn/end` 的 `reason` 等）；
   - dsh-pet 的 `inject` 列表和它如何判定“哪个会话是当前会话”。
2. 查 `@deepseek-ai/dsh-api-gateway` 的 `.d.ts`，确认 `ctx.typertGateway` 的类型与可用 namespace（本任务只用于**读取**会话列表/标题，不创建会话）。
3. 查 Cordis 的 `ctx.effect` / `ctx.on` / 插件 `Config`（schemastery）用法。

## 要做的事

### 1. `packages/protocol`
- `PROTOCOL_VERSION = 1`。
- zod schema：
  - `AgentActivity`：`{ sessionId, sessionTitle?, state: 'idle'|'thinking'|'reading'|'executing'|'waiting-approval'|'done'|'failed'|'paused', toolName?, since, turnId? }`
  - Host→Desktop 消息：`hello{protocolVersion, hostVersion}`、`activity{AgentActivity}`、`activity-snapshot{items[]}`、`notification{…}`（先只定义类型，P04 实现）、`error{code, message}`
  - Desktop→Host 消息：`hello{protocolVersion, clientVersion, token}`、`ping`、`request-snapshot`
- 所有消息带 `id` 与 `ts`；`parseHostMessage` / `parseClientMessage` 对未知类型返回错误而不是抛出。

### 2. `packages/host/src/projection.ts`（纯逻辑，可单测）
- `projectEvent(prevState, event) → AgentActivity | null`：
  - `turn/start`、`step/start`、`assistant/message` → `thinking`
  - `tool/call`：读类工具（名字匹配 read/search/grep/glob/list/fetch 等）→ `reading`，其他 → `executing`，带 `toolName`
  - 审批请求事件（**先查证是否存在这样的事件**，如 approval/permission 相关；找不到就留 TODO 和适配器钩子）→ `waiting-approval`
  - `turn/end`：`completed` → `done`；`error`/`max-tokens` → `failed`；`interrupted`/`aborted` → `idle`；`blocked` → `waiting-approval`
- **只根据结构化事件判断**，绝不解析模型自然语言判断成败（规划书 F02）。
- `done`/`failed` 在 N 秒（配置，默认 8s）后由 Host 回落为 `idle`（用注入的 Clock 和定时器实现，可测试）。

### 3. `packages/host/src/bridge/session-events.ts`
- 一个窄接口 `SessionEventSource { subscribe(cb): Disposable }`，用查证过的 DSH API 实现；`index.ts` 里装配。这样 DSH API 变化只影响这一个文件。

### 4. `packages/host/src/desktop-api/server.ts`
- 用 `ws` 在 `127.0.0.1` 随机端口监听（**绝不监听 0.0.0.0**）。
- 启动时生成 32 字节随机 token，写入 `~/.dsh/whaledot/connection.json`：`{ port, token, pid, protocolVersion, startedAt }`；用原子写（先写临时文件再 rename）。Windows 上尽量收紧文件 ACL（可用 `icacls` 去除继承只留当前用户；失败只记警告）。
- 客户端第一条消息必须是带正确 token 的 `hello`，否则 1 秒内断开；比较 token 用 `crypto.timingSafeEqual`。
- 连接后先发 `activity-snapshot`，之后增量推送；心跳 30s；最多 4 个客户端。
- 插件卸载（`ctx.effect` 的清理函数）时关闭服务器并删除 connection.json。

### 5. `packages/host/src/index.ts`
- `name = 'whaledot'`，`inject` 只放查证过的必要服务；可选服务用 Cordis 的可选注入方式（查证写法）。
- `Config`（schemastery）：`activityDoneLingerMs`、`desktopApi.enabled`。
- **整个 apply 的同步与异步部分都要兜底**：任何异常记录日志后降级，不得让 DSH 启动失败（验收用例 14）。

### 6. 联调工具
- `packages/host/scripts/ws-probe.ts`：读取 connection.json，连接并打印收到的消息，供手工验证。

### 7. 测试
- `projection.ts` 全分支单测（构造事件夹具；夹具结构以查证到的真实事件为准，在测试文件里注明来源）。
- `server.ts`：错误 token 被断开、正确 token 收到 snapshot、只绑定 127.0.0.1。

## 手工验收（写进回报）
1. 按 `scripts/dev-dsh.md` 把插件链接进 `whaledot-dev` profile，启动 DSH Web UI。
2. 运行 `ws-probe`，在 Web UI 发一条会触发工具调用的消息，贴出 probe 收到的 `thinking → reading/executing → done` 序列。
3. 故意让 `apply` 内某处抛错（临时改动），确认 DSH 仍能正常启动，然后撤销改动。

## 不做
- 不创建/驱动会话（P08 做），不做通知（P04）。

## 完成标准
测试通过；手工验收 1–3 结果写入回报；提交 `feat(host): DSH event bridge and local desktop API`。
