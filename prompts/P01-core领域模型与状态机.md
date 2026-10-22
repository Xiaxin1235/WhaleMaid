# P01 core：领域模型、状态机、策略基元（M0，为 M2 打地基）

## 目标
在 `packages/core` 实现 WhaleDot 的纯领域层。这是整个项目的“大脑”：后续 Host 的调度、门禁、验收都只调用这里的纯函数。**无 IO、无全局时间、无随机数**（通过注入）。

## 要做的事

### 1. 基础设施 `src/infra.ts`
- `interface Clock { now(): number }`（毫秒时间戳）、`interface IdGen { next(prefix: string): string }`。
- 提供 `fixedClock(t)`、`sequenceIdGen()` 给测试用。
- `Result<T, E>` 轻量类型（`{ok:true,value}|{ok:false,error}`），领域函数优先返回 Result 而不是抛错；**只有违反不变式（程序 bug）才 throw**。

### 2. 实体类型 `src/model/*.ts`
按 `docs/架构与开发路线.md` 第 4 节定义：`ProjectGoal`、`AuthorizationScope`、`Task`、`Run`、`Attempt`、`Checkpoint`、`Evidence`、`MemoryRecord`、`Notification`、`Suggestion`、`StateTransition`。
- 每个实体同时提供 zod schema（`GoalSchema` 等）和由 schema 推导的类型，便于持久化时校验。
- `ActionIntent`：可区分联合类型，表示“真正要执行的动作”，与给用户看的文字分离。首批成员：`read-file{path}`、`write-file{path}`、`run-command{cmdline, cwd}`、`git{subcommand, args[]}`、`network{url, method}`、`continue-goal{goalId}`、`pause-goal{goalId}`、`resume-goal{goalId}`、`rollback-to-checkpoint{checkpointId}`、`reply-to-session{sessionId, text}`、`open-workbench{sessionId?}`、`expand-scope{goalId, patch}`（最后这个永远只能由用户在 UI 中确认）。
- 所有 ID 用品牌类型（`type TaskId = string & { readonly __brand: 'TaskId' }`）。
- `AuthorizationScope.limits` 默认值：`maxFixRounds: 2`、`maxStallRounds: 3`、`maxConcurrentWritePerProject: 1`、`maxChangedFilesPerTask: 20`、`maxRunMinutes: 30`、`maxRunsPerDay: 20`。导出 `DEFAULT_LIMITS`。
- `permissionPreset` 只能是 `'read-only' | 'workspace-write'`（**类型层面就排除 `danger-full-access`**）。
- `AuthorizationScope.hash`：对规范化后的 scope 内容做稳定哈希（排序键后 JSON → sha256；core 不能用 node:crypto 的话就把 `hash(content: string): string` 作为注入依赖）。

### 3. 任务状态机 `src/task-state.ts`
- 状态：`PENDING, READY, RUNNING, VERIFYING, SUCCEEDED, WAITING_APPROVAL, BLOCKED, FAILED, UNKNOWN, PAUSED, CANCELLED`。
- 用一张**显式迁移表**定义合法迁移（例：`RUNNING → VERIFYING | FAILED | UNKNOWN | PAUSED | WAITING_APPROVAL`；`UNKNOWN → VERIFYING`（核对外部状态后）`| FAILED | BLOCKED`，**`UNKNOWN → RUNNING` 不允许**；`SUCCEEDED`、`CANCELLED` 为终态）。请在代码注释里为每条迁移写一句理由。
- `transition(task, to, meta: {source, reason, runId?}, deps: {clock, idGen}) → Result<{task, record: StateTransition}, TransitionError>`；迁移成功时 `task.version + 1`。
- 乐观并发：`transition` 接受 `expectedVersion`，不匹配返回 `stale-version`。

### 4. 目标与依赖 `src/goal-graph.ts`
- `validateDag(tasks)`：检测环、悬空依赖。
- `readyTasks(tasks)`：依赖全部 `SUCCEEDED` 且自身 `PENDING` 的任务（用于提升为 `READY`）。
- `selectNextTask(goal, tasks, runningTasks, limits)`：遵守“同项目写任务并发 = 1”、只读分析任务可并行（`kind: 'analyze'|'research'` 视为只读）；按创建顺序稳定排序；返回 `null` 时附带原因（`no-ready-task` / `write-slot-busy` / `goal-not-active`）。
- 去重：`taskKey(goalId, normalizedTitle, kind)` 稳定键；`mergeProposedTasks(existing, proposed)` 丢弃键重复的提议。

### 5. 范围检查基元 `src/scope.ts`（ToolGate 与 Scope Guard 的共同基础）
- `isPathAllowed(scope, absPath)`：Windows 路径大小写不敏感、规范化 `..`、拒绝 `\\?\`、UNC 路径与符号链接逃逸的**字符串层面**检查（真实 realpath 由 host 先解析再传入）；`protectedPaths` 优先于 `allowedPaths`。
- `classifyCommand(cmdline): CommandClass`：识别 `git push`、`git reset --hard`、`rm -rf`/`Remove-Item -Recurse`、`npm publish`、包安装（`npm i`/`pnpm add`/`pip install`/`winget`/`choco`）、网络上传（`curl -T`/`scp`/`Invoke-WebRequest -Method Put|Post` 等）、注册表/系统配置修改。返回 `{class: 'safe'|'needs-approval'|'forbidden', reasons[]}`。宁可误报 needs-approval，不可漏报。
- `checkAction(scope, action: ActionIntent) → GateDecision`，`GateDecision = {decision:'allow'|'ask'|'deny', reason, ruleId}`。scope 为 `revoked` 时一律 `deny`。

### 6. 测试
- 状态机：迁移表的每一条合法迁移、若干非法迁移、版本冲突。
- DAG：环、悬空依赖、并发选择。
- scope：路径边界（大小写、`..`、protected 覆盖、`C:\proj` vs `C:\project2` 前缀陷阱）、命令分类（每类至少 3 个正例 + 2 个反例，包括 PowerShell 写法）。
- 目标覆盖率：`src/task-state.ts`、`src/scope.ts` 行覆盖 ≥ 90%（配置 vitest coverage）。

## 不做
- 不写持久化、不接 DSH、不调模型。

## 完成标准
- `pnpm --filter @whaledot/core test` 通过且覆盖率达标；提交 `feat(core): domain model, task state machine and scope primitives`。
