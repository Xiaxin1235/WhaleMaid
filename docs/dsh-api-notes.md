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
