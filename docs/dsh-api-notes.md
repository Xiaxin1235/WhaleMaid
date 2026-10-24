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

## 14. 目标草案无工具调用与确认（P07）

选择优先方案 (a)，不通过 Agent loop 或 gateway 会话生成草案。依据来自 Desktop 同版本
README，以及安装到开发依赖、复制到 `.dsh-ref/0.2.1-rc.2/@deepseek-ai/` 的 npm 同版声明：

| API                                        | 出处                                                                                                      | 本次用法                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ctx.llm.stream(GenerateOptions)`          | dsh-llm README：Minimal composition、RequestUserInput；lib/types/index.d.ts 的 Context.llm 与 stream 声明 | 一次请求，tools=[]，只收 text-delta；finish 必须 stop；无自动重试                   |
| `GenerateOptions` / StreamChunk            | dsh-llm/lib/types/types.d.ts:434-464,484-548                                                              | identity-free user input；signal、maxTokens；不提供任何工具，不解释模型输出中的动作 |
| `ctx.agentDefaultModel.currentSelection()` | dsh-agent-default-model README：Read and change the default；lib/types/index.d.ts:40-47                   | 每次读取当前新会话默认 provider/model；不改模型设置，不借用另一个会话的模型状态     |
| `ctx.get` 可选服务读取                     | Cordis 已有服务探测边界（第 8/11 节）                                                                     | 任一服务缺失或 provider/model 为空，返回 model-not-configured，面板可转手动表单     |

没有绑定到某个聊天会话的面板使用当前部署的新会话模型选择；现有聊天的单独覆盖不作为
WhaleDot 的模型来源。沿用 dsh-llm 文档支持的 RequestUserInput 一次性请求形态；草案状态、
内容只在 Host 内存保留十分钟，不新增会话或持久化模型聊天，也不读取任何项目正文发送给模型。
输入只有用户描述和确定性项目事实。真实模型链路已在隔离宿主验证；模型不拥有授权写入口。

未找到第 10 节已查证的、可直接用于插件面板的目录选择器 API；采用文本路径输入，不猜测组件。
Host 对目录 realpath/stat、Git 状态与候选脚本进行确定性只读探测（execFile + 参数数组），不运行
候选命令。确认前再次探测，目录和授权路径必须是规范化的真实项目内路径；拒绝跨项目符号链接。
为了让用户看到确认时的真实边界，项目根本身为符号链接/联接时拒绝并要求使用其真实目录。

新增 owner 认证方法：draft-goal、draft-status、cancel-draft、project-facts（手动表单探测）、
confirm-goal、goal-detail、set-goal-paused。请求均 strict 校验；draft-goal 立即返回 id，
只允许一个在途请求，模型调用两分钟超时，十分钟自动清理；无工具、无任务执行、无 worktree。
confirm-goal 只采信完整确认表单，在外层事务插入目标、调用 ScopeService.grant、插入 PENDING
任务；仓储的内部事务使用保存点，因此任一步失败会回滚全部记录。确认后 goal 为 active。

P07 同时修复 P06 锁恢复：超过六十秒的旧 reclaim 空目录在重新核对身份/时间后清理，再通过
独占创建竞争；read-only 面板的 takeover-store 严格 `{confirm:true}`，要求 owner 明确确认，
锁内容未变才接管并重开仓储，host.log 记录请求与完成。不会把存活 PID 自动判作陈旧。
scope.hash 的作用仅为发现意外损坏/不一致，不是抵抗本机数据库写权限攻击者的安全边界。

P07 的 `.env*` 是唯一新增的保护模式：仅允许路径末尾的 `.env*` 文件名前缀，不能用在
allowedPaths，也不支持任意 glob。默认连同 `.git` 在确认表单展示；Host 拒绝删除这两项基础保护。

## 15. P08：直接会话服务与后台身份

结论：本机可信插件可调用 `ctx.sessionController.create(request)`、`rename(request)`、`prompt(request, signal)`；这些方法没有 peer 参数。gateway 的 `invoke` 仍需连接 peer，不能据此推断直接服务也需要。P08 面板由 Connection admit 的 owner peer 验证本次请求；执行器只在 launch 栈上使用它，不写库、不留作后台身份。`via: {kind:'background'}` 通过相同的可信宿主服务调用，可供 P10 复用；这不意味着本阶段已实现调度。
出处：同版本 `.dsh-ref/0.2.1-rc.2/@deepseek-ai/dsh-api-session-controller/lib/types/index.d.ts` 的 create/rename/prompt/cancel 声明；`types.d.ts:284–374`。create 接收 cwd、可选 sessionId/agentPreset，返回实际 sessionId；prompt 接收 requestId、sessionId、mode、content，返回 accepted:true。注册运行之前回读 `permissionPresets.current(session)`，未匹配则不发送。
不确定点：没有找到供第三方插件任意铸造的“系统 principal”公共 API，故不构造 principal。提示词发送发生后即使回执丢失，也只能 UNKNOWN，不重发。直接服务的可用性及预设名称由当前 profile 决定，缺失时阻断。

## 16. P08：中止与结束原因

`sessionController.cancel({sessionId})` 返回 accepted:true，是取消已获接纳的回执，不是执行结果；create/rename/prompt 与 cancel 都是直接服务的公共方法。`dsh-session/lib/types/types.d.ts` 的 turn/end reason 包含 completed、error、max-tokens、blocked、interrupted、aborted、forked。P08 延续 session-events 适配，未识别原因（包括 forked）、销毁与超时一律 UNKNOWN。撤销/超时先写入停止原因使门禁关闭，再 cancel；无论随后回合是否报告 completed，停止原因优先。宿主卸载时请求 cancel，保留 running 供重启核对。
出处：上述 controller types 的 SessionCancelRequest/Value；session 的 TurnEndReason；`dsh-agent` 声明的取消传播及 `docs/dsh-api-notes.md` 第 7 节。具体 abort/interrupted 分支取决于宿主当时的回合状态，不能仅凭 cancel accepted 推定。

## 17. P08：已核实工具表与保守映射

同版本各 `dsh-tool-*/README.md` 的 The tools / Model Experience 为出处；这是一张组成能力表，工具是否实际可见由 preset、平台及服务决定，不把包的存在当作默认全部启用。`tool-intent.ts` 只接受明确形状，未知字段、后台启动、提权参数和不能表达为当前授权意图的操作拒绝；宿主原有策略仍继续执行。

| 工具                                                                | 关键参数 / 影响                                                  | P08 策略                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| read / read_image                                                   | file_path；read 的 offset/limit                                  | read-file，运行 cwd 解析相对路径                                             |
| write                                                               | file_path、content                                               | write-file                                                                   |
| edit                                                                | file_path、old_string、new_string、replace_all                   | read-file + write-file                                                       |
| str_replace_editor                                                  | command、path；file_text/old_str/new_str/insert_line/view_range  | view 读；create 写；其余读写                                                 |
| glob / grep                                                         | pattern、path?；grep include?                                    | read-file；宿主递归检查搜索树，遇保护文件、链接或扫描预算不足拒绝            |
| bash / pwsh                                                         | command、workdir?、timeoutMs?、run_in_background?、description?  | run-command；literal cat/Get-Content/type 额外产生 read-file，后台与提权拒绝 |
| web_fetch / web_search                                              | url / queries[]                                                  | network，现有范围默认未授予，仍需拒绝                                        |
| subagent                                                            | prompt 与提供者可选模型/preset 参数                              | spawn-subagent；默认不授予，当前无独立子运行隔离能力时始终拒绝               |
| ask_user_question                                                   | questions[{id,question,header,options?,multi_select?}]、timeout? | 经结构校验可通过；回答不扩大授权                                             |
| todo_write                                                          | todos[{content,status}]                                          | 只影响本会话清单，校验后通过                                                 |
| working_directory                                                   | 新的 cwd                                                         | 拒绝，避免改变后续相对路径解释                                               |
| bash/pwsh persistent、terminal_open/send/read/signal/close/list     | 持久 shell/终端 id、输入、cwd                                    | 拒绝，无法用当前无状态命令意图约束跨调用状态                                 |
| job_output/list/kill                                                | 作业 id、wait/timeout                                            | 拒绝；P08 不创建后台作业                                                     |
| create/get/update_goal                                              | objective、goal_id/revision/action                               | 拒绝，避免宿主续跑目标扩大本次单任务边界                                     |
| schedule_create/list/update/delete                                  | prompt、title、id、时间选择器                                    | 拒绝，避免持久后台执行                                                       |
| session_search/event_search/trace/event_trace/event_read            | query、session/event id                                          | 拒绝，未授权读取其他会话                                                     |
| send_message / interrupt_agent / list_agents / list_subagent_models | child id、消息                                                   | 拒绝；无已授权子运行                                                         |
| ralph / workflow / run_code                                         | 复合执行、程序化工具分派                                         | 拒绝；不能绕过已知工具映射                                                   |
| skill / present / load_workspace_dependencies / Cordis 管理类工具   | 动态资源、渲染或组件安装                                         | 当前未知/不可表达意图，失败即拒绝                                            |

补充：文件名保护作用于任意路径段，realpath 前后均校验。搜索工具检查根目录本身不足以保护后代内容，因此保守检查目录树（最多 10000 项）；rg 明确忽略的 .git/.hg/.svn 内部不扫描，其他隐藏/ignored 文件仍检查。shell 读取文件不能只检查 cwd。上述限制会拒绝部分宿主合法操作，是本阶段安全边界，不自动转交交互审批。

## 18. P08：执行树与子会话归属

`dsh-tools/lib/types/index.d.ts:216–288`：exec.agent 是当前调用的 agent，其 session.id 是直接所属会话；`parent` 是不透明 `ToolExecutionToken`，不能按对象读取 parent.agent。注册表维护 token→根 session 与 rootCallId→根 session，覆盖程序化嵌套工具分派。`dsh-session/lib/types/types.d.ts:59–89`：`session.header.parentSession` 提供持久 fork lineage；通过 sessions.get 逐级寻找登记根，防循环。根 run 结束后保留归属索引，后续调用不能变成“普通会话”而逃过门禁。
委派工具在 P08 默认拒绝（即便未来 scope 显式包含 spawn-subagent，仍需独立子运行约束后才能放行），故不存在默许未登记远程子 agent 的通路。未登记普通会话先返回 next，不读取 arguments、不计数、不写证据。不确定点：远程 provider 未必有本地 fork lineage；其启动因此仍拒绝，不能据 rootCallId 猜测远端 I/O 已受控。

### 17 补充：真实默认 Standard preset 的参数核对

2026-10-22 在隔离 profile 的真实 request/header.tools 中复核了 31 个可见工具（证据 `.dsh-dev/p08-evidence/native-tools.json`，不含消息和凭据）。参数以该轮绑定的 schema 为准；尤其 `pwsh` 是 `timeoutMs`，提问是 `multi_select`，header/options.description 非必填。该层不能用其他工具链的相似拼写替代。已将映射和测试同步。

| 当前可见工具                                                        | 参数字段（省略空对象）                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ask_user_question                                                   | questions[].id/question/header?/options[].label/description?/multi_select?                            |
| create_goal / get_goal / update_goal                                | objective,max_goal_rounds? / 空 / goal_id,revision,action,objective?,max_goal_rounds?,blocked_reason? |
| read / read_image / write / edit                                    | 与上表一致；写入的 sandbox_permissions 为扩大模式，WhaleDot 拒绝                                      |
| exit_plan_mode                                                      | plan；计划模式转换属于未授权管理操作，拒绝                                                            |
| glob / grep                                                         | pattern,path? / pattern,path?,include?                                                                |
| pwsh                                                                | description,command,timeoutMs?,workdir?,run_in_background?,sandbox_permissions?,justification?        |
| subagent / subagent_fork                                            | description,prompt,cwd?；均产生 spawn-subagent                                                        |
| send_message / interrupt_agent / list_agents                        | agent_id,message / agent_id / scope?                                                                  |
| job_output / job_kill / job_list                                    | job_id,wait?,timeout_ms? / job_id,reason? / 空                                                        |
| schedule_create / schedule_update / schedule_delete / schedule_list | prompt,title,时间选择器 / id,title?,prompt?,时间选择器 / id / 空                                      |
| skill / present / workflow / working_directory                      | name / files / script,meta,args?,run_in_background? / cd?                                             |
| todo_write / web_fetch / web_search                                 | todos[] / url / queries[]                                                                             |

界面会话导航另经 `dsh-client-ui-workspace/README.md` 的 Navigation 和同版本 `lib/types/client/navigation.d.ts:16–22` 查证，用 `uiWorkspace.openSession(sessionId)`，不臆造 HTTP 聊天路由。Cordis 的未声明注入上下文使用 `ctx.get('sessions')` 查询服务，避免直接属性访问触发注入检查。

## 19. P09：只读核对、运行状态与最终报告

2026-10-22 查阅 Desktop 同版本 README，并补充 npm `0.2.1-rc.2` 的声明；`dsh-agent`、`dsh-session-persistence` 只加入开发期类型依赖，生产代码不导入其运行时。

| 接口                                            | 查证位置                                                                        | 使用边界                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionController.inspect(sessionId, signal?)` | `dsh-api-session-controller/lib/types/index.d.ts:72–79`                         | 读取 attached / persisted Session，不激活 Agent；不调用 resolveAgent、resume、prompt                                                                    |
| `SessionInspection.events`                      | `dsh-session-persistence/lib/types/index.d.ts:57–60`                            | 完整且验证过的事件序列；只查询已经登记的 Run.sessionId                                                                                                  |
| `agents.get(id)` / `Agent.status`               | `dsh-agent/README.md` 的 registry/lifecycle；`lib/types/runtime-types.d.ts:147` | `running` 包含等待回答/审批；idle 与没有 live Agent 分开处理                                                                                            |
| 最终文本                                        | `dsh-session/lib/types/types.d.ts` 的 `assistant/message` 与 `turn/end`         | 只取原始首回合结束前最后一条非 interrupted、非 tool-call assistant/message 的非空 text；只保留布尔值。分析按 report-only 规则验收，编辑仍须独立命令证据 |
| 不存在                                          | `dsh-session-persistence/lib/types/errors.d.ts:9–13`                            | 只把稳定的 NotFound 错误当作不存在；其他 IO/格式问题不猜成停止                                                                                          |

真实隔离宿主验证：读取 P08 已卸载会话得到 report-only PASS；对 P08 重启 UNKNOWN 的冷会话核对后得到空报告的待决状态，Run 数前后均为 3，没有激活或重发。门禁用真实会话的三次 pwsh 调用另证，见 `p09-report.md`。

P09 的独立验收是明确的例外：Windows 通过 `execFile(cmd.exe, ['/d','/s','/c', '"' + exactCommand + '"'], {windowsVerbatimArguments:true})` 传递确认的命令，外层引号只用于 cmd 的传输封装。额外测试核对带空格的引号参数和 `node -e` 超时，防止反斜杠转义把可执行脚本变成普通字符串。其他 Git 操作仍使用 argv，禁用 hooks/fsmonitor。Connection 手工验收经官方 root-token 到 HttpOnly cookie 的交换，再调用既有认证面板接口，不伪造 owner。

### 19 补充：P04/P05 空闲通知会话与提问

2026-10-22，目标仍为 Desktop 0.2.1-rc.2 / Cordis 4.0.5。查官方包、公开界面及 Coopanion 使用文档，没有导入或复制 Coopanion 实现或素材。

| 接口                                                     | 查证位置                                                                                                | 实际用法与限制                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `userQuestions.ask({agent,questions,signal})`            | 同版本 `dsh-user-questions/lib/types/index.d.ts:98`；Desktop asar 中该服务 `async ask` 的只读提取       | 检查 exact live root，随后调用 scoped waterfall；没有 openTurn 检查。真实 idle Agent 成功显示 4 个带说明选项。                                |
| `sessionController.create/inspect/rename`                | 同版本 `dsh-api-session-controller/lib/types/index.d.ts:79,101,156`；官方 README 的 blank session reuse | 先登记请求的随机 sessionId，create 返回身份必须一致；inspect 只有明确 NotFound 才重建。rename 激活冷会话后用 `agents.get(id)` 拿到确切 root。 |
| `agents.get(id)`                                         | `dsh-agent/README.md` registry/lifecycle                                                                | 不依赖 npm 声明与 Desktop 实现曾有差异的 `resolveAgent`；从实际 registry 读取 Agent。                                                         |
| `permissionPresets.set/current`                          | `dsh-permission-presets/lib/types/index.d.ts` 与 README；current 在 162 行                              | 钉住 read-only；单独 inbox_sessions 所有权表在工具门禁入口无条件拒绝，包括派生会话。                                                          |
| `uiWorkspace.openSession(id)` / `layout.selectPanel(id)` | 本笔记第 18 节末导航补充、第 10 节；`dsh-client-ui-layout/README.md` Global panels                      | 面板提供“打开通知会话”。仅成功的 inbox open-panel/view-diff 选择触发客户端面板导航，不抢普通会话。                                            |

两个真实专用会话的持久化事件均为 `turn/start=0, request/header=0, tool/call=0`，见 `.dsh-dev/p04-p05-evidence/session-audit.json`。运行会话分别只有一次 turn/start 和一次 request/header，没有以模型回合维持通知通道。通知用模板，不调用模型。

实际 Edge 客户端能在无回合的通知会话中显示和提交问题。用户确认 Edge 有选项，随后报告桌宠只出现一瞬间、切回 Edge 仍不可见；不能以 Edge 成功代替桌宠内联选项或完成提醒的目视验收。原生窗口检查能读到宠物及“4 to handle”按钮，但前台显示不稳定；公开插件页为 0.4.13、1 running。浏览器直开宠物本地页面显示 Browser demo，因此没有拿该演示页作真实投递证据。

Coopanion 0.4.13 本机使用文档进一步确认：问题和审批始终在 Harness 中回答，信封仅提供“去处理”入口。原 P04 提示词的信封内直接选择要求超出了该版本的公开交互能力。其自身 pending request reminders 与 WhaleDot 的单次 ask 策略分开管理。

## 20. C01：桌宠直接回答问题的公开接口

2026-10-23，核对 Desktop 0.2.1-rc.2 的官方声明、README 和 asar 内实现只读副本。Coopanion 扩展位于独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion`，本节只记录接口结论，不复制其实现到 WhaleDot。

| 场景                                            | 结论与出处                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仍阻塞等待的普通问题、WhaleDot 的无回合主动 ask | `user-questions/request(request,next)` 的处理者可返回 `AskUserQuestionAnswer`。`dsh-user-questions/types.d.ts` 的事件声明及 README “While the tool call is open”明确只有原请求能提交，不能用 `answer()` 代替。                                                                                                                                                             |
| 多界面同时打开                                  | waterfall 中桌宠与 `next()` 的 Harness 处理者竞争同一个回答。必须保留第一次结算，并取消剩余的下游提问；仅把 `Promise.race` 返回而留下下游等待不够。公开 `AbortSignal` 是取消载体，不中止 Agent 或调用方控制器。                                                                                                                                                            |
| 取消边界                                        | Desktop `dsh-user-questions/lib/index.js:668–688` 的 `ask` 验证 exact live root 后，为 agent-scoped waterfall 创建 `{...request,agent}` 新事件对象。可给该事件副本的下游处理设置独立 signal；调用方原 request/signal 保留。Cordis 4.0.5 `lib/index.js:317–325` 的 next 继续传递同一事件副本，next 无替换参数。扩展测试须检查调用方 signal 不被取消、另一界面的等待被取消。 |
| 已转为 continued 的限时问题                     | 公开 `userQuestions.answer(agent,callId,answer): boolean`（同版本 `index.d.ts:55`；实现 `lib/index.js:552–586`）向同一 Agent steer `user-question-reply`，不是重建工具结果。仅 `continued` 接受；整批问题身份必须齐全，已排队返回 `REPLY_QUEUED`，已经结算返回 false。接受不等于模型完成。                                                                                 |
| 问题内容与自定义文字                            | `types.d.ts` 定义 id/question/detail/header/options/multiSelect/intent，没有独立 allowOther 字段；通用问答允许 custom。单选 custom 覆盖 selected，不能把文字解析成动作或权限。完整 id、label 精确校验，不截断后匹配。                                                                                                                                                      |
| 不内联的交互                                    | approval 保持原路径；multiSelect 或 plan-review 使用 Harness。没有可确认的 live root、超出本地展示上限或未知问题形状时同样保留 Harness 入口。                                                                                                                                                                                                                              |

原 Coopanion `src/index.ts` 的问题 observer 仅 `await next()`，`src/notification-broker.ts` 关联运行时请求及持久投影；`web/pet.js` 的 renderRequests 原先只生成“去处理/稍后”。本地扩展沿现有 Renderer → pet:action → Electron main → Host 的可信主 frame 路径增加结构化作答，不调用 sessionController.prompt、不改变审批或授权。

C01 实际隔离宿主补证：本地链接版通过原生信封回答 WhaleDot 无回合提问，原通知记录 retry/source=inbox，任务 v10 WAITING_APPROVAL → v11 READY；同一时刻已选好答案的 Harness 卡片随原生答复撤下，没有第二条 retry。普通模型的 ask_user_question 也从原生得到“挥手”答案并完成。通知专用会话持久事件仍为 turn/start=0、request/header=0、tool/call=0。用户确认选项及说明可见，但随后对气泡反馈“没看到桌宠，但听到声音”；窗口可见性没有通过目视验收。协议、原生渲染和用户目视证据分开记录，详见独立 Coopanion 仓库 `docs/c01-report.md`。

## 21. P11：伙伴 agent 预设、人格与工具作用域

2026-10-23，Desktop 0.2.1-rc.2 / Cordis 4.0.5。核对同版本类型声明与 Desktop 自带 profile 的预设写法，未复制其他插件实现。

| 接口                                  | 查证位置                                                          | 实际用法与限制                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@deepseek-ai/dsh-agent-preset` 行    | Desktop 默认 profile 中的预设行；`packages/host/cordis.patch.yml` | `id: whaledot-companion`，子插件只在该预设的 agent 内加载。工具、系统提示变量都随会话作用域生效，普通会话看不到伙伴工具                                      |
| `@deepseek-ai/dsh-persona`            | 同版本 persona 配置（prefix 模板、`complete`）                    | `prefix: '{{whaledot_persona}}'`、`complete: true`：整段替换默认人格。人格文本里的 `{{` 先转成 `{ {`，防止用户自定义文件被二次展开                           |
| `ctx.systemPrompt.variable(name, fn)` | 预设子插件 `inject: ['systemPrompt']`                             | 注册 `whaledot_persona`；每次请求读取当前缓存，语言或 personaPath 变化时重载                                                                                 |
| `ctx.tools.register(definition)`      | `dsh-tools/lib/types/index.d.ts:637`                              | 直接传普通 ToolDefinition 对象，不另装一份 `defineTool` 运行时；返回的撤销函数交给 Cordis effect。输出为 JSON 字符串，上限 16000 字符                        |
| 工具门禁                              | 本笔记第 18 节 `tools/pre-execute`                                | 伙伴会话（含历史伙伴会话）只放行 5 个 whaledot 读工具与 `ask_user_question`，其余统一拒绝 `companion-read-only`；同时钉住 `read-only` 权限预设作为第二道保险 |

## 22. P11：伙伴会话创建、工作区与复用

| 接口                                                              | 查证位置                                                             | 实际用法与限制                                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionController.create({sessionId, workspaceId, agentPreset})` | `dsh-api-session-controller/lib/types/types.d.ts:283–293`            | `workspaceId` 与 `cwd` 互斥；`agentPreset` 省略时用默认预设。先把随机 id 写进 store 再创建，返回 id 必须一致；返回的 agentPreset 若不是 `whaledot-companion` 视为失败 |
| `SessionHeader.agentPreset`                                       | `dsh-session/lib/types/types.d.ts:95`；inspect 的 `meta.agentPreset` | 复用判定：inspect 成功且 `meta.agentPreset === 'whaledot-companion'`；只有明确 NotFound 才重建，其它错误不当作不存在                                                  |
| `workspaceRegistry.create(path, title?)`                          | `dsh-workspace/lib/types/index.d.ts:146`                             | Web UI 只允许在属于工作区的空白会话里输入；伙伴目录 `<dataDir>/companion` 登记为名为“大肥鱼”的工作区（已存在则返回原工作区）                                          |
| `sessionController.rename`                                        | 本笔记第 19 节补充                                                   | 创建后改名为“大肥鱼” / “Da Fei Yu”。伙伴从不调用 prompt；第一轮由用户自己发起                                                                                         |

重建（面板“开一个新对话”）只新建会话，旧会话留在 Harness 并保留门禁所有权（`previous` 最多 20 个）。

## 23. P11：读取会话列表与内容

| 接口                                 | 查证位置                           | 实际用法与限制                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionController.list({}, signal)` | 同版本 session-controller 类型声明 | 过滤 blank、origin（派生）、伙伴和 WhaleDot 自有会话及 `[WhaleDot]` 标题；最多 20 个。标题按 `updatedAt` 缓存，靠 inspect 读取最新 `session/title` 事件                                         |
| `sessionController.inspect(id)`      | 本笔记第 19 节                     | 不激活 agent。只取 `source.kind === 'user'` 的 user/message（运行时上下文、技能目录等同为 user 角色，必须排除）、assistant 文本；工具只留 `name: ok/failed`，不带参数和结果。统一脱敏后分页返回 |
| 用户开关                             | `Config.companion`                 | `shareSessionTitles: false` 时列表只给计数，`read_session` 也不返回标题；`readSessionContent: false` 时拒绝读取；`excludedSessions` 按 id 或标题关键字隐藏                                      |

已知：两个早期测试会话事件损坏，inspect 抛格式错误，记日志后按无标题处理，不影响其他会话。

## 24. P11：DSH 界面语言

`settings.describe({redactSecrets: true})`（`dsh-settings/lib/types/index.d.ts:96`）中 `ns === 'locale'` 的 `value.preference` 是用户在 Harness 设置里选的语言。Desktop 宿主进程的 `Intl` 常报 en-US，所以 WhaleDot 的 `language: auto` 先读该值，读不到再回退到 `Intl`。伙伴标题、人格文件和通知文案都随它切换。时间统一按宿主时区输出 `YYYY-MM-DD HH:mm (UTC±hh:mm)`，避免模型把 UTC 当本地时间。

## 25. P12：工具内确认（方案 A）

结论：采用 A。同版本 `dsh-tools/lib/types/index.d.ts:216–241` 的 `ToolExecutionInput.agent` 是工具所属 Agent，`signal` 是调用取消信号；不从模型参数取 agent/sessionId。`dsh-user-questions/lib/types/index.d.ts:71–98` 与 Desktop 官方只读实现 `.dsh-dev/c04-user-questions-ref.js:668–688`：`ask({agent,questions,signal})` 校验 registry 的 exact live root，随后调 scoped waterfall，没有 openTurn 检查。因此可在伙伴正在执行的工具里向同一 root 提问，不新增 prompt 或模型回合。既有第 19 补充、20 节的多界面单次结算仍适用。

答案来自 userQuestions 的人类答题通道，模型工具参数不存在 confirmed/answer。`AskUserQuestionAnswerItem`（同版本 types.d.ts）使用 id/selected/custom；自定义文字重新验证后保存。缺失服务、取消、无 provider、非法答案、工具/会话 signal 中止均不写入。供应 signal 中止抛 ASK_ABORTED；本插件以 10 分钟 AbortSignal.timeout 与工具 signal 合成，逾时 declined。关闭客户端问题卡不一定中止宿主等待（第 20 节：关闭不构成答复），因此仍等待回答/取消/超时，期间不保存。没有使用 askTimed 的 continued 回合或让模型报告同意。

不确定点：不同客户端关闭问题卡的即时取消 UX 不统一；保存语义不依赖关闭事件，只依赖一次精确问题身份的人类回答和未中止的调用。

## 26. P12：系统提示变量刷新

结论：每次 assemble 都解析注册变量，不缓存到会话 header。出处：同版本 `dsh-system-prompt/README.md` 的 “Contribute a prompt variable”（约 70–77 行）和 “Assembly and rendering”（约 108 行）：变量 resolve at each assembly；assemble 返回当次已求值 variables，renderPrompt 随后展开。`whaledot_memory` 回调每次同步读当前 store，下一次组装立刻读取更新/删除/开关状态；项目记忆不常驻，Autopilot 提示不改。稳定块按 kind/id 排序，内容无每轮时钟，模板标记 `{{` 转为 `{ {`。

不确定点：已经在途的模型请求不会 retroactively 修改提示；生效边界是下一次请求组装（含同一回合的下一模型步骤）。

### P12 第二部分补充：配置与事件

`dsh-settings/README.md` 的 Use this package 明确：表单只暴露 `.volatile()` 字段，普通配置仍从 Cordis 文件编辑。因此 `companion.memory.draftProjectLessons` 声明为 volatile boolean，面板以既有 `settings.describe/update(ns,patch,revision)` 更新；Host 通过引用的 `.get()` 每次读取。真实面板开关已验证持久化与热更新。其余记忆配置保持普通 Config 字段，修改后重启。

经验草稿复用 P07 的 `dshDraftModel`（默认模型、无工具、一次 stream、失败不重试），没有新增模型轮询或 DSH 事件。源为 WhaleStore 已有 goal.status=completed、notification.reason=stalled/verification-unknown，以及成功的结构化 notificationChoices；用户确认本次仅准备 abandon/change-direction 事件合同与测试，按钮在 P13 接入。自由文本、标签和备注不能冒充该结构化决策。

`memory-proposal` 是独立的记忆提议通知投影，保存在 v7 memory_proposals 账本；它没有执行动作、taskVersion 或授权绑定。与 P04 共用 decideDelivery 策略、每小时投递历史和同一个 dshInbox 适配器。项目经验由该目标的只读 inbox root 发 ask；没有 goal 的整理建议经公开 rename 恢复当前伙伴 root 后 ask（不 prompt）。面板与信封结算同一提议事务，完成后中止尚在等待的另一个答题入口。

## 27. P13：同回合连续工具内确认

沿用第 25 节方案 A，直接调用 `CompanionMemory.confirm`，不使用第二部分草稿收件箱。官方只读实现 `.dsh-dev/c04-user-questions-ref.js:668–696`：每次 ask 都校验 exact live root，然后向该 agent scoped waterfall 发一次 request；没有每回合一次的限制或已回答缓存。每次问题使用新的随机 id，调用 resolve 后可在相同 live agent 上再 ask。工具输入来自同版本 `dsh-tools/lib/types/index.d.ts:216–241` 的 agent/signal；不接受模型 supplied sessionId / confirmed。

P13 自动测试用同一 agent 顺序完成暂停与继续两次确认，核对问题 id 不同、每次均经 ask；取消、超时、custom、错误 id、会话中止不执行。多次工具调用仍各自确认，不能把两项动作合在一次确认里；本结论不声称客户端的关闭卡片等同取消（第 25 节的限制仍适用）。

其余 P13 接口为 WhaleDot 自身服务，参数、校验、来源和副作用列在 `docs/p13-report.md`，没有引入新的 DSH 服务。P07 的 grant/confirm 仍只接受真实 owner PeerScope；确认过的伙伴管理调用使用宿主进程内 WeakSet 身份能力，仅允许草案 start、暂停管理与只读 detail，不铸造 owner principal，也不能作为授权确认身份。
