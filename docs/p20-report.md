# P20：在 Harness 对话中调用 Codex

日期：2026-10-25。依据 [P20 提示词](../prompts/P20-对话中调用Codex.md)。仅本地提交，不推送；未改 Autopilot 执行器或独立桌宠仓库。

## 结果

已实现普通会话的 `codex` 工具、默认关闭的中英文设置、逐次原生审批、固定目录、两种模式、超时／取消、进程树终止、脱敏日志和最近摘要。真实只读、拒绝、取消、伙伴排除及设置界面已验证。

**可写验收未通过**：传入 `-s workspace-write` 后，Codex 编辑工具仍报告只读沙箱和审批设置拒绝写入，README 未改变。没有放宽沙箱，没有把退出码 0 当作修改成功。六次真实调用已用满，不追加重试；该限制需要后续在新的验收授权下复测。因此不能把 P20 的全部真实验收标为通过。

## 接口查证

实际宿主 Desktop 为 `0.2.1-rc.3`；只读提取的 `dsh-tools`、`dsh-mcp-client`、`dsh-tool-call-timeout-policy`、`dsh-user-approval`、`dsh-agent` 均为 rc.3，版本见 `.dsh-dev/p20-evidence/versions.json`。Codex 为用户指定路径下的 `codex-cli 0.146.0`，`login status` 显示使用 ChatGPT 登录；没有读取或保存登录凭据。

| 问题               | 依据与选择                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness 外部 MCP   | `dsh-mcp-client` 实际 README 和实现支持 stdio／streamable-http；配置包含 command、args、cwd、env、serverName、toolCallTimeoutMs，工具名为 `mcp__<server>__<tool>`。可通过 profile 插件配置接入。未找到这版独立的完整 MCP 设置向导，不臆造菜单。                                                                                                                                                                     |
| 为什么不用直接 MCP | 对本机 `codex mcp-server` 仅做 initialize/tools-list，**未发 tools/call**。其 codex 工具允许模型提供 cwd、sandbox、approval-policy、config 等，不能仅靠配置落实本任务的“目录不得由模型指定”、两参数、排除范围和审批文字。`mcp-tools.json` 保存实际 schema。同时，[当前官方说明](https://learn.chatgpt.com/docs/mcp-server)已宣布移除旧 MCP server；本机旧版本仍有此命令。选择受控 CLI 工具，不移植旧 MCP 参考实现。 |
| 注册与隐藏         | rc.3 `ToolRuntime.register` 支持全局工具；`restrict` 是 Agent scope 的公开能力。全局注册后，在 agent 创建和每次 pre-step 检查范围，排除会话的 scope deny `codex`；工具体再次验证当前身份、标题、首消息、执行登记与归档真值。关闭时调用只返回未开启，不启动进程。未改变大肥鱼自己的工具集。                                                                                                                          |
| 超时               | `ToolDefinition.timeoutMs` 由 timeout-policy 包装器读取，没有在这里发现额外固定一分钟上限。工具声明 62 分钟，内部使用所选 1–60 分钟执行预算；审批另限一分钟。rc.3 的执行包装把原取消信号融合回来，并等待工具体安静结束。                                                                                                                                                                                            |
| 进度               | 公共 `ToolRunContext.deferContext` 在结果后才进入对话，不是实时进度流。保留原生待执行卡片，面板显示 running；从 JSON 只提取简短命令活动供可选回调，不伪造 assistant stream，也不把完整 reasoning 返给 DeepSeek。                                                                                                                                                                                                    |
| 审批               | 使用公开 `ApprovalService.request`，包括 agent、callId、可读 reason 和派生 signal。仅 `allowed-once` 才启动；拒绝、取消、无人回答和超时不启动。reason 是模式、固定目录、脱敏任务前 300 字，没有内部追踪键。C13 日常自动审批不处理 codex。                                                                                                                                                                           |

官方 [非交互 CLI 说明](https://learn.chatgpt.com/docs/non-interactive-mode)用于核对 JSONL、最终消息文件和 resume；具体可用参数与实际格式以本机 help 和探针为准。没有调用 OpenAI Platform API，也没有要求 API Key。

## Windows 探针与调用预算

所有真实 Codex 都在 `.dsh-dev/p20-probe/fixture/` 虚构 Git 仓库中进行。命令使用 `--ask-for-approval never exec --ignore-user-config --json -C <fixture> -s <mode>`，任务经 stdin；探针另外使用 `-o`。没有 bypass、danger-full-access、add-dir 或放宽权限的 `-c`，没有修改 Codex 全局配置。

| 编号 | 真实调用                 | 实际结果                                                                                                                                                                              |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | read-only 沙箱探针       | 列文件成功。目录内写、目录外但仍在虚构测试区的写入、curl 联网请求在执行前被策略拒绝。退出码 0，最终说明准确表示拒绝。                                                                 |
| 2    | workspace-write 沙箱探针 | 同样可列文件；目录内外 shell 写入和联网均被策略拒绝。没有产生目标文件。不能据此证明操作系统层的隔离边界或网络不可达。                                                                 |
| 3    | exec resume              | 使用第 2 次的确切 thread ID 恢复，返回了该对话前次探针的总结；未执行新工具。退出码 0。                                                                                                |
| 4    | Harness 只读调用         | 原生允许一次后返回顶层 README 的总结，DeepSeek 继续解释；有一次早先只读命令被策略拒绝，所以记录保留 sandbox-blocked 而非隐去中间失败。                                                |
| 5    | Harness 可写调用         | CLI 退出码 0，但 stderr 明确是 `writing is blocked by read-only sandbox; rejected by user approval settings`，最终回复也说无法修改。README 没有新增行，状态差异为空。**该验收失败。** |
| 6    | Harness 取消             | 允许后观察到 running 和 PID，再取消原轮次；记录 cancelled、退出码 1，owned process tree 结束，原生轮次结束。没有声称长时间 sleep 命令已经进入执行。                                   |

`real-call-ledger.json` 恰有 6 条。拒绝测试、关闭测试、MCP metadata、help、login status 和假 CLI 单元测试没有消耗额外真实任务调用。临时空 `CODEX_HOME` 下的 `login status` 返回 1 和 `Not logged in`；未另发未登录的 exec 请求，也未代登录。生产错误映射处理未登录、策略拒绝、超时、取消和启动失败。

前两次没有证实 Windows 是否允许跨目录写入，只证实当前执行策略先拦下了请求；未绕过后再测。可写审批卡保守提示 Windows 隔离边界尚未充分验证。`probe-*-final.txt` 保存了 `-o` 的实际中文最终消息；JSON 事件包括 thread.started、turn.started、item.started/item.completed、turn.completed。

## 实现

- `codex/runner.ts` 独立处理 spawn、环境、JSON、日志、Git 状态、并发、超时和进程树，未来执行器可复用；它不依赖 Autopilot 的任务调度。Codex 始终直接 spawn，无 shell，任务不拼进命令字符串。
- 模型只能提供 task 和 mode，严格拒绝 cwd 或其他字段。默认 read-only，任务 1–8000 字符。目录取 live session header，解析为真实目录；审批结束后再次核对目录和会话范围。
- 全局单实例只容许一个调用，待审批也占用名额。取消、超时及卸载中止本次 CLI；Windows 先读公开进程树身份，用 taskkill /T /F 结束本次 PID，再确认采集到的 PID 全部退出。没有停止日常 Codex Desktop 进程。
- 子进程环境为 PATH、用户／系统目录和临时目录等明确白名单；不继承 DSH_HOME、DEEPSEEK_API_KEY、OPENAI_API_KEY 或其他令牌。使用 Codex 自己的既有登录；没有访问其 auth 文件。忽略用户 CLI 配置，避免把用户的宽松模式、额外 MCP 或执行配置带进来。
- 每次有效尝试有摘要；包括关闭、排除、拒绝和忙碌的未启动结果。记录时间、会话、模式、脱敏目录与任务摘要、退出码、耗时、状态差异和日志路径，保留最近 100 条完成记录。JSON stdout 与 stderr 在写入自己的日志前脱敏，按行顺序写入，不把完整推理交给 DeepSeek。
- 最终回复最多 8000 字符，超出有截断标记。可写结果只给前后 porcelain 状态差异，不附文件内容。已存在脏状态不变时无法据此判断内容是否再次改变；返回和文档没有将其宣称为准确归因。
- 设置默认关闭，超时 15 分钟，范围 1–60；设置页与面板共享 SQLite 持久配置及最近摘要。开启本功能不会改变任何权限预设或 Autopilot 执行通道。

现场第 5 次暴露了仅检查 command-execution 事件会漏掉 stderr 中的拒绝：原始记录的 completed 被保留，没有改写失败历史。最终源代码已加入 stderr 拒绝识别和回归测试，今后该结果会记录为 sandbox-blocked。现场后还补齐了未启动尝试记录及完整流式日志；这些最终修正只用假 CLI 和全量工程检查复测，未借此运行第 7 次真实 Codex。

## 工程验证

| 检查         | 结果                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线         | 49 文件、1231 项全量通过。开始时只有 C13 按要求保留的未提交报告；本次没有编辑它。期间外部审查提交 `282023c` 纳入该报告和 C13B 提示词，本功能以该提交为父提交，不回退外部工作。                                    |
| 新增单元     | 使用 Node 假可执行文件，未调用真实 Codex；覆盖严格参数、限制性 argv、环境、脱敏、截断、Git 状态、策略失败、父子进程取消／超时、并发、最近 100 条、禁用和会话排除、审批拒绝及固定目录。                            |
| 完整工程门禁 | build、typecheck、format:check、git diff --check 通过；全量测试 50 文件、1255 项通过（新增 24 项）。lint 未通过：3 处文档链接指向尚未纳入 Git 的本报告，尚未在暂存后复测。实际输出见 `p20-evidence/final-*.log`。 |

## 隔离界面验收

使用 `whaledot-p02`、3182、独立 dataDir 和测试 Chromium 9497，通过 playwright-core CDP 读取 DOM、点击审批并截图。未使用浏览器控制工具，没有操作日常 profile，也没有移动系统鼠标。测试桌宠 autoStart 临时关闭；隔离配置恢复尚未执行。

| 项目               | 证据与结论                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 关闭               | `01-off.png`、`off-events.json`：DeepSeek 得到 disabled，未运行 Codex。                                                                                           |
| 只读审批及继续对话 | `read-only-approval.png`、`read-only-result.png`、`read-only-events.json`、JSON 日志与 history：可读文字、allowed-once、返回文件总结并继续对话。                  |
| 拒绝不启动         | `reject-approval.png`、`reject-result.png`、`reject-history.json`：rejected、无 pid、exitCode 为 null，没有第 5 次之前的隐藏重试。                                |
| 可写               | `write-approval.png`、`write-result.png`、`write-events.json`：原生允许，但编辑被只读策略拒绝，README 未改。真实验收没有通过。                                    |
| 取消               | `cancel-before.png`、`cancel-result.png`、`cancel-owned-pid.json`、`cancel-history.json`：运行中取消、CLI 与所采集进程树结束。假 CLI 还验证了确有孙进程时的终止。 |
| 大肥鱼排除         | `06-companion-excluded.png`、`companion-tools.json`：打开真实当前伙伴会话后读取其公开工具 schema，codex 不在列表；未发送新的伙伴模型任务。                        |
| 设置               | `settings-zh.png`、`settings-en.png`：两种文案可见，保存过 1 分钟，恢复到 15 分钟并关闭开关。                                                                     |

## 清理和已知限制

真实调用预算已耗尽，可写没有通过，不再补测。保留探针仓库、失败输出和原始记录作审查；P20 清理没有要求删除该仓库。用户要求直接给报告时，设置开关已关闭、超时已恢复 15 分钟；清理尚未完成：3182/9497 仍有隔离测试宿主／Chromium 监听，配置备份尚未恢复，未生成 `cleanup.json`。不能将清理记为完成。

本机执行策略会拒绝部分工具，包括可写编辑；Windows 操作系统层的文件／网络边界未得到独立验证。外部进程异常退出码与模型任务是否成功分别呈现；不能凭“completed”或退出码 0 证明文件被修改。当前 CLI 版本和 Windows 流程经过测试，其他平台未验收。

当前改动尚未提交。计划提交标题为 `feat: call Codex from Harness conversations`；没有创建新 Release 或推送到 GitHub。按用户最新要求直接交付本报告，停下等审查。

## 审查与可写模式修正（Claude）

**可写失败的原因有两个，都已修正：**

1. **Windows 沙箱后端被忽略。** 运行器传 `--ignore-user-config`，用户 Codex 配置中的 `[windows] sandbox = "elevated"` 随之失效。Codex 没有可用的 Windows 沙箱后端，就把所有写入拦下。修正：仍忽略整个配置文件，只读出 `[windows] sandbox` 一项，值必须是 `elevated` 或 `unelevated`，以 `-c windows.sandbox="…"` 传入。这一项只选择执行限制的后端，不放宽策略。新增测试覆盖：参数中只多这一项；其他表里的 `sandbox` 键和非法值都不会被读入。
2. **可执行文件位置不对。** 提示词指定的 `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe` 是旧安装，旁边没有 `codex-windows-sandbox-setup.exe` 等沙箱辅助程序。这是提示词的错误。修正：优先使用 `<CODEX_HOME 或 ~/.codex>\packages\standalone\current\bin\codex.exe`，它的 `codex-resources` 目录里有这些辅助程序；不存在时才回退到旧路径。

中英文使用说明补充：可改文件模式依赖 Codex 的 Windows 沙箱设置。

**真实复测**：经用户同意，用用户的 Codex 额度，在新的虚构仓库 `.dsh-dev/p20-verify/fixture` 中运行。命令行参数、可执行文件和环境变量白名单都由构建后的 `runner.js` 生成。

| 次数 | 条件                                                                            | 结果                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 只加沙箱后端，仍用旧可执行文件，默认模型                                        | 找不到 `codex-windows-sandbox-setup.exe`；随后请求管理员权限运行沙箱设置，被取消（错误 1223），README 未改                                                                                                        |
| —    | 用户指定的 `gpt-6-luna`                                                         | 服务端返回 400：ChatGPT 账号的 Codex 不支持该模型，本轮没有开始。按账号模型列表改用 `gpt-5.6-luna`                                                                                                                |
| 2    | 当前安装 + `windows.sandbox="elevated"` + `-s workspace-write` + `gpt-5.6-luna` | 退出码 0；README 末尾新增一行，`git status` 为 ` M README.md`；沙箱日志显示设置程序从 `codex-resources` 启动并完成（`errors=[]`），没有再请求管理员权限。证据：`.dsh-dev/p20-verify/events3.jsonl`、`stderr3.txt` |

第 2 次直接调用运行器的函数，没有经过 Harness 审批界面。审批、拒绝、取消和排除已由上面的界面验收覆盖。

**其余审查结论**：

- 不经过 shell 启动，参数逐个传入，任务经标准输入；
- 环境变量白名单不含 DSH 和提供方的密钥；
- 取消时结束整个进程树；
- 每次调用都要原生审批，C13 的日常自动审批不处理 `codex`；
- 不采用 MCP 的理由成立：Codex 的 MCP 工具允许模型自己指定目录和沙箱。

清理：P20 留下的测试宿主和 Chromium 已退出；隔离配置 `cordis.patch.yml` 已从 `cordis.patch.before.yml` 恢复，验收时的配置另存为 `cordis.patch.after-acceptance.yml`。

已知限制：工具不能选择 Codex 模型，使用 Codex 自己的默认模型；用户配置被忽略，所以默认是 Codex 内置的默认值，而不是用户配置里的 `gpt-6.1-sol`。
