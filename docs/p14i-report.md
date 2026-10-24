# P14I：危险审批的可读原因

2026-10-24。继续工作时 HEAD 为 `9d6f5a2`，已有四个未提交的 P14I 源码/测试文件。本次保留原实现；仅为新增审批测试补齐 TypeScript 的 ask 分支收窄，并补充本报告和 API 笔记。没有修改命令识别、授权模型、scope hash、审批选项或鲸鱼插件。

## 实现与接口核对

| 范围        | 最终行为                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可读 reason | 使用宿主当前语言：危险类别标签、命令摘要、目标标题；命令超过 300 字符时保留前 300 字符并加省略号；不附加 UUID、目标 ID 或类别内部代码。displayReason 保留原有完整中英说明。 |
| 关联        | 以序列化的 `[sessionId, callId]` 为键；同键未决审批被替换时记录 unavailable、增加拒绝计数，旧 execution 的 guard 保持拒绝，新批准不会释放旧执行。                           |
| 无 callId   | 内部随机键保存 reason 对应；仅绑定同会话唯一匹配的可读 reason。同文案并发而无法唯一配对时不授予执行。                                                                       |
| 审计和追溯  | 仍记录 outcome、category、commandHash、at，非 grant 增加 deniedCalls；追溯原本就不导出内部 reason，本次不改导出结构。                                                       |
| 旧日志      | 旧 `whaledot-danger:<uuid>` 事件可读且安全忽略，不补配对，不据其授予新调用。                                                                                                |

本机 Desktop 0.2.1-rc.2 同版本的 `dsh-tools/lib/types/index.d.ts:216–217,282` 要求 ToolExecutionInput.callId；官方 createExecution 原样保留，serviceAsk 传入 approval.request。正常模型工具没有查到会省略 callId 的路径。`dsh-user-approval/lib/types/types.d.ts` 中独立审批服务的请求允许省略 callId，因此绕开标准 tools 管道直接调用该服务的请求可以没有编号。WhaleDot 的此分支是兼容回退，不宣称标准工具会丢编号。displayReason 的类型注释明确表示仅展示、不写入 approval 审计。详见 docs/dsh-api-notes.md 第 29 节。

## 指定的偶发超时测试

`packages/host/src/execution/execution.test.ts` 已在原有未提交改动中包含：

| 位置                                                                                       | 改动                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| real worktree reuse, checkpoint/hook suppression and exact original workspace preservation | 该单项时限由默认 5 秒改为 30000 毫秒。                                   |
| setup 的临时目录清理                                                                       | rm 使用 maxRetries=5、retryDelay=100 毫秒，对 EBUSY 等临时占用短暂重试。 |

已将该用例的函数体与 HEAD 逐字比较，全部原断言和操作不变；没有扩大其他测试的时限。新增测试覆盖双语摘要、300/301/450 字符边界、同编号跨会话、重复编号替换、无编号回退及歧义、旧事件忽略；原有允许、拒绝、取消、超时、撤销授权与缺失审计的门禁测试仍运行。

## 真实隔离验收

使用 `scripts/dev-host.ps1 -UseUiKey`，DSH_HOME 为 `.dsh-dev`，测试鲸鱼的 DSH_PET_TEST_DATA_DIR 为 `.dsh-dev/pet-data`，DSH_PET_TEST_DEBUG_PORT=9498。所有页面操作使用用户指定的 playwright-core，通过 CDP 连接测试 Chromium（9497）及真实 Electron 鲸鱼（9498）；本轮没有使用浏览器控制工具。Web 页面使用真实宿主打印的认证链接，没有关闭认证。Chromium 为已有 Playwright 专用无头浏览器，截图来自实际 DOM 渲染；桌宠为实际 Electron 前端，不是 demo 或回放。未声称人工目视或系统鼠标点击验收。

复用 P14 的虚构仓库 `.dsh-dev/fixtures/p14-trusted`；为避免旧目标与其他客户端作答混入最终闭环，新建专用目标 `goal_81c4a3db-2c0e-4ed9-8432-59759bd5b54b`（P14I 可读危险审批真实验收），通过面板明确确认 workspace-write/trusted、默认保护、精确验收命令 `node scripts/verify.mjs`。首项按产品要求为只读 README，随后创建 p14i-victim.txt，再单次请求删除；拒绝后通过面板显式重试，不让模型自行重试。自动推进已在首次拒绝后关闭，后续逐项手动执行与验收。

以下最终通过链按实际 JSON 和导出追溯核对，不以模型自述代替文件结果。两条链使用同一重建后的虚构夹具和相同 commandHash。

| 验收项       | 实际结果                                                                                                                                                                    | 证据                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 信封预览     | `pwsh: 需要确认危险操作（删除）：Remove-Item -LiteralPath p14i-victim.txt · 目标：P14I 可读危险审批真实验收`；正则核对无 UUID/whaledot-danger，截图已打开检查               | 06-pet-request-card.png、19-allow-pet-card.png、19-final-readable-preview.json                     |
| Web 完整说明 | 真实中文及英文卡均含完整命令、工作目录、目标及“只允许一次”；没有截断 displayReason                                                                                          | 06-web-approval-zh.png、09-web-approval-en.png、19-allow-web.png                                   |
| 最终拒绝     | run `run_da7bec38-801e-4d05-8b6c-326189d036bc`；rejected；deniedCalls=1；文件存在，SHA-256=e80b71cd14d3cbd65f4173abcbfcf01a545dbca32a72d575108b553a648cc96f，与重建前后一致 | 17-reject-click.json、18-final-refusal-verified.json、18-final-rejected.json                       |
| 最终允许一次 | run `run_06a98f31-d059-4629-b0c6-a285fb7124a9`；allowed-once；deniedCalls=0；文件实际不存在；后续独立验收 PASS                                                              | 19-allow-click.json、20-final-grant-verified.json、20-final-allowed.json、21-final-goal-state.json |
| 追溯导出     | 通过 Web“导出追溯报告”实际下载；危险审批章节共 5 条，最终拒绝/允许逐项对应，类别 delete、命令哈希及时间保留，未导出内部 reason                                              | 21-trace.md、21-trace-verified.json                                                                |
| 清理         | 专用目标 paused、autopilot off、running=0；测试 Chromium、宿主及鲸鱼已停止；3182/9497/9498 无监听；隔离配置与备份哈希一致                                                   | 21-final-goal-paused.png、22-cleanup.json                                                          |

## 保留的实际尝试与限制

| 尝试                   | 实际证据与处理                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上一轮中断             | 浏览器控制安全检查停止，隔离进程已关闭；interrupted-cleanup.json、interrupted-goal-state.json 保留，不算界面验收。                                                                                                                                                                                                                                              |
| 首轮复用旧 P14 目标    | generated.txt 的审批被其他客户端结算 allowed-once 并实际删除；本脚本没有点击该次批准，因此不计最终脚本闭环。用户随后确认交给脚本完成；first-run-ended.json 保留。                                                                                                                                                                                               |
| 本轮浏览器准备         | 独立 Edge 启动被自动审批拒绝（blocked by policy，未提供具体原因）；没有继续用该启动命令，改用已安装的专用测试 Chromium 经 Playwright/CDP 完成。Electron 不支持 Target.createTarget，未修改其导航限制。                                                                                                                                                          |
| 双语界面切换           | 已取得真实 Web 中文和英文完整审批截图（06-web-approval-zh.png、09-web-approval-en.png）。隔离宿主切换语言触发插件重载，等待中的运行 83b84b92 被保留为 UNKNOWN/host-restarted；没有视作删除成功。通过产品“核对”确认文件仍在、无改动后才人工重试。语言恢复中文，之后不再在未决审批期间改配置。                                                                    |
| Windows 目录预条件     | 第一次脚本 allowed-once 已审计，但原生执行在 grantWrite 报 SetNamedSecurityInfoW/Win32 5，文件未删，不能当成功。用户单独批准新测试目录的权限修复后，运行官方 diagnose-windows-sandbox-acl 工具，仅在此目录为当前用户补齐缺失的完全控制权限，WRITE_OWNER false→true；没有移除其他应用项、改所有者或父目录。验证和恢复命令在 acl-repair.log、acl-recovery/。      |
| 旧夹具没有继承运行权限 | 修复后的受限运行仍被文件权限拒绝；只读核对显示目录有 DSH S-1-4 授权而旧文件没有。按 P14 做法备份并同字节重建这一虚构文件，让它继承现有目录授权；SHA-256 前后均为 e80b71cd14d3cbd65f4173abcbfcf01a545dbca32a72d575108b553a648cc96f，Git 无内容变化。16-fixture-recreation.json、16-fixture-inheritance.json 保留。没有切换 danger-full-access 或修改宿主执行器。 |
| 模型与验收证据         | 早期删除任务有额外的 write/read 尝试，及沙箱拒绝后的提升权限请求；门禁拒绝了未知/越权调用，没有扩大授权。模型曾误称没有出现审批，与真实 UI/审计不一致；本报告采用实际文件、已提交审计及运行记录。全部失败、取消和拒绝保留，不混入最终通过链。                                                                                                                   |
| 类型检查               | 首次全量 typecheck 发现新增测试未收窄 PreToolDecision 联合类型；仅补 requireAsk/ask 分支检查，未重写生产实现。first-typecheck-failed.log 保留，修正后重跑测试与检查。                                                                                                                                                                                           |

## 最终检查与清理

| 检查                | 结果                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `pnpm -r build`     | 通过                                                                         |
| `pnpm -r test`      | core 904 + host 237，共 1141 项、42 个测试文件通过；默认并行模式，无串行参数 |
| `pnpm typecheck`    | 通过                                                                         |
| `pnpm lint`         | 通过，无警告                                                                 |
| `pnpm format:check` | 通过                                                                         |
| `git diff --check`  | 通过                                                                         |

日志为 `.dsh-dev/p14i-evidence/final-*.log`。继续本任务时原生产实现及 core 测试文件的 SHA-256 与结束时一致；execution.test.ts 仅补类型收窄以通过全量 typecheck，源文件保留核对记录为 source-preservation.json。

真实宿主验收与自动测试分开记录；取消/超时等关联边界依靠自动测试和同版本接口核对，不宣称真实等待 30 分钟。本次没有修改日常 profile、DSH 本体或鲸鱼源码，没有关闭认证、提升到管理员、切换 danger-full-access，也没有为失败运行改写 outcome 或覆盖旧证据。

用户批准的单目录权限修复保留在专用虚构工作区；恢复文件为 `acl-recovery/acl-backup-ca5fac646f7347d9b311cdfc44873f0b.json` 及同名 `.ps1`，完整恢复命令见 acl-repair.log 的 ROLLBACK 行。隔离宿主的 cordis.patch.yml 已恢复，与此项已批准、可恢复的文件权限修复分别记录。

按要求单独本地提交，不推送，完成后停下等审查。
