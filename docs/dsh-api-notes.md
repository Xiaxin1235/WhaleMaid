# DSH 0.2.1-rc.2 API 查证笔记（P02）

## 证据范围

目标为本机 Desktop **0.2.1-rc.2**，自带 Cordis **4.0.5**。以下路径均相对
`.dsh-ref/0.2.1-rc.2/@deepseek-ai/`，行号从 1 开始。
Desktop asar 的 package.json 声明了类型入口，但实际未包含 `.d.ts`，`lib/types/` 内是运行时 JS。
经用户明确同意，类型查证补充使用 npm **同包同版本**的声明，放入同一参考树；来源、tarball、完整性元数据见
`.dsh-ref/0.2.1-rc.2/NPM-TYPES.md`。README 与包版本取自 Desktop 原包；运行时代码未复制到参考树。
参考副本不入库，`scripts/extract-dsh-ref.cjs` 只负责 Desktop 提取，重建 npm 声明需另行获取相同版本发布包。
类型符合不等于宿主运行已验收；真实联调边界见 [P02 回报](p02-report.md)。

## 1. 会话事件

结论：`ctx.on('session/event', (session, event) => …)` 是提交后的同步观察流，返回 disposer；
事件封装为 `{ type, seq, time, data }`，`seq` 是连续的 `SessionSeq`，`time` 为毫秒时间戳。
消息表面事件另有必填 `surfaceOp`；seed 构造不重发事件。
出处：`dsh-session/lib/types/index.d.ts:28-61,157`；`types.d.ts:256-389,490-510`，
`README.md:44-68`；Cordis `lib/types/events.d.ts:90-101`。

| type                | data 载荷                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `turn/start`        | `{ turn: number }`                                                                                                                        |
| `step/start`        | `{ turn: number, step: number }`                                                                                                          |
| `assistant/message` | `{ turn, step, message: AssistantMessage, stream: AssistantStreamRecord[], usage?: TokenUsage, interrupted?: true }`                      |
| `tool/call`         | `{ turn, step, callId: ToolCallId, name: string, arguments: string }`，arguments 为原始 JSON 字符串                                       |
| `tool/result`       | `{ turn, step, message: ToolResultMessage, error?: {name,code,reason?}, meta?: JsonValue }`；message 使用 toolCallId 配对，没有工具名字段 |
| `turn/end`          | `{ turn, reason: TurnEndReason }`，不是 reason 字符串                                                                                     |

`TurnEndReasonMap`（`types.d.ts:166-211`）：`completed`、`blocked`、`max-tokens`、`interrupted`、`forked` 只有 kind；
`aborted` 另有 `reason: TurnEndCancelCause`；`error` 另有 `error: LlmFailure`。该枚举可合并扩展。
WhaleDot 窄枚举没有 forked，因此 forked 与未来原因均映射为 unknown，只有 completed 是成功证据。

```ts
const stop = ctx.on('session/event', (session, event) => {
  if (event.type === 'turn/end') observe(session.id, event.time, event.data.reason.kind)
})
// 卸载时 stop()；ctx.on 本身也归调用 fiber 管理。
```

不确定点：未获得 dsh-pet 本地源码，不作其版本假设。已读取 coopanion 0.4.13 的
`src/index.ts:223-231`，用法与上述事件签名一致。P02 未验证真实模型产生的完整工具轮次。

## 2. Agent 与 Session 生命周期

出处：`dsh-session/lib/types/index.d.ts:28-61`、
`dsh-agent/lib/types/runtime-types.d.ts:84-90,220-255`。以下均有 scope 路由，this 是 `Scoped<Session>` 或 `Scoped<Agent>`。

| 事件               | 回调参数与返回                                                                                        | 分发                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `session/created`  | `(session: Session): void`                                                                            | emit；同步异常可使发布回滚             |
| `session/disposed` | `(session: Session): void`                                                                            | emit；已公告会话配对销毁               |
| `agent/created`    | `({agent: Agent, source: SessionStartSource, signal?: AbortSignal}): undefined \| Promise<undefined>` | serial，必须等初始化监听器返回         |
| `agent/status`     | `({agent: Agent, status: 'idle' \| 'running'}): void`                                                 | emit                                   |
| `agent/disposed`   | `({agent: Agent}): void`                                                                              | emit；driver 停稳后、session detach 前 |

```ts
ctx.on('agent/status', ({ agent, status }) => observe(agent.session.id, status))
```

不确定点：idle 只表示当前无驱动活动，不能用作任务成功判据。P02 只订阅 session/event 和 session/disposed。

## 3. 创建与驱动会话

结论：`ctx.typertGateway` 是 `TypertGateway`，由 `TypertGatewayService` 实现。
`invoke({namespace,method,args,peer,signal?}): Promise<unknown>`；
`stream(...)` 返回 `Promise<AsyncIterable<unknown>>`。peer 是必填 `PeerScope`，当前版没有默认 peer。
出处：`dsh-api-gateway/lib/types/types.d.ts:9-27,110-137`、`index.d.ts:11-26,93-100`；`README.md:28-42`。
Session 业务属于 `ctx.sessionController`，不是 gateway 自己的方法。下列全部使用命名参数 `args: { request }`。
出处：`dsh-api-session-controller/lib/types/index.d.ts:101,156-171,190-211`、`types.d.ts:284-344,414-425,467-549`。

| namespace/method    | request                                                                                                                              | 返回                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| session/create      | `{workspaceId?: WorkspaceId, cwd?: string, sessionId?: SessionId, agentPreset?: string}`，workspaceId 与 cwd 互斥                    | `{sessionId, agentPreset?}`，实际 id 可能不同于请求                                                   |
| session/rename      | `{sessionId, title}`                                                                                                                 | `{title, seq}`                                                                                        |
| session/prompt      | `{requestId: SessionRequestId, sessionId, mode: 'queue' \| 'steer', content: readonly PromptContentPart[], clientTimeZone?: string}` | `{accepted: true}`                                                                                    |
| session/page        | `{address, throughSeq, beforeSeq?, maxMessages?, turnWindow?: {minMessages,minTurns}}`                                               | `{records: SessionHistoryRecord[], hasMore}`                                                          |
| session/follow      | `{address, maxMessages?, turnWindow?, assistantStream?: true}`                                                                       | AsyncIterable：snapshot（header/cursor/records/hasMore/projections 等）、event、可选 assistant-stream |
| session/projections | `{sessionId}`                                                                                                                        | `{kind:'sequenced', asOfSeq, values}` 或 `{kind:'migration-required', values}` 或 null                |

普通 address 为 `{kind:'session',sessionId}`；`PromptContentPart` 文字项为 `{type:'text',text}`。

```ts
// peer 来自合法 Host composition 的 PeerScope；此处不伪造身份。
const value = await ctx.typertGateway.invoke({
  namespace: 'session',
  method: 'create',
  args: { request: { cwd } },
  peer,
})
// 后续始终使用 value 实际返回的 sessionId。
```

社区差异：本机 task-board 0.4.3 `src/host-runner.ts:226-265` 对 session/list 使用 `_request`，
其他方法使用 `request`；兼容旧/新 `gateway/*` 错误码并对 service-unavailable 做短暂重试。
但它的 gateway 窄接口没有 peer，不能原样用于本版。更明显的另一个差异见 commands。
不确定点：合法 peer 的取得/生命周期应在 P08 重新核验 `dsh-typert-protocol` 与 composition；P02 不创建、驱动会话，也未验证这些调用。

## 4. 权限钉住

结论：提示词里的 `ctx.commands.execute(sessionId, line)` 是旧版/适配器形式。
当前原生签名为 `execute(agent: Agent, line: string, submittedAttachments: readonly CommandSubmitAttachment[], signal: AbortSignal): Promise<CommandExecution | undefined>`；
返回 `{commandId, result}`，result 为 `{kind:'success',text?,sourceEventSeq?}` 或 `{kind:'error',text}`，未知命令返回 undefined。
出处：`dsh-commands/lib/types/index.d.ts` execute 声明、`types.d.ts:33-53`；`README.md:60-70`。
更直接 API 为 `ctx.permissionPresets.set(session: Session, name: string): void`，以及 `current(session): string`。
出处：`dsh-permission-presets/lib/types/index.d.ts:12,162-188`；`README.md:81-99`。

```ts
ctx.permissionPresets.set(session, 'workspace-write')
// 或 const execution = await ctx.commands.execute(agent, '/permission workspace-write', [], signal)
// if (execution?.result.kind !== 'success') 报告失败
```

差异：task-board 的 `SessionCommandDispatcher` 返回扁平 CommandResult（`host-runner.ts:81-87,369-373`），它是自定义适配器，不是当前 ctx.commands 原生契约。
不确定点：preset 名称由部署配置决定；设置一次不构成后续不可修改的权限锁。P02 未执行权限切换。

## 5. 工具门禁

结论与出处：`dsh-tools/lib/types/index.d.ts:47,216-240,282-289,445-463,515-522,647-656`。
精确签名为 `'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>`。
`exec.agent?.session.id` 为 sessionId，`exec.name` 为工具名，`exec.arguments` 为已解析、冻结的 unknown 参数；
还有 callId、rootCallId、signal、token，以及可选 parent。PreToolDecision 为 allow、deny（必填 reason）、cancel、ask。

```ts
ctx.on('tools/pre-execute', async (exec, next) => {
  const id = exec.agent?.session.id
  if (id && watched.has(id) && !allowed(exec.name, exec.arguments)) {
    return { kind: 'deny', reason: 'Outside the authorized scope' }
  }
  return next()
})
// 单调策略也可用 ctx.tools.guard(exec => reasonOrUndefined)。
```

没有查到内置 WhaleDot 来源标签；必须由未来 P08 在创建成功后登记其实际 sessionId，再按本地登记判别，不能因任意会话存在而默认归属 WhaleDot。
不确定点：agent 可缺省，届时没有可靠的 sessionId；P02 不安装门禁，不更改其他会话工具行为。

## 6. 向用户提问与审批

结论：能通过 `ctx.userQuestions.ask({agent,questions,signal?})` 发起带选项问题并等待结构化回答。
agent 必须是 registry 中的确切活跃 runtime root；子 Agent 被拒绝。没有 agent 的请求仅适用于本地无 scope answerer，Web 不会自动呈现。
出处：`dsh-user-questions/lib/types/index.d.ts:98-127`、`types.d.ts:7-75,133-164`；`README.md:28-38,60-64`。

```ts
const answer = await ctx.userQuestions.ask({
  agent,
  signal,
  questions: [
    {
      id: 'decision',
      question: 'Continue this run?',
      options: [{ label: 'Continue' }, { label: 'Stop' }],
    },
  ],
})
// answer.answers: {id, selected: string[], custom?: string}[]
```

`askTimed(request & {agent}, callId, timeoutMs)` 返回回答或 `{pending:true,callId}`；
`user-questions/request(request,next)` 是 waterfall。`wait?: {callId,timed?}` 负责 UI 关联。
持久化 projection 从真实 tool/call、tool/result 和回复推导；任意主动 ask 不会自动制造已记录的工具调用。
coopanion 0.4.13 `src/index.ts:232-247` 监听该 waterfall，对有 root session 的请求创建信封通知，
无工具 origin 时使用 runtime 通知，再 `await next()`；它不自己提供答案。
因此**有代码依据支持主动 ask 产生运行时信封**，但实际展示与回答闭环仍待 P04 联调，不能宣称已验收。

审批是另一服务 `ctx.approval.request(req): Promise<ApprovalOutcome>`，事件为
`approval/request(req,next): Promise<ApprovalOutcome>`。req 包含 agent、toolName、callId?、reason?、signal；
调用要求打开的 turn；never 策略直接拒绝请求，缺失 answerer 返回 unavailable。
出处：`dsh-user-approval/lib/types/index.d.ts:21,68-93,135`、`types.d.ts:81`；`README.md:34-58`。

```ts
const outcome = await ctx.approval.request({ agent, toolName, signal, reason: 'Scope change' })
```

不确定点：独立调度决策未必处于 open turn，不能把 approval 服务当通用通知。P02 未发问、未请求审批。

## 7. Web UI client 半区与 host 路由

结论：同一个包导出 host 主入口、`./client` 浏览器 bundle，并在 package.json 声明 `dsh.client`。
client 系统扫描已启用 Loader 条目、按依赖加载；普通自定义 HTTP 路由由 host 注册并自行负责访问控制。
出处：`dsh-client-modules/README.md:30-54`、`package.json:20-40`；
`dsh-host-webserver/lib/types/index.d.ts:32-41,174`、`README.md:59-65`。

```json
{
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js" },
  "dsh": { "client": { "platform": "web", "inject": [], "external": [] } }
}
```

```ts
ctx.inject(['webServer'], (child) => {
  child.effect(() =>
    child.webServer.register({
      kind: 'exact',
      path: '/whaledot/status',
      handler: (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end('{}')
      },
    }),
  )
})
```

社区参考：task-board 0.4.3 `package.json` 的 exports/client 与 dsh.client.inject；`src/host-routes.ts:1-22` 使用
WebRoute，含自己的 loopback/认证处理。coopanion 0.4.13 也提供 `./client`、platform web 与 client inject。
不确定点：没有统一“任意面板注册”服务已在本轮查证，具体布局服务留 P03 查证；P02 不增加 client bundle 或路由。

## 8. 配置与持久化目录

P06 日志查证：Desktop asar 的 Cordis 4.0.5 `lib/index.js` 已只读提取到
`.dsh-ref/0.2.1-rc.2/@deepseek-ai/cordis/runtime-p06.js`。
`Logger._method` 只遍历 `service.exporters`，按 exporter 的 levels / logger level 过滤；
`LoggerService` 默认注册的是内存 buffer exporter（最多 1000 条），不是 stdout 或文件。
`lib/types/logger.d.ts:77-104` 声明 buffer、exporters 与 exporter 注册 API；README 的包表将
console exporter 列为独立插件。因此有 buffer 记录不等于终端可见；没有终端 exporter 时
`info('plugin loaded')` 也不会进入 console。未发现内建自动文件落盘，不推断 Desktop 的其他
composition 一定安装了哪个 exporter。WhaleDot 不修改宿主导出器：总是写自己的
`debug/host.log`，仅 `debugLogSignals=true` 时写 `debug/signals.jsonl`；信号显式投影窄字段，
不写 raw/消息/参数/结果。每个文件写入前按 1 MiB 上限轮换到 `.1`，最多两份。

结论：schemastery 从 `@deepseek-ai/schemastery` 默认导入，导出同名 `Config` schema 和 TS interface；
以 `resolveDshHome()` 统一解析主目录，显式路径 > 非空 DSH_HOME > ~/.dsh，返回绝对路径。
出处：`dsh-home-paths/README.md:32-44`、`lib/types/index.d.ts`；
`dsh-api-session-controller/lib/types/index.d.ts:3,26-35,49` 为实际 Config 类型例子。

```ts
import Schema from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
const dataDir = join(resolveDshHome(), 'whaledot')
const Config = Schema.object({ dataDir: Schema.string(), debugLogSignals: Schema.boolean().default(false) })
```

WhaleDot 将 dataDir 的动态默认值在 apply 内计算，避免模块导入时固定 DSH_HOME。启动 mkdir 后写 status.json。
F01 改用 `@deepseek-ai/dsh-atomic-write@0.2.1-rc.2` 的公开 `writeFileAtomic(path, content, { mode: 0o600 })`；出处：同版本 `.dsh-ref` 中该包 `README.md` 的 “Writing a file atomically” / “Write path”，同目录独占临时文件写完后 rename，原有写入队列保持顺序；该 API 不提供 fsync 崩溃持久性。
settings 当前是 schema 派生表单，**不是任意 JSON KV 服务**；只暴露 `.volatile()` 字段。
`describe(options?): SettingsDescriptor[]` 读值与 revision，`update(ns,patch,expectedRevision?)`、
`replace(ns,section,expectedRevision?)`、`mutate(ns,ops,expectedRevision?)` 异步持久化配置。
出处：`dsh-settings/README.md:28-40`、`lib/types/index.d.ts:89-114`。

```ts
ctx.inject(['settings'], (child) => {
  const forms = child.settings.describe()
  // 需要 Config 中先将可在线编辑字段标为 volatile，再按 revision 更新。
  observe(forms)
})
```

不确定点：P02 的两个字段采用普通配置文件，不宣称已支持 settings 在线编辑；无需 settings 服务即可加载。

## 9. 兼容性与服务清单

以下版本均已在 Desktop 提取的 package.json/INDEX.md 中核对。

| 能力                         | 服务/事件                                 | 所在包                                  | 版本       | P02 使用                             |
| ---------------------------- | ----------------------------------------- | --------------------------------------- | ---------- | ------------------------------------ |
| 插件生命周期、可选注入、日志 | Context、ctx.inject、ctx.effect、logger   | @deepseek-ai/cordis                     | 4.0.5      | 必需运行时 peer ^4.0.4，dev 4.0.5    |
| 会话事件                     | session/event、session/disposed、sessions | @deepseek-ai/dsh-session                | 0.2.1-rc.2 | 仅类型依赖和被动监听，不依赖实现导入 |
| Agent 生命周期               | agents、agent/*                           | @deepseek-ai/dsh-agent                  | 0.2.1-rc.2 | 查证                                 |
| RPC                          | typertGateway                             | @deepseek-ai/dsh-api-gateway            | 0.2.1-rc.2 | 可选可用性探测                       |
| Session 业务                 | sessionController                         | @deepseek-ai/dsh-api-session-controller | 0.2.1-rc.2 | 查证                                 |
| 人工命令                     | commands                                  | @deepseek-ai/dsh-commands               | 0.2.1-rc.2 | 可选可用性探测                       |
| 工具门禁                     | tools、tools/pre-execute                  | @deepseek-ai/dsh-tools                  | 0.2.1-rc.2 | 查证                                 |
| 提问                         | userQuestions、user-questions/request     | @deepseek-ai/dsh-user-questions         | 0.2.1-rc.2 | 可选可用性探测                       |
| 审批                         | approval、approval/request                | @deepseek-ai/dsh-user-approval          | 0.2.1-rc.2 | 查证                                 |
| 权限                         | permissionPresets                         | @deepseek-ai/dsh-permission-presets     | 0.2.1-rc.2 | 查证                                 |
| Web 路由                     | webServer                                 | @deepseek-ai/dsh-host-webserver         | 0.2.1-rc.2 | 查证                                 |
| client 模块                  | clientModules / modules                   | @deepseek-ai/dsh-client-modules         | 0.2.1-rc.2 | 查证                                 |
| 配置表单                     | settings                                  | @deepseek-ai/dsh-settings               | 0.2.1-rc.2 | 查证                                 |
| 数据根目录                   | resolveDshHome                            | @deepseek-ai/dsh-home-paths             | 0.2.1-rc.2 | 直接库依赖                           |
| 配置 schema                  | Schema                                    | @deepseek-ai/schemastery                | 3.18.4     | 直接库依赖                           |

```ts
ctx.inject(['userQuestions'], (child) => {
  // 仅在可选服务存在时运行，child 随依赖撤销而卸载。
  child.effect(() => () => releaseAvailability())
})
```

不确定点：以上证据只覆盖目标版本；Cordis peer 的 ^4.0.4 表示依赖兼容范围，不表示所有 DSH 版本已验收。
WhaleDot 必需 inject 为空：事件订阅由 Cordis 直接提供，三项服务仅探测，不阻断启动。

## 10. 面板注册（P03）

侧栏由 shell 声明 `sidebar.panellist`（root/list），中栏由 layout 声明 `main`（root/keyed）。
分别注册相同的 id/key `whaledot`；侧栏仅贡献图标，shell 负责文字、选中状态、折叠形态和导航。
通过 `ctx.slots.inject(seat, callback)` 等待声明，callback 返回注册 disposer；卸载由 fiber 收回。
不替换 sidebar 根槽，不接管 conversation DOM。可直接调用 `ctx.layout.selectPanel('whaledot')`；
shell 自己的面板行已经执行该操作，无须再绑定一个点击事件。

```ts
ctx.slots.inject('main', () =>
  ctx.slots.register(
    {
      name: 'main',
      key: 'whaledot',
      inject: () => face,
    },
    Panel,
  ),
)
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register(
    {
      name: 'sidebar.panellist',
      id: 'whaledot',
      order: 30,
      label: 'WhaleDot',
    },
    PanelIcon,
  ),
)
```

| 证据                              | 位置（参考树内）                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 中栏选择与缺失 key 行为           | `dsh-client-ui-layout/README.md:32,57`；`lib/types/client/index.d.ts:48-56`                                        |
| 侧栏列表与同 id 配对              | `dsh-client-ui-sidebar/README.md:36-38`；`lib/types/client/contract/slots.d.ts:47-57`                              |
| 注册和注入生命周期                | `dsh-client-ui-slots/lib/types/index.d.ts:793-806`、`inject` 声明；README 的 Slot ownership                        |
| bundle 声明、共享 React、构建要求 | `dsh-client-modules/README.md:32-54`                                                                               |
| 社区交叉检查                      | 本机 task-board 0.4.3 `src/client/native-panel.tsx`、`plugin-card-seat.ts`；coopanion 0.4.13 `src/client/index.ts` |

`package.json` 增加 `./client` 和 `dsh.client`。浏览器文件必须是 ModuleLoader 的懒工厂，不能直接投放 tsc 的多文件 ESM；
本项目用 esbuild 捆绑内部代码、Zod 和 core，只 external 宿主基线中的 React，不引入 UI 库。
颜色取宿主 `--dsw-alias-*`，窗口留白取 `--dsh-frame-top-clearance`。
本节新增声明来自同版本 npm（Desktop README 不变），来源留在 `.dsh-ref/0.2.1-rc.2/P03-NPM-TYPES.md`。

## 11. client ↔ host 认证通道（P03）

**推荐且实际采用：Connection 的 exact Fetch route，`ctx.connection.fetch.register()`，路径 `/api/whaledot/{status,goals,language}`。**
客户端调用 `connection.rpc.call('/api', 'whaledot/status', {}, signal)`；没有自行创建 token，也没有依赖 loopback 判断身份。
`webServer.register` 不用于 WhaleDot 业务路由。

| 问题                    | 查证结论                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 认证                    | DSH 根页面启动 token 仅兑换宿主签名、绑定 authority 的 Cookie；之后 `/api` 先做 Host/Origin 信任检查，再做浏览器或 API Peer 认证                                                                              |
| 未认证如何拒绝          | 可信 Host 但无有效 Cookie → HTTP 401 `unauthorized`，发生在业务分发之前；Host/Origin 不可信 → 403                                                                                                             |
| owner 边界              | shared Fetch handler 对 exact route 的非 owner Peer 先返回 403；WhaleDot handler 再检查 owner 和 peer 存活状态                                                                                                |
| 身份获得                | exact route callback 只有 Request；调用宿主 `connection.admit(request)` 取得该 Cookie 对应的真实 `PeerScope`，读取 `peer.principal.kind` 和 `peer.signal`。不能从 JSON payload 推导 peer                      |
| 注册/卸载               | 可选注入 `connection`，每个 route 的 disposer 归 child fiber 所有；没有该服务时不提供接口                                                                                                                     |
| Gateway 与 Typert       | Gateway 独占 `/api` RPC interceptor；普通服务可用 TypertRemoteService + @Remote + 生成的 descriptor，通过 `ctx.invocation.peer` 取调用方。exact routes 与它共存，不争用 interceptor                           |
| 另一公开 API 的实测限制 | `connection.rpc.handle('/whaledot', handler)` 声明支持独立认证通道，但 Desktop 插件环境实测在 Connection 内部报 `cannot get property "webServer" without inject`，即使调用插件注入 webServer 仍失败；未采用它 |

出处：`dsh-client-connection/README.md:34,41-53`；`lib/types/rpc.d.ts:105-150,180-191,235-242`；
`rpc-host.d.ts:35-39`；`dsh-api-gateway/README.md` 的 Host service；`dsh-typert-protocol/README.md` 的
Exposing a Host method / Identifying the caller。peer 没有精细到“一个浏览器用户”：浏览器共享 owner Peer，
API Cookie 则可对应独立 Peer。不能把它表述为逐用户账户隔离。

运行时代码补查：Desktop asar 内同名同版本 Connection 的 `createSharedFetchHandler`、`register`、`admit` 与
上述身份/拒绝路径一致；诊断记录在忽略的 `.dsh-dev/p03-host-diag.log`，诊断插桩仅临时作用于编译文件，最终 build 已清除。
社区实际参照为 coopanion 0.4.13 `src/index.ts:185-196` 的 exact routes，而非复制它的业务操作。
只读 `ctx.get('coopanion') !== undefined` 可探测其 `src/index.ts:88` 发布的服务，不调用桌宠方法。

只读查看用户 `~/.dsh/profiles/web/cordis.patch.yml:12-21`，确有 managed remote-web-ui 的 `host: '0.0.0.0'`、port 3080。
这说明配置有网络暴露意图，并不单凭文件断定当前监听状态；本轮未改动用户 profile。
隔离验收绑定 127.0.0.1:3183/3184，认证仍须通过，不能将此绑定本身当作认证。

请求载荷与三个成功响应都经过 Zod；非法 envelope HTTP 400 `{error:{code,message}}`，
业务失败为 Connection 标准 server-response 内的 `{ok:false,error:{code,message,details:{}}}`。
`details` 是宿主协议必需的兼容字段；code 保持稳定英文标识符。宿主 admission 层自己的 401/403 不改写。

## 12. 界面语言与在线配置（P03）

DSH 的 `@deepseek-ai/dsh-client-locale` 用 Host settings 的 `locale.preference` 持久化已选语言。
内置 id 为 `zh`/`en`，浏览器可先用 navigator 推导 provisional locale，再由 Host 配置覆盖。
client 读取 `ctx.locale.getSnapshot().active`，通过 `ctx.locale.subscribe(listener)` 监听，包括字典 revision；
仅语言切换还可监听 `locale/change`。不要仅在注册时读一次，也不要只猜 navigator.language。
依据：`dsh-client-locale/README.md` Choosing a language / Preference resolution；
`lib/types/client/index.d.ts:123-144`，`locale-settings.d.ts:7-24`；task-board `client/locales.ts`、
coopanion `src/client/locale-sync.ts` 和其 client 入口的订阅用法交叉核对。task-board 的 locales.ts 使用 document 语言而非 locale 服务，只参考其字典组织，不复制该读取策略。

WhaleDot Config 的 language 为 `auto | zh-CN | en`，默认 auto，字段标记 `.volatile()`。
**volatile 字段是稳定引用 `Volatile<T>`，必须 `.get()` 读当前值，不是普通字符串。**
core `resolveLocale` 将宿主 `zh`/`zh-CN` 解析为 zh-CN、en 为 en，其他语言回退 en；显式设置覆盖宿主。
纯数据目录和 `t` 同时供 host/client 使用，不引入 DSH 或浏览器依赖。

面板语言写接口严格只接受 `{language}`，通过 ConfigEditor 的 `entries()` 找到 `entry.fiber === ctx.fiber` 的
真实 Loader 条目，再从 `settings.describe()` 取得该 ns/revision 并 `settings.update(ns, patch, revision)`，
从而复用设置页同一份持久化配置，避免写死 profile id 或修改其他字段。
依据：`dsh-settings/lib/types/index.d.ts:96-102`，`dsh-config-editor/lib/types/index.d.ts:19-25`，
schemastery `volatile()` 声明；coopanion Config 的 Volatile 使用也经核对。
面板订阅宿主 locale，自己保存语言成功后立即更新；设置页或其他客户端修改则由面板每 2 秒的只读状态刷新同步。

宿主 README 明确说目前没有 shipped client 自动渲染所有 autoGenerate 表单，因此只标 `.volatile()` 不保证用户能找到设置控件。
WhaleDot 因此另在 `settings.section` 注册原生设置页，其语言下拉同样调用认证 language 方法；两处均写同一 Config。

## 13. 存储服务与 WhaleDot 事务存储（P06）

查证范围为本机 Desktop 提取的 `dsh-storage/README.md`（The backend contract / Known Limitations）
与 `dsh-storage-domain/README.md`（Observable behavior / Open sequence / Known Limitations）。
本机参考树仅有 `dsh-storage`、`dsh-storage-domain`、`dsh-storage-json`，没有
`dsh-storage-sqlite` 包；不把假定存在的服务当作依据。

| 服务                 | 已查证语义                                                  | P06 适用性                                                     |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| storage              | 后端与数据形态注册枢纽；当前只有 KV facet；单次记录调用原子 | 不提供领域事务                                                 |
| storage-domain       | schema 校验、内存同步读、串行持久化单记录写、domain/changed | 明确没有跨表事务/索引/自动迁移；坏记录会使整个 domain 打开失败 |
| WhaleDot node:sqlite | WAL、外键、5000 ms busy timeout、自有迁移、跨表事务         | 保持架构选定方案；不注入 DSH storage 服务                      |

WhaleDot 数据保存在 `<dataDir>/whaledot.db`。生产 Clock/IdGen 为 Date.now 与前缀 +
crypto.randomUUID；core 不做 IO。迁移版本必须连续且只能追加，未知版本拒绝打开；全部待执行
迁移在同一事务中运行，失败回滚后关闭连接、释放写锁并报告 error。
已有数据库迁移前以 `VACUUM INTO` 产生包含已提交 WAL 页的一致快照，`backups/` 仅清理
WhaleDot 自己命名的备份，保留最新五份。

`whaledot.lock` 使用独占创建，包含 pid、startedAt 和随机 token；存活/不可确认/格式不明
锁都不抢占。死 PID 接管使用独占 `.reclaim` 目录串行化检查与替换；被占用或未知的回收标记
同样保守降级（若进程恰在回收中崩溃，需停掉相关宿主并人工核对/清理该标记）。关闭仅移除
自己 token 对应的锁。只读实例打开 SQLite readOnly 连接，不迁移、不备份、不写领域数据。

五个仓储读取逐行使用 core schema 校验，并核对 JSON 与关系索引字段；错误行跳过，
每个启动内按 table/id 去重计数并记 host.log，不打印损坏内容。任务只接受 PENDING/v0 新建；
状态变更仅能通过 TaskRepo.transition 的 core 迁移 + 版本 CAS + 审计插入事务。

授权内容保持不可变，替换为新 id + supersedes；旧版置 superseded，非 active 一律拒绝。
沿用 core 原有摘要契约：hash 包含 status/revokedAt，所以合法生命周期变更同步重算摘要，
不修改原授权字段。替换、目标 scopeId 绑定及旧版失效在同一事务内；activeScopeFor 每次读后
重新验 hash，篡改视为无授权。服务 grant/revoke 接受宿主已认证的 live owner peer，
grant 暂不注册面板路由。撤销持久化后通过 Cordis emit 发布插件自有
`whaledot/scope-revoked(scopeId)`（Cordis `lib/types/events.d.ts` 的 emit/on；不是臆造的 DSH 事件）。

面板扩展 exact Fetch routes `set-paused` / `revoke-scope`；沿用 Connection admission + owner
校验，strict 请求分别为 `{paused:boolean}` / `{scopeId}`。goals 从仓储读取；status 增加 store
及 paused。pause 缺省 false，设置坏行/存储不可用时保守返回 true；只读模式禁用写控件。
