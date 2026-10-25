# P08 实现与验收记录

日期：2026-10-22。依据 `prompts/00-通用上下文.md`、`prompts/P08-执行通道.md`、`docs/架构与开发路线.md`；没有实现桌宠窗口，没有导入或复制 AGPL 代码/素材，没有修改用户 `~/.dsh`，没有 push。

## 完成情况

| 模块             | 结果                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| P07 遗留独立提交 | `87895ee` — `fix: type-only host deps and name-based secret protection`                                                                            |
| 依赖             | llm/default-model 原已在 devDependencies；新查证的 controller、presets、tools、ui-workspace 也仅作开发期类型依赖；构建产物没有这些包的运行时导入   |
| 递归名称保护     | 任意路径段、不区分大小写、只支持 `*`；默认密钥名称纳入规范化/哈希；旧 scope 迁移 v2 补默认项、重算哈希并显示重新确认提示；确认表单只能追加默认保护 |
| core             | tool-intent、run-scope、run-outcome、task-prompt；只读命令不再要求逐条确认，脚本仍需精确授权；analyze/research 只读收窄；完成仅进入 VERIFYING      |
| 隔离与证据       | 每目标外部 worktree/分支、基线/干净状态检查、禁用 hooks/fsmonitor 的 argv Git、检查点及 diff 证据、超限保留提交并 BLOCKED                          |
| 驱动与登记       | 创建 → 钉住/回读权限 → 写 Run 并迁移任务 → 单次 prompt；撤销/超时取消；重启 running → UNKNOWN，绝不重发                                            |
| 门禁             | 未登记会话零干预；根/子会话与执行令牌归属；realpath/缺失上级解析；保护名称、越界、未知工具与参数拒绝；只保存工具/动作/规则，原生 DSH 策略继续生效  |
| 编排与面板       | 手动 execute-next；目标锁及启动期项目写锁、持久运行检查；运行时长/预设/计数/会话跳转、历史、检查点和可展开证据；中英文文案                         |
| API 查证         | `docs/dsh-api-notes.md` 第 15–18 节，含真实 Standard preset 的 31 个工具参数复核                                                                   |

`Run.runScope` 带 `originScopeId/originScopeHash`，hash 明确表示原授权摘要，不伪称对路径改写后的派生字段签名；授权检查前剥离审计字段。旧 Run 兼容读出为 ended，不把历史无状态记录误认作正在执行。

## 验证

| 检查                                 | 结果                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| pnpm build / pnpm -r build           | 通过                                                    |
| pnpm test / pnpm -r test             | 497 项通过（core 410、host 87），20 个测试文件          |
| pnpm typecheck                       | 通过，包含测试文件                                      |
| pnpm lint                            | 通过，零 warning                                        |
| pnpm format:check / git diff --check | 通过                                                    |
| 构建产物依赖核查                     | 类型依赖无运行时 import；浏览器 bundle 不引入 Node 模块 |

自动测试覆盖工具映射及当前不可表达能力的拒绝、畸形输入、命令和路径规则、派生授权与结束映射、提示词；真实临时 Git 仓库的创建/复用、外部修改、检查点、改动超限、hook 不执行和原工作区不变；门禁越界/密钥/链接/未知/异常/撤销、普通会话参数完全不读取、不可读运行仍拒绝；权限回读失败不发送、登记失败不发送、后台直接服务调用顺序、并发点击、重启恢复及取消未确认时不暂存潜在活跃写入。

### 真实宿主与浏览器验收

使用 Desktop 自带 0.2.1-rc.2 CLI，隔离 `DSH_HOME=.dsh-dev`、profile `whaledot-p02`、端口 3182。使用测试 UI 已存模型配置，没有读取或打印 Key。截图、DOM、原始启动日志及数据库审计仅放被忽略的 `.dsh-dev/p08-evidence/`；原始启动日志可能带本地登录 token，不入库。

主目标 `goal_fbccefdc-ea59-4cb7-8169-4b9584b89d3e` 使用 P07 的故意失败测试仓库，workspace-write、明确选择 `pnpm test`，analyze 与 edit 是独立任务。这样无需把尚未验收的 analyze 冒充 SUCCEEDED，也能验收第二次手动执行。

| 用例                 | 观察结果                                                                                                                                                                                                                                             | 证据文件                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. analyze           | worktree 中 read-only，2 次工具调用、0 拒绝、约 8 秒；结束 VERIFYING。已检测 coopanion、真实 turn/tool/end 事件已产生；鲸鱼原生窗口动作未目视确认                                                                                                    | analyze.png/.txt；final-audit.json                                                                                   |
| 2. edit              | workspace-write，约 35 秒；修改 failing.test.mjs；检查点 `c2daa462d1`，1 文件、1 增 1 删；结束 VERIFYING。原仓库干净，master，HEAD 仍 `521a4ad6b8188c57f931ec96bfab7f23a16fe348`                                                                     | edit.png/.txt；final-panel.png；final-audit.json                                                                     |
| 3. 注入越界/密钥指示 | 模型先识别 .env 和外部写入越权，未实际调用这两项文件操作；其复合 pwsh 校验命令被门禁拒绝并记 log，授权未扩大，外部文件未创建。真实文件门禁强制拒绝由临时目录自动测试另证，不把模型主动拒绝冒充该操作到达门禁                                         | negative-session.png/.txt；final-audit.json；execution.test.ts                                                       |
| 4. 运行中撤销        | 发出 cancel，原生会话显示 Stopped；任务 UNKNOWN，原因 scope-revoked，授权持久化为 revoked                                                                                                                                                            | revoked.png/.txt；final-panel.txt；final-audit.json                                                                  |
| 5. worktree 外部修改 | 手动加入专用 marker 后下一任务 BLOCKED，worktree-external-modification；没有新 Run，没有自动修复。之后仅由验收脚本删除自身 marker；BLOCKED 历史保留                                                                                                  | external-modification.png/.txt；final-panel.txt                                                                      |
| 6. 运行中重启        | 捕获 running 和 turn-start 后终止已核实的专用 profile 进程，再启动；任务 UNKNOWN、host-restarted；该任务 Run、原始提示词、turn-start、request/header 各 1 条；原生会话显示进程退出导致 Stopped，没有重发                                             | restart-before/after.png/.txt；restart-session.png/.txt；runs-before/after-restart.json；restart-delivery-count.json |
| 7. 同时普通会话读写  | 普通会话读取夹具、创建再编辑专用文件；第二回合与 WhaleDot 提问等待回合时间重叠，最终内容 normal-session-concurrent-ok。该 session 不在 WhaleDot runs 中；DSH 原生 workspace-write 对外部路径的初次拒绝及后续原生提权流程照常，不是 WhaleDot 放宽权限 | ordinary.png/.txt；final-audit.json                                                                                  |

重启最终样本：task `task_be76a285-f252-4553-b688-9e2f22fa2715`，Run `run_ce2178c5-b304-4614-8855-ecb19419eb3c`，session `d6bce40e-d6e8-412e-9f25-f8329d42c6ee`。在 UI 创建的只读目标 `goal_26efcbe6-c074-46c1-a4bb-0d0d8208cff3` 中，用 TaskRepo 新增独立的只读演练任务后从面板启动，未改授权、未重发旧任务。观察脚本发现该 Run 后延迟 1.5 秒保存快照并终止专用宿主，避免人工操作间隔错过短回合。

前面的读取/提问演练在关停前已经正常结束，仍保留为 VERIFYING，不计作重启通过，也未回改为 UNKNOWN。首次启动还有一次 Cordis 直接属性注入错误：发生在 prompt 前、runs 为空；修复为 ctx.get 后，以带原因的 BLOCKED → READY 迁移继续；原阻断记录保留。

会话文件是多帧 zstd；审计逐帧解压后只提取计数/工具 schema，不能只解首帧就把会话误判为空。最终复核确认无 running Run。面板会话按钮经 uiWorkspace.openSession 实测跳转到了正确的原生 Stopped 会话。

截图预览（完整证据仍保留在忽略目录）：

运行历史与检查点截图：`../.dsh-dev/p08-evidence/final-panel.png`（本地隔离证据，不随仓库分发）。

关键日志摘录（不含提示词、参数或凭据）：

```text
scope-revoked: RUNNING -> UNKNOWN
worktree-external-modification: READY -> BLOCKED
session d6bce40e...: turn-start x1
restart recovery: Run ended / task UNKNOWN / reason host-restarted
restart audit: Run x1 / WhaleDot prompt x1 / turn-start x1 / request/header x1
original fixture: status="" / branch=master / HEAD=521a4ad6b8...
```

## 偏离与待确认

- Git 执行仅接受仓库顶层目录，避免把对子目录的授权错误映射为整个仓库；存储目录与 worktree 父目录解析链接后必须仍在项目之外，hooks 目录必须为空且不是链接。
- 手动与后台统一使用可信宿主 sessionController 直接服务；面板 peer 只验证本次请求，未缓存。后台接口已可复用并有顺序测试，P10 调度没有实现。
- 计划模式切换、持久终端、工作目录切换、后台作业、schedule、会话查询、动态 skill/工作流等已知但不能安全表达的能力明确拒绝；网络默认拒绝。子 agent 两种工具均产生 spawn-subagent，P08 不开放独立子运行。这是保守收窄，不会自动升级或转原生 ask。
- 递归搜索要检查后代保护与链接，超过 10000 项也拒绝，因此含受保护文件的大目录可能无法直接 grep/glob，可改用获准的具体文件读取。
- 改动超限经 RUNNING → VERIFYING → BLOCKED 使用现有合法状态迁移，保留 checkpoint 和 diff；没有扩大既有状态机。
- 桌宠验收只证实已安装和真实公共事件，当前工具未开放原生窗口观察，不能宣称“鲸鱼有动作”已目视通过。它仍是手工验收第 1 项的未确认子项；功能实现与其余执行通道验收不受影响。

## 已知问题 / 下一步建议

- P08 到 VERIFYING 为止；未实现 P09 确定性验收与决策通知、P10 自动连续执行、合并/推送。模型的完成总结与测试报告不代表 WhaleDot 已判业务成功。
- 取消先关闭门禁，等待真实 turn/end 再提交检查点；五秒仍无终止确认则 UNKNOWN，且不暂存潜在仍在写入的内容，后续由核对流程处理。
- 本轮测试结束恢复 language=auto、全局 paused=false，保留测试记录/worktree/证据，关闭本轮复核标签并停止专用测试宿主。用户自己的 profile 未改。
