# P02 host：插件骨架、会话事件桥、DSH API 查证笔记（M0）

## 目标
1. 让 `dsh-whaledot` 能被 DSH 装载，订阅真实会话/Agent 事件，并把它们整理成 WhaleDot 自己能用的**结构化运行信号**（后续 Autopilot 用它追踪自己发起的执行）。
2. 产出一份 **`docs/dsh-api-notes.md` 查证笔记**——后面 P03–P10 的提示词都会以它为依据。这份笔记和代码同等重要。

WhaleDot 不做桌宠动画（由 dsh-coopanion 负责），所以这里**不需要**把事件投影成动画状态，也**不需要**任何对外 WebSocket。

## 第零部分：P00 遗留修正（先做）

1. **Cordis 版本**：目标宿主是 DSH Desktop 0.2.1-rc.2，内置 `@deepseek-ai/cordis@4.0.5`。`packages/host/package.json` 现在 peer 精确锁定 `4.0.4`，会导致与宿主版本不匹配。改为 `peerDependencies: "^4.0.4"`，`devDependencies` 对齐 `4.0.5`。
2. **DSH 参考副本**：新增 `scripts/extract-dsh-ref.cjs`，必须用 Desktop 自带的 Electron 以 Node 模式运行（它能透明读取 asar）：
   ```powershell
   $env:ELECTRON_RUN_AS_NODE = '1'
   & "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe" scripts/extract-dsh-ref.cjs
   ```
   脚本把 `resources/app.asar/dsh/node_modules/@deepseek-ai/*` 下每个包的 `package.json`、`README*.md`、`lib/types/**` 复制到 `.dsh-ref/<version>/@deepseek-ai/<pkg>/`（**只复制这些文件，不复制 lib 实现代码**），并写一个 `.dsh-ref/<version>/INDEX.md` 列出包名与版本。`.dsh-ref/` 加入 `.gitignore`、ESLint 与 Prettier 忽略列表。DSH 是 MIT 许可，但参考副本仍不入库。
3. **`docs/dev-dsh.md`**：把联调用的 CLI 改成 Desktop 自带的 `resources\runtime\cli\bin\dsh.cmd`（0.2.1-rc.2）；保留独立 `DSH_HOME=.dsh-dev` 的做法。说明隔离 home 里没有用户凭据：手工联调需要在**该终端**设置模型 API Key 的环境变量（变量名以 DSH 文档为准），不要复制用户的配置或凭据文件。dsh-coopanion 那一节改为“本机 Desktop 0.2.1-rc.2 在其兼容列表内”。
4. 提交：`chore: target DSH Desktop 0.2.1-rc.2 and add DSH reference extractor`。

## 第一部分：查证（先做，写进 `docs/dsh-api-notes.md`）

**查证依据一律是 `.dsh-ref/0.2.1-rc.2/` 中的 README 与 `.d.ts`**；社区插件源码作为用法参考，但它们可能基于旧版 DSH，结论冲突时以 0.2.1-rc.2 的类型定义为准，并在笔记中注明差异。本机已确认 0.2.1-rc.2 内有 `dsh-user-questions`、`dsh-user-approval`、`dsh-permission-presets`、`dsh-host-webserver`、`dsh-client-modules`、`dsh-api-gateway`、`dsh-tools` 等包。

对每一项写：**结论 + 出处（包名/文件路径/行号或 URL）+ 最小代码片段 + 不确定点**。查不到就写“未找到”，不要猜。

1. **会话事件**：插件如何订阅（`ctx.on('session/event', (session, event) => …)` 等）；事件对象结构：`type`、`time`、`seq` 等字段；`turn/start`、`step/start`、`assistant/message`、`tool/call`、`tool/result`、`turn/end` 的载荷结构，尤其 `turn/end` 的结束原因枚举。参考 dsh-pet `src/event-projection.ts`、dsh-coopanion `src/index.ts`、`@deepseek-ai/dsh-session` 的 README 与 `.d.ts`。
2. **Agent 事件**：`session/created`、`session/disposed`、`agent/created`、`agent/status`、`agent/disposed` 的签名。
3. **创建与驱动会话**：`ctx.typertGateway` 的类型（`@deepseek-ai/dsh-api-gateway`），`session` namespace 下 `create / rename / prompt / page / follow / projections` 的参数与返回；创建时如何指定工作目录（cwd / workspace）；参考 task-board `src/host-runner.ts`（含它对 gateway 版本差异的兼容处理）。
4. **权限钉住**：`ctx.commands.execute(sessionId, '/permission <preset>')` 的出处与返回；有无比命令更直接的 API。
5. **工具门禁**：`tools/pre-execute` 事件的精确签名——如何拿到 sessionId、工具名、参数；如何返回 deny 及理由；是否能区分“这个会话是 WhaleDot 发起的”。参考 `@deepseek-ai/dsh-tools`（或实际所在包）README/`.d.ts`。
6. **向用户提问 / 审批**：`userQuestions` 服务（dsh-coopanion 注入了它）的 API——**插件能否在某个会话里主动发起一个带选项的问题并拿到回答**？审批请求是哪个事件/服务？这决定 WhaleDot 的决策通知能否出现在鲸鱼的小信封里。
7. **Web UI 半区**：一个插件包如何同时提供 client 半区（面板/页面）与 host 路由（`ctx.webServer.register` 等）；参考 task-board 的 `src/client/*`、`host-routes.ts`、`package.json` 的 `dsh.client` 字段（若有）与 dsh-pet。
8. **插件配置与持久化目录**：`Config`（schemastery）写法；DSH 主目录解析（dsh-pet/task-board 都有 `dsh-home.ts`）；`settings` 服务读写。
9. **兼容性**：已知本机 DSH Desktop 为 0.2.1-rc.2（在 dsh-coopanion 兼容列表内）。记录 WhaleDot 依赖的每个服务/事件在 0.2.1-rc.2 中的所在包与版本，作为后续 `package.json` 兼容声明的依据。

## 第二部分：实现

### 1. `packages/host/src/bridge/session-events.ts`
- 定义窄接口并用查证过的 API 实现：
  ```ts
  interface RunSignal { sessionId: string; kind: 'turn-start'|'tool-call'|'tool-result'|'turn-end'|'session-disposed'; at: number; toolName?: string; endReason?: 'completed'|'error'|'max-tokens'|'interrupted'|'blocked'|'aborted'|'unknown'; raw?: unknown }
  interface SessionEventSource { subscribe(cb: (s: RunSignal) => void): () => void }
  ```
- 未识别的结束原因映射为 `'unknown'`（**不得当作成功**）。
- DSH API 变化只影响这一个文件。

### 2. `packages/host/src/bridge/run-tracker.ts`（纯逻辑，可单测）
- `RunTracker`：登记“WhaleDot 关心的 sessionId 集合”（`watch(sessionId, runId)` / `unwatch`），只对这些会话聚合信号；对每个 run 产出 `{ runId, sessionId, status: 'running'|'ended', endReason, toolCalls: number, startedAt, endedAt }`，并在 `turn-end` 时回调 `onRunEnded`。
- 其他会话的事件一律忽略（不记录内容，保护隐私）。
- 时间通过注入的 `Clock` 获取（来自 `@whaledot/core`；若 P01 尚未合入，就先在 host 内定义同名接口，回报中注明）。

### 3. `packages/host/src/index.ts`
- `name = 'whaledot'`，`inject` 只放查证过的必要服务；可选服务用 Cordis 的 `ctx.inject([...], child => …)` 方式（dsh-coopanion 就是这么做的）。
- `Config`（schemastery）：`dataDir`（默认 `<DSH主目录>/whaledot`）、`debugLogSignals`（默认 false）。
- 启动时确保 `dataDir` 存在；写一个 `status.json`（插件版本、启动时间、是否检测到 gateway/commands/userQuestions 服务可用）——供 P03 面板显示。
- **整个 apply 的同步与异步部分都要兜底**：任何异常记录日志后降级，不得让 DSH 启动失败（规划书验收用例 14）。

### 4. 测试
- `run-tracker.ts` 全分支单测：被关注会话的完整一轮、未关注会话被忽略、未知结束原因、会话中途销毁。
- `session-events.ts` 的映射函数单测：事件夹具结构以查证到的真实事件为准，在测试文件注释里注明来源。

## 手工验收（写进回报）
1. 按 `docs/dev-dsh.md` 把插件链接进测试 profile，打开 `debugLogSignals`，启动 DSH Web UI，发一条会调用工具的消息：贴出日志中的 `turn-start → tool-call → tool-result → turn-end(completed)`。（此时 RunTracker 还没有关注的会话，日志只是验证信号映射。）
2. 若本机 DSH Desktop 版本满足要求：在同一 profile 装上 `@takboo/dsh-coopanion`，确认两插件同时启用、DSH 正常启动、鲸鱼正常动作。不满足则在回报中说明版本。
3. 临时让 `apply` 内某处抛错，确认 DSH 仍能正常启动，然后撤销改动。

## 不做
- 不创建/驱动会话（P08），不做面板（P03），不做通知（P04）。

## 完成标准
`docs/dsh-api-notes.md` 九项全部有结论或“未找到”；测试通过；手工验收结果写入回报；提交 `feat(host): session event bridge and DSH API notes`。
