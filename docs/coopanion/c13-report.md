# C13：日常自动审批与桌宠审批接口查证

日期：2026-10-25。依据 [C13 提示词](../../prompts/C13-在桌宠里审批.md) 与 [C00](../../prompts/C00-鲸鱼插件通用上下文.md)。

## 完成情况

| 部分                   | 结果                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前置 CI 修复           | `52d5820` 将全量 CI 对齐已验证的 Windows 平台，`27fefc1` 为测试使用解析后的真实临时目录。已推送；[GitHub CI](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40195477326) 完整通过。未移动 `v1.0.0`。 |
| WhaleMaid 日常自动审批 | 已实现，默认关闭；中英文设置、风险确认、脱敏记录和关闭入口；真实模型及宿主审批验收通过。仅在本地提交。                                                                                                     |
| 桌宠内回答审批         | **未实现**。rc.3 没有提供本任务所需的公开下游撤回接口；按提示词“找不到公开做法就停下说明”停止这一部分，没有改写只读请求、访问私有字段或打猴子补丁。                                                        |
| 桌宠仓库               | `whaledot-local`，包含 `37a9971`，开始及结束时均干净。没有代码修改、提交或推送。                                                                                                                           |
| 清理                   | 自动审批已关闭，目标暂停、无运行中的 run，配置逐字节恢复，测试进程及端口停止。三个临时目录的删除被自动安全审查拒绝，目录保留。                                                                             |

证据位于 `.dsh-dev/c13-evidence/`。本报告留在工作区，**不提交**，供审查。

## rc.3 接口查证

从安装中的 Desktop `app.asar` 只读提取实际实现，未修改宿主。`reference-versions.json` 确认 Desktop、`dsh-user-approval`、`dsh-api-remotes`、一次性 shell 工具为 `0.2.1-rc.3`，Cordis 为 `4.0.5`。

| 问题                 | 出处与结论                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 回答链顺序           | `cordis-lib-index.js:258–263,317–324,336`：按注册列表顺序调用；`EventOptions` 只有 `prepend/global`，没有数值优先级。`prepend` 插入头部。`dsh-api-remotes-lib-index.js:165–175` 的终端转发回答者没有 prepend，因此日常回答者在它之前，与终端注册先后无关。两个都 prepend 的插件则是后注册者在前，不能将此当稳定的策略优先级。 |
| 命令文字             | 公共 `Session.snapshotEvents()` 的 `tool/call` 包含完整原始 JSON `arguments`；按审批 `callId` 精确关联并核对工具名。实际请求已由真实模型产生，见下表。没有从可读 reason 反推命令。                                                                                                                                            |
| 原对象还是新信封     | `dsh-user-approval-lib-index.js:128–138,172–176`：`request(req)` 直接把借用的 `req` 传给 waterfall，没有复制。公开声明把 `signal` 标为 readonly。它与 `UserQuestionService.ask` 创建可修改事件信封的做法不同，不能照搬 InboxQuestions。                                                                                       |
| 替换下游参数         | Cordis 的 `next` 是零参数续调，闭包复用原始参数数组；`next({...request, signal})` 的新参数不会传到下一回答者。`waterfall-probe.mjs/json` 实测确认。冻结请求的程序性测试也拒绝替换 signal；**并未声称真实宿主请求被冻结**。                                                                                                    |
| Harness 如何撤回卡片 | `dsh-client-ui-approval-lib-client.js:191–201,283–310`：待答卡片依赖请求 signal 或自身回答／委托结算；没有公开的“根据原审批 ID 撤回另一个回答者”能力。`ApprovalService` 也没有对应公开取消句柄。单纯 Promise.race 后先返回结果，不会结束仍在等待的下游卡片。                                                                  |
| Outcome              | 实际服务接受 `allowed-once`、`rejected`、`cancelled`、`unavailable`。日常回答者仅返回 `allowed-once` 或委托，不产生拒绝，也不改策略。桌宠协议拟用的 `allow-once/reject` 需要另行映射，当前没有新增这条协议。                                                                                                                  |

因此没有接入第二个桌宠回答者，也未声称解决了两插件任意加载顺序或两端抢答撤回。要继续第二部分，需要宿主提供可复制的请求信封／下游取消句柄，或等效的公开竞争作答接口；不需要把日常自动审批改成“完全访问”。

### 普通会话的实际请求

隔离 profile 为 `whaledot-p02`，权限预设 `workspace-write`（界面“工作区内修改”），审批策略 `ask`。为稳定产生三次审批，每次都明确请求该次 shell 提权到 `danger-full-access`；没有假称普通目录内操作天然都会弹审批。来源为 `approval-requests.jsonl` 与三份 baseline 事件快照。

| 操作     | toolName / 完整命令                                                                   | 请求参数与结果                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 下载     | `pwsh` / `curl.exe https://example.com -o sample.txt`                                 | workdir 为虚构 fixture；`sandbox_permissions: danger-full-access`；`description: Download fictional sample file`；`justification: C13 isolated approval test`。开关关闭，Harness 人工拒绝。 |
| 越界写入 | `pwsh` / `Set-Content -LiteralPath '<fixture 的上级>/outside.txt' -Value 'fictional'` | 同一 workdir 和单次提权字段；reason 为 `escalate sandbox to danger-full-access: C13 outside test`。人工拒绝，文件未创建。                                                                   |
| 删除     | `pwsh` / `Remove-Item -LiteralPath victim.txt`                                        | 同一 workdir 和单次提权字段；reason 为 `escalate sandbox to danger-full-access: C13 delete-baseline test`。人工拒绝，文件保留。                                                             |

三次请求均有 `agent`、精确 `callId` 与 signal。报告省略身份值；证据保留配对。一次性 shell 的真实 rc.3 提权取值是 `workspace-write/danger-full-access`，不是其他工具的 `require_escalated`。初次错误参数只产生 INVALID_ARGS，没有审批或执行；记录保留，没有算作验收。

## 实现要点

- `everyday-approval/service.ts` 是非终端回答者。只处理能精确关联当前未结束工具调用的一次性 `bash/pwsh`，严格检查已查证参数；缺少命令、未知参数、后台／持久工具或无法解析的命令继续交给人。
- 复用 core 的 `classifyCommand` 和 `checkAction`，临时识别边界取会话工作目录，并检查命令 workdir 的实际路径。没有生成持久目标授权，也没有修改目标模式的危险识别规则。额外在日常层将 pip 等包管理器的卸载文字交给人，补足现有识别器的漏项。
- 排除新旧自动任务标题、原执行前缀、执行登记中的会话、大肥鱼 preset、子代理／父会话标记及归档会话。缺失归档真值、取消、服务消失、插件卸载、记录无法落盘时均不自动批准。
- 通过公开 `ctx.get('agents')` 读取可选服务；Cordis 每次可返回新的服务代理，因此重新核对活 Agent 与根身份，不比较两次服务代理的引用。
- 开关和最近 1000 条记录共用 SQLite 原有 settings 表，默认关闭，重启保留，无新增迁移。只有已认证 owner 能通过面板端点修改；开启还要求显式确认。设置页和面板使用同一状态，确认取消不会开启。
- 记录包含时间、会话名与 ID、工作目录、最多 500 字符的命令和识别结果。先用现有脱敏函数及环境变量赋值脱敏，再截断。交给人的请求不记入列表；落盘失败不授予权限。
- 设置页提供中英文风险说明，明确脚本内部不可见，且日常会话没有目标模式的 worktree／检查点／回滚。产品文档同步到中英文使用说明。桌宠保留现有提醒与打开 Harness 入口，没有新增按钮或菜单操作。

## 验证

| 检查               | 结果                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhaleMaid 基线     | 48 文件、1182 项全量通过；此前 build/typecheck/lint/format 全部通过。                                                                               |
| 桌宠基线           | `npm test` 通过：Vitest 296 通过、11 项原有跳过；后续 Node 子测试通过。`npm run test:inbox-ui` 通过，日志分段保留；`npm run verify:metadata` 通过。 |
| 新增日常审批测试   | 49 项，覆盖普通命令、危险类别、卸载、坏参数、未知调用、会话排除、开关确认、日志脱敏与保留上限、真实 Cordis plugin scope、服务代理和卸载。           |
| WhaleMaid 最终全量 | `pnpm test --maxWorkers=2`：49 文件、1231 项全部通过，coverage 门槛通过；未过滤或跳过。                                                             |
| 其余工程检查       | `pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check` 通过。                                                         |
| 桌宠原生矩阵       | 本轮未改桌宠或实现第二部分，因此没有新增 `test:desktop`、两风格审批 UI 或原生鼠标验收，也没有将基线当作这些功能的验收。                             |

调试中保留了参数不匹配、可选服务访问、服务代理引用比较和程序探针的失败证据。最终代码已增加对应回归测试。程序探针没有建立完整的模型 step 日志，两个诊断会话重载时报格式错误；仅用于即时接线诊断，不作为真实模型、可恢复会话或产品功能通过的证据。

## 真实宿主验收

使用 `scripts/dev-host.ps1 -UseUiKey`、独立 pet 数据目录和 9498 调试端口；WhaleMaid 数据另放在本次 evidence 的 `data/`。页面操作由 `playwright-core` 经专用 Chromium 的 CDP 9497 完成，使用宿主认证链接，保留截图及原生事件。未使用浏览器控制工具或移动系统鼠标，没有在日常 profile 测试。桌宠第二部分未做 UI 验收。

| 步骤                       | 实际结果                                                                                                                     | 主要证据                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 关闭时下载、越界写入、删除 | 三次都到 Harness；拒绝均有唯一 `approval/decided: rejected`。未下载、未越界写入、未删除。                                    | `01-download-off-approval.png`、`02-outside-approval.png`、`03-delete-approval.png`，baseline 事件与请求结构。           |
| 开启与风险确认             | 面板确认开启；设置页看到同一开关。中英文取消确认均未开启；之后确认恢复开启。                                                 | `04-before-enable.png`、`05-enabled.png`、`08-settings-zh.png`、`09-settings-en.png`。                                   |
| 开启后普通下载             | 真实模型单次调用，自动 `allowed-once`，8ms 内配对落日志，没有人工点击批准；curl 成功，生成 577 字节文件。                    | `final-auto-download-events.json`、`06-auto-download-complete.png`、`07-auto-history.png`、`file-outcomes.json`。        |
| 开启后危险删除             | 仍到 Harness。拒绝后 victim.txt 保留；重新发起后手动允许一次，文件才删除。两次均不计入自动审批记录。                         | `delete-on-reject-approval.png`、`delete-on-allow-approval.png`、对应事件快照。**这是 Harness 作答，不是桌宠作答验收。** |
| 真实高权限目标             | 日常开关保持开启。目标 edit 任务在独立 worktree 请求删除，仍出现可读人工审批；拒绝后工具被拒绝、文件保留，没有自动审批记录。 | `10-goal-danger-still-asks.png`、`goal-native-events.json`、`final-file-outcomes.json`、`final-goal.json`。              |
| 关闭后再下载               | 关闭入口生效；相同命令恢复人工审批。拒绝后没有执行，原下载文件仍为 577 字节，自动记录没有增加。                              | `11-disabled.png`、`pending-C13-disabled-download.png`、`disabled-download-events.json`。                                |

第一轮目标的 edit 没有调用工具，只回复准备完成；独立验收正确返回 `INSUFFICIENT_EVIDENCE: no-changes`。它不算危险审批验收，随后通过已确认的 fixture 放弃决定关闭，保留历史；新建目标修正测试指令后才得到上表的真实危险审批。没有修改验收器、绕过任务状态或放宽目标授权。

最终自动记录为两条：一条真实下载，一条明确标记的程序接线探针。没有将探针记作真实模型执行；高权限目标的 run ID 与会话均未命中自动批准记录。摘要在 `acceptance-audit.json`。

## 清理与待审查

自动审批关闭；复测目标暂停、autopilot 关闭、running run 为 0。测试宿主、Chromium 与鲸鱼已停止，3182/9497/9498 无监听。隔离 `cordis.patch.yml` 与备份逐字节相同；没有改动日常 profile 或凭据。`cleanup-files.json` 记录实际保留情况。

自动安全审查两次拒绝删除虚构测试目录，仅返回 `blocked by policy`，没有更具体原因；没有改用其他方式绕过。以下目录仍保留在 `.dsh-dev/c13-evidence/`，不能把目录清理记为完成：`fixture/`、`data/worktrees/goal_a8b38b7b-083e-4945-a639-1a4182aa2760/`、`data/worktrees/goal_d2a82fa7-2b23-45cb-949c-33f6086ae73d/`。

WhaleMaid 功能提交为 `d2ccedb feat: auto-approve ordinary commands in everyday sessions`，仅本地提交；桌宠没有可提交的变更。报告保持未提交。第二部分及其抢答、两种风格、防误触、安静模式和原生测试均未完成，等待公开 API 条件解决后再继续。

## 审查（Claude）

**第一部分可以接受。** `d2ccedb` 的日常自动审批实现谨慎：

- 只处理能精确关联到本轮工具调用的一次性 shell；
- 工作目录取实际路径并核对在会话目录内；
- 用目标模式的识别器重新判断，另外补上了包管理器卸载的漏项；
- 磁盘读写之后再核对一遍开关、会话归属和归档状态；
- 任何异常都交给人，从不拒绝。

Claude 复测：`pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 通过；`pnpm test --maxWorkers=2` 共 49 个文件、1231 项全部通过。

**第二部分的停止理由成立，但找错了方向。** 作为链上第二个回答者确实无法撤回 Harness 卡片。不过，还有一条不需要第二个回答者的公开做法：

- Harness 客户端的 `ctx.uiSession.sessionStatus`（`@deepseek-ai/dsh-client-ui-session` 的公开类型）会列出每个会话的待答交互；
- 审批项就是 `@deepseek-ai/dsh-client-ui-approval` 的 `PendingApproval`，带公开的 `answerable` 和 `answer('allowed-once' | 'rejected')`；
- 鲸鱼插件本身有在 Harness 窗口里运行的客户端代码，可以直接调用这个 `answer()`，效果等于用户按了卡片上的按钮。

Harness 自己的其他包也读 `sessionStatus`。这一部分改写为 [C13B](../../prompts/C13B-桌宠审批走Harness卡片.md)。

**其他事项：**

- 报告里列出的三个未删除测试目录（`fixture/` 和两个目标工作树）：Claude 用 `git worktree remove` 移除了工作树，并删除了 fixture。
- 远端核对（P19 之后）：`Xiaxin1235/WhaleMaid` 为私有，只有 `master` 和 `v1.0.0`，有一个 Release；远端 250 条作者 / 提交者记录全部是隐私邮箱。CI 在 `27fefc1` 通过。本地 `codex/f01-review-fixes` 分支仍有旧邮箱的提交，该分支未推送。
- `d2ccedb` 尚未推送。
