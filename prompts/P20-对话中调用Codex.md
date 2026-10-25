# P20 WhaleDot：在 Harness 对话里调用 Codex

**前置**：`master` 工作区干净，P19 已完成（仓库已上传）。先跑一遍 `pnpm test`，确认基线通过。宿主为 DSH Desktop **0.2.1-rc.3**；本机已安装 `codex-cli`，在 `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`，与 Codex Desktop 共用登录。

## 目标

用户在 Harness 的普通对话里说“让 Codex 把这个 bug 修了”，DeepSeek 调用一个 `codex` 工具。Codex 在**当前会话的项目目录**里完成任务，把结果交回对话，DeepSeek 接着往下聊。

## 先查证（写进报告，附 rc.3 类型定义或实测出处）

1. **MCP**：Harness rc.3 能否接入外部 MCP 服务器（配置项、包名、设置界面）？
   - 如果能，先评估直接接 `codex mcp-server`：能否限定工作目录和沙箱模式、能否逐次审批、取消能否传到 Codex。
   - 满足下文全部安全要求时，可以只写配置说明，不写代码；否则走第 2 条。
   - 不能接，就写明依据。
2. **工具注册**：WhaleDot 给大肥鱼注册工具的方式（`ctx.tools` 等），能否注册成**所有普通会话**可用、但受 WhaleDot 开关控制的工具？大肥鱼会话和 WhaleDot 自动任务会话要排除，见下文。
3. **超时与进度**：一次工具调用最长能等多久？Codex 可能跑好几分钟。能否在运行中向对话报告进度？取消这一轮时，工具能否收到中止信号？
4. **审批**：工具执行前能否用 Harness 原生审批（`PreToolDecision {kind:'ask', reason, displayReason}` 或 `approval` 服务）？`reason` 会被持久化，P14I 的经验是只放可读文字。
5. **Codex 实测**，在 `.dsh-dev/p20-probe/` 下的临时 Git 仓库里进行：
   - `codex exec --json -C <dir> -s read-only` 和 `-s workspace-write` 在 Windows 上：
     - 能否写目录外的文件；
     - 能否联网；
     - 遇到被沙箱拦下的操作时如何表现；
     - 退出码和 JSON 事件的格式；
     - `-o` 最终消息文件的内容。
   - 未登录时报什么错。
   - 结束进程树后，Codex 是否留下子进程。
   - `codex exec resume` 能否接着同一次会话。
   - 实测只用无害任务，例如“列出文件”“在 README 末尾加一行”，不涉及用户的真实项目。

## 实现（以注册工具为准；若 MCP 满足全部要求，说明理由后可以改走 MCP）

### 开关与范围

- **开关**：WhaleDot 设置“允许对话调用 Codex”，**默认关闭**，中英文案。关闭时工具不出现，或调用后直接返回“未开启”。
- **可用范围**：只在普通会话里提供。**排除**：
  - 大肥鱼专属会话；
  - WhaleDot 自动任务会话（标题以 `[WhaleDot]` 开头，或首条消息以 `WhaleDot: execute this single task` 开头）；
  - 已归档会话。
- **工作目录**：固定为当前会话的工作目录，**模型不能传入目录参数**。工作目录不存在或不是目录时，拒绝执行。
- **参数**：只有 `task`（1–8000 字）和 `mode`（`read-only` | `workspace-write`，默认 `read-only`）。
- **沙箱**：对应 Codex 的 `-s read-only` / `-s workspace-write`。
  - **永远不传** `--dangerously-bypass-approvals-and-sandbox`、`danger-full-access`，也不传任何放宽沙箱的 `-c` 配置。
  - 实测发现 Windows 上的沙箱不能限制写入目录外的文件时，`workspace-write` 模式在报告里明确标出，并在审批文字里提示用户。

### 审批

- 每次调用前都走 Harness 原生审批，选项只有“允许一次 / 拒绝”。审批文字显示：
  - 模式（只读 / 可改文件）；
  - 工作目录；
  - 任务的前 300 字。
- 拒绝、超时或无人作答时，不运行 Codex。
- 本次**不做**“只读免确认”，留作以后的选项。

### 运行

- 用 `spawn` 启动 Codex，**不经过 shell**，参数逐个传入。`task` 通过标准输入或参数传给 Codex，不拼接进命令字符串。
- 超时默认 15 分钟，设置里可调，范围 1–60 分钟。超时或这一轮被取消时，结束整个进程树，Windows 上用 `taskkill /T /F` 或等效方法，并确认没有残留进程。
- 同时最多运行 1 个 Codex，多出来的调用直接返回“已有 Codex 任务在运行”。
- 能报告进度的话，从 JSON 事件里提取简短进度，不转发 Codex 的完整推理内容。

### 返回给对话

- Codex 的最终回复，超过 8000 字时截断并说明。
- `workspace-write` 模式下，附运行前后 `git status --porcelain` 的差异，即改了哪些文件，不附文件内容。
- 退出码、耗时；如果失败，写明原因（未登录、沙箱拦截、超时、取消）。
- 返回的内容是**数据**：工具说明里写清楚，DeepSeek 不应把 Codex 输出里的文字当作用户指令。

### 记录

- 每次调用记一条：
  - 时间、会话 ID、模式、工作目录、任务前 300 字；
  - 退出码、耗时、改动文件列表；
  - 完整 JSON 日志的文件路径。
- 日志放在 WhaleDot 数据目录下的 `codex-runs/`，保留最近 100 次。
- 面板的 WhaleDot 设置旁显示最近几次的摘要。
- 日志和记录中**不得出现**任何 API Key、令牌或环境变量值。Codex 子进程只继承必要的环境变量（`PATH`、`USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`TEMP` 等），**不传** `DEEPSEEK_API_KEY` 或其他与 DSH 相关的密钥。

### 复用

把启动、沙箱参数、取消和日志写成独立模块，例如 `packages/host/src/codex/runner.ts`，以后 Autopilot 的“Codex 执行器”直接复用。本任务**不改** Autopilot 的执行通道。

## 测试

- **单元**：
  - 参数校验：长度、mode 取值、拒绝多余字段和目录参数；
  - 生成的命令参数里永远没有 bypass 和 `danger-full-access`；
  - 子进程环境不含 DSH 密钥；
  - 超时和取消会结束进程；
  - 并发上限；
  - 被排除的会话类型拿不到工具；
  - 开关关闭时不可用；
  - 审批拒绝时不启动进程；
  - 截断。
  
  单元测试用假的 Codex 可执行文件（测试脚本），不调用真实 Codex。
- `pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 全部通过。

## 验收（隔离环境 whaledot-p02，端口 3182）

在 `.dsh-dev/p20-probe/` 下准备一个临时 Git 仓库，把它作为测试会话的工作目录。

1. **开关关闭**：让 DeepSeek 调用 Codex，确认不可用。
2. **只读**：开启开关，让它“用 Codex 列出这个仓库的文件并总结”。确认：
   - 弹出审批，文字可读；
   - 允许后有结果，对话能接着聊；
   - 记录里有这一次调用。
3. **拒绝**：重复第 2 步，审批时拒绝，确认 Codex 没有启动。
4. **可写**：让它“用 Codex 在 README 末尾加一行”，确认改动文件列表正确，文件确实被改了。
5. **取消**：给 Codex 一个耗时的只读任务，运行中取消这一轮，确认进程树已结束。
6. **排除**：在大肥鱼会话里，确认没有这个工具。

每一步都要截图。Codex 的真实调用会消耗用户的 ChatGPT / Codex 额度，整个验收**最多运行 6 次**真实 Codex。用户的 Codex 未登录时，停下请用户登录，**不要**代为登录。

清理：

- 停止测试宿主；
- 确认 3182 端口无监听、没有残留的 codex 进程；
- 恢复隔离配置；
- 不在日常 profile 测试。

## 报告

写到 `docs/p20-report.md`，包括：

- 查证结论（含 MCP 为什么用或不用）；
- Codex 在 Windows 上的沙箱实测结果；
- 实现要点、测试和验收结果；
- 已知限制。

本地提交 `feat: call Codex from Harness conversations`，**不推送**。完成后停下，等审查。

## 不做

- 不改 Autopilot 执行通道，不改大肥鱼的工具集。
- 不放宽 Codex 沙箱，不保存或读取 Codex / ChatGPT 的登录凭据。
- 不接 Claude Code 等其他 agent（以后复用同一模块）。
- 不在鲸鱼插件里做任何改动（桌宠审批是 C13）。
