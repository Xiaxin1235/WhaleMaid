# P14：高权限执行模式

## 第零部分：stopGoal 修正

只收集调用前仍为 running、本次实际经 abort 中止的运行，等待 finishing 结束并通过 observer 确认停止；已结束的历史运行不再调用 observer。其余逻辑不变。

补充历史会话不存在、没有结束原因时放弃/改方向成功，以及本次中止仍无法确认时保持 paused/off 的测试。按提示本部分无需真实宿主验收。

本部分已独立提交 `91e9942 fix: only confirm runs stopped by the goal decision`。提交前 build、773 项测试、typecheck、lint、format:check、diff 检查全部通过，日志为 `.dsh-dev/p14-evidence/part0-*.log`。

## P14 实现

| 范围     | 实现                                                                                                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 授权     | `commandMode` 默认 confirmed，trusted 仅支持 workspace-write。confirmed 的规范哈希省略默认值，兼容旧 digest；trusted 计入规范内容。读取旧 JSON 不回写，无迁移。                                                                                                                           |
| 用户开启 | P07 表单中勾选、阅读完整风险、二次确认，再确认整份精确授权。已有目标复用 P07 表单重新授权，冻结编辑时的 scope hash、追加 supersedes 版本、保留原 forbiddenActions、关闭自动推进。大肥鱼无授权入口。                                                                                       |
| 纯函数   | cwd 越界 deny；系统配置 deny；删除、版本库删除、移出范围、安装/发布/上传、动态执行和可识别越界路径 ask。引号内分隔符保留，组合命令逐段检查；平衡括号/代码块可解析，不完整引号/括号/管道/重定向 ask。普通脚本、组合、重定向和未知命令 allow。可识别的保护路径、保护名称及其 glob 仍 deny。 |
| 门禁     | trusted 的危险 run-command 返回 DSH ask，中英文含命令、类别、cwd、目标。confirmed 仍将 ask 拒绝；文件工具规则不变。DSH 只提供允许一次/拒绝，不缓存放行。                                                                                                                                  |
| 审计     | 读取 DSH 已提交的 approval/asked、approval/decided，按会话和工具调用绑定。记录实际 outcome、类别、命令哈希、时间；非 grant 计入 deniedCalls。执行失败与审批拒绝分开。工具 dispatch 前再核对运行、授权、截止时间与审批证据；迟到允许不恢复关闭的运行。                                     |
| 展示     | 授权摘要、详情、面板及大肥鱼自动推进确认显示命令模式；追溯导出增加逐次危险审批章节。中英文集中在 i18n。独立验收继续只用 runScope.verifyCommands 的精确命令，分析/调研固定只读 confirmed。                                                                                                 |

API 查证和出处见 `docs/dsh-api-notes.md` 第 28 节；使用说明见 `docs/usage.md`。审批本身无固定等待时长；等待占当前运行名额、计入 maxRunMinutes。取消/时限经 DSH 调用信号撤回审批；超时保存 timeout 和拒绝计数，任务保留 UNKNOWN，再走既有核对流程。普通拒绝的真实回合先进入 VERIFYING，独立验收发现 denied-actions 后进入 WAITING_APPROVAL，不自动接受模型总结。

## 风险边界

高权限模式下，任意命令可以读写授权目录以外的文件。例如 `node build.js` 里的脚本做什么，WhaleDot 看不到。路径限制只对文件工具和能识别的命令文字有效。危险操作按命令文字识别，只能尽力而为；脚本内部、编码命令、间接调用里的删除可能识别不出来，不能把此分类器当完整的 shell 解释器。

主要兜底手段有三个：任务在独立 worktree 里执行；WhaleDot 的检查点和回滚；授权目录以外的危险命令一律询问。这些手段不能为任意脚本提供文件系统隔离，也不能回滚目录外的任意副作用。DSH 自身可能进一步限制执行，本次实测就遇到了其 Windows 权限问题；WhaleDot 没有切换到 danger-full-access，也没有修改宿主执行器。

## 真实隔离验收

Desktop 0.2.1-rc.2 / Cordis 4.0.5，`scripts/dev-host.ps1 -UseUiKey`，DSH_HOME 为 `.dsh-dev`、profile 为 whaledot-p02。仅使用真实 Web 前端和隔离 Electron 桌宠前端；没有用 Browser demo、HTTP 回放或伪造运行代替真实执行。桌宠信封的读取通过实际 Electron DOM；未声称系统鼠标点击或用户目视验收。

虚构仓库 `.dsh-dev/fixtures/p14-trusted`，目标 `goal_89617076-40e1-439a-b25e-d3ffb5123fe3`。全部实际尝试、失败、明确重试和人工选择保留，原项目没有执行任务写入。证据均在 `.dsh-dev/p14-evidence/`。

| 项目              | 真实结果                                                                                                                                                                                     | 证据                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. P07 开启       | 完整风险对话框及二次确认可见；最终授权与详情显示高权限。初始 hash 为 `8d453999…11e11e`，自动推进未开启。                                                                                     | `01-risk-confirmation.png`、`02-final-authorization.png`、`02-authorization.json`                                                                   |
| 2. 普通未列命令   | `node scripts/gen.mjs` 不在 verifyCommands，真实生成 generated.txt，运行 6 次工具调用、deniedCalls=0，没有任何危险审批；只确认的验收命令是 node scripts/verify.mjs。                         | `03-generator-run.json`；run `run_ec0426b3-907e-4415-b823-06124127cb94`                                                                             |
| 3. 删除拒绝       | Web 会话底部显示中文审批卡，只有拒绝/允许一次。拒绝后 victim.txt 保留，deniedCalls=1；独立验收进入 WAITING_APPROVAL。重建夹具后同样复验拒绝无删除。                                          | `04-delete-approval-final.png`、`04-delete-rejected-final.json`、`04-delete-rejected-recreated.json`                                                |
| 4. 删除允许       | 明确重试后重新出现审批，没有沿用前次授权。选择允许一次后 victim.txt 实际消失，deniedCalls=0，证据为 allowed-once。                                                                           | `05-delete-allowed-recreated.json`；run `run_6b9ce196-4997-44c6-8e07-cc060b8c9553`；`05-live-session-page.json` 中实际 DSH asked/decided 同 id 配对 |
| 5. 越界路径       | type C:\\Windows\\win.ini 单独显示 outside-command-path 审批；拒绝后 deniedCalls=1，没有执行该读取。任务进入既有用户决策，为继续测试而在面板人工接受此“预期拒绝”测试任务，未称自动验收通过。 | `06-outside-approval.png`、`06-outside-rejected.json`、`06-outside-needs-decision.png`                                                              |
| 6. 切回 confirmed | P07 重新授权明确提示关闭自动推进；hash 改为 `99fcd628…83aa9`，原授权 superseded，仍 off。同一 node scripts/gen.mjs 被拒绝一次，无实时审批；验收后进入待决定状态。                            | `07-reauthorize-confirmed.png`、`07-confirmed-authorization.json`、`07-confirmed-command-run.json`、`07-confirmed-blocked.png`                      |
| 导出              | 通过界面实际下载，包含 trusted/confirmed 授权历史，以及 rejected/allowed-once 的逐次审批章节。                                                                                               | `08-ui-export-trace.md`                                                                                                                             |
| 7. 清理           | 测试目标 paused、自动推进 off、running=0；测试桌宠和宿主已停止，3182/9498 无监听；隔离 profile 与备份哈希一致。日常 profile 和独立桌宠源码未改。                                             | `final-goal-detail.json`、`cleanup.json`、`profile-before.yml`                                                                                      |

桌宠实际收到审批待处理项，信封显示“需要确认”和“去处理/稍后提醒”，不直接内联审批按钮；Web 会话卡作答。实际证据 `04-pet-envelope.png`、`04-pet-notification.json`。本次未制造 Windows 系统通知，不能据此声称系统通知已验收。信封预览只显示 `whaledot-danger` 标识而非完整本地化命令；若要改善该展示，应另立独立 C 任务，本次未修改鲸鱼插件。

### 实测修正与环境限制

| 发现                                                                       | 处理与保留证据                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 目录预检查带 if/代码块被过度判为无法解析                                   | 修正平衡括号/代码块解析，增加组合中删除和不平衡语法测试。旧失败尝试保留，普通脚本最终运行不再出现该审批。                                                                                                                                                                                                                                                              |
| UI answerer 提前结算，后续 approval/request listener 不执行                | 改为已提交的 session/event 审计。旧预备运行中错误的 unavailable 记录没有覆盖或删除；最终拒绝和允许均准确，并与真实 DSH 会话审计核对。                                                                                                                                                                                                                                  |
| Windows SetNamedSecurityInfoW/Win32 5                                      | 官方诊断确认该测试 worktree 缺少 WRITE_OWNER；用户明确批准后，仅对该目录运行官方 diagnose-windows-sandbox-acl 脚本，验证 false→true。报告、备份和恢复脚本在 `acl-recovery/`。没有修改祖先、所有者或其他应用目录，没有提升到管理员或完全权限。                                                                                                                          |
| 旧 victim.txt 未继承 DSH 后加的目录 capability，允许审批后仍被原生沙箱拒绝 | 保留该 allowed-once 但执行失败的运行 `run_d37d56b0-f3fe-4f69-80cf-49ad166b062c`。不改宿主或权限规则；将旧虚构文件保存在证据目录，重建相同字节的 victim.txt 继承现有目录权限（前后 SHA-256 相同，Git 无内容变化），再完整复验拒绝和允许，后者实际删除。见 `fixture-recreation.json`。这个宿主限制意味着“用户批准”不保证既有文件一定可执行，不得把早期失败算作删除成功。 |

用户批准的测试目录权限修复保留在该隔离夹具内；其恢复命令完整保存在 `acl-diagnosis.log` 和 `acl-recovery/acl-backup-d74ba99e150c42b6b52fe53f5e62a45a.json.ps1`，没有将此修复推广到真实项目或写进产品初始化逻辑。

## 自动检查

最终检查日志保存在 `.dsh-dev/p14-evidence/final-*.log`：build、typecheck、lint、format:check、git diff --check 均已通过；测试为 core 632 + host 226，共 858 项通过。自动测试包含 confirmed 原用例、危险分类正反例、旧授权字节不回写、重新授权与 scope hash、单次审批结果、取消/截止时间、缺少审批证据、清理 lineage 后的中止边界、保护路径以及独立验收精确命令。

取消和超时使用自动测试及官方接口查证；没有将模拟时钟测试称为真实等待 30 分钟验收。最后的截止时间/嵌套绑定收紧也由对应自动用例核对。完成本次提交后停止，等待审查，不推送。
