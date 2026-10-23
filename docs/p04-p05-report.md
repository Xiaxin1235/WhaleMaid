# P04/P05 通知投递与智能选项

## 完成情况

实现已落地；自动检查通过。**桌宠持续显示及信封内直接操作未通过目视验收，不能标记整阶段验收完成。**

| 模块              | 结果                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10 第零部分      | 独立提交 `190e2ee`；额度只限制 execute/plan，verify/reconcile 不受当日模型额度限制；Node TAP 与 terminal spec 摘要均识别 pass/fail/skipped。取代 P10 报告中“额度用完等待次日验收”的旧行为。 |
| core/notify、i18n | 纯投递策略、跨午夜勿扰、默认 4 次/小时、静音、不催促、摘要；确定性中英短文案、清理并截断标题；固定 2–4 项推荐，历史只调顺序。                                                               |
| host/notify       | 每目标一个持久化 read-only 空闲通知 root；真实 userQuestions.ask；事务抢占、单次投递、取消/过期/版本/撤权失效、重启不重弹、手动再提醒及一小时 snooze。每次提醒都计入小时上限。              |
| 统一路由          | 面板与 inbox 共用持久化 intent、绑定与原子消费；复用 P09 resolver；checkAction ask/deny 不执行；选择、来源、结果与事件留存。同步的只读选择也会取消旧 ask。                                  |
| 数据与门禁        | SQLite migration v5 增加 notes、choices、deliveries、inbox_sessions；通知会话及其子会话全部工具拒绝；普通会话走原门禁链。                                                                   |
| 面板与 planner    | 未处理/已处理/摘要三栏、偏好、风险说明、用户说明、手动提醒、通知会话入口、只读差异；planner 结构化 DATA 附带最近 5 条用户说明，每条最多 500 个 Unicode 字符。                               |

推荐集最多两个领域动作加 snooze/open-panel；完整 P09 操作仍在目标详情中。未加入语音、多设备、自动合并或通知文案模型调用。未改用户 `.dsh`、DSH 本体、桌宠源码或素材；没有 push。

## 验证

| 检查                                                 | 结果                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm -r build`                                      | 通过                                                                                      |
| `pnpm -r test`                                       | 通过，646 项（core 507 + host 139）                                                       |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                      |
| 专用通知会话事件审计                                 | 两个 inbox 均 0 模型回合、0 request/header、0 工具调用；执行会话每次 Run 均只有一个回合。 |

最终整套测试 646 项通过。此前一轮执行测试遇到既有 5 秒超时及清理 EBUSY，另一项轮询未及时到达 BLOCKED；未放宽断言或超时，复核整套测试后通过。

真实联调：Desktop 自带 CLI，`DSH_HOME=.dsh-dev`，profile `whaledot-p02` 同装 Coopanion 0.4.13，端口 3182；P04 独立 dataDir 为 `.dsh-dev/whaledot-p04`，没有复用或改写 P10 目标数据。测试过程中临时提高通知上限到 100，结束恢复默认 4、关闭勿扰及静音。

| 手工项       | 实际证据与结论                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 决策与选项 | 真实 `not-scorable` 决策，Edge idle 通知会话显示第一人称短提问、4 项与说明；`inbox-question.png`、`retry-inbox.png`。用户确认 Edge 有选项，未确认信封内选项；桌宠显示不稳定，故仅浏览器通道通过。                                                               |
| 2 inbox 重试 | Edge 提交“再试一次”后，记录 `source=inbox, action=retry, result=succeeded`；任务 WAITING_APPROVAL→READY→RUNNING，Run 总数 2→3；自动修复额度未增加。`real-inbox-retry.json`。                                                                                    |
| 3 并发互斥   | 两个真实 Edge 页同时提交同一条“先看看差异”；面板先赢，旧 ask 被取消，另一页 Submit 在提交前消失。该通知只有一条成功选择；再次调用返回 `option-stale-or-consumed`。`live-race.json`。单测另验证两来源同时到达路由仍只调用一次 resolver。                         |
| 4 Other 文字 | 真实 Other 仅提交“先别改 utils.ts”，已持久化、choices 为空、通知未处理、任务不推进；随后 inbox 重试才开始下一 Run。面板显示该说明。生产组装函数及调度器集成测试捕获后续 planner 参数；本轮未为此强行接受缺验收任务，尚无真实下一次 planner 调用的完整输入取证。 |
| 5 勿扰       | 新决策创建后 deliveryState=held、reason=quiet-hours、无 attempt；21:45 勿扰自然结束后 8.332 秒投递一次。`dnd-window.json`、`dnd-held.json`、`dnd-ended.json`。不是模拟时钟替代真实等待。                                                                        |
| 6 完成       | 真实三阶段完成，独立测试 3 失败→0，模板“3步已验收，测试失败3→0”，Edge 有两个只读/稍后选项；`completion-inbox.png`。用户报告桌宠不可见，完成提醒的桌宠目视验收未通过。                                                                                           |
| 7 普通会话   | 新建未登记的普通会话，原生 ask_user_question 正常回答；只输出文本的 pwsh 命令正常执行；真正的一次性提升审批卡出现并选择 Reject，错误明确保持 denied，原权限仍 Workspace Write。`ordinary-question.png`、`ordinary-approval.png`。                               |

用户说明进入 planner 的生产格式（DATA 字段，作为数据而非授权或命令）：

```json
{ "userNotes": [{ "provenance": "用户补充说明（来自用户本人）", "text": "先别改 utils.ts" }] }
```

组装输入另存为 `planner-input-assembled-not-sent.txt`，明确标记未发送。

完整本地证据在 `.dsh-dev/p04-p05-evidence/`，未提交运行库、凭据或完整模型日志。截图为真实客户端，不是宠物浏览器演示。

## 偏离与待确认

- `userQuestions.ask` 的确可在 idle runtime root 上调用，接口出处与实际审计见 `dsh-api-notes.md` 第 19 节补充，没有需要回合的通道假设。
- 桌宠只短暂显示；激活窗口及设置页 Show pet 后能看见宠物，但随后不可见。用户再次确认“本来有的，现在没了”。切回 Edge 仍不显示，原因未定，不能只归因于全屏遮挡。公开设置显示 Visible，进程仍在；关闭 roaming、重新启动和明确 Show pet 均未取得稳定显示的用户确认。测试只涉及独立 profile。
- Coopanion 0.4.13 的使用说明明确：审批、提问在 Harness 中处理；信封提供“去处理”入口。因此本版无法满足“在信封内直接点选”的原提示词要求。Edge 的真实问答卡已验证，不能当作桌宠内联选项通过。
- 现有 core 对 rollback 始终要求 checkpoint-binding 审查，常规 P07 授权也不自动包括 rollback。路由因此拒绝 ask/deny，不绕过检查、不新增隐式授权；此次未验收 rollback 执行。

## 已知问题 / 下一步建议

桌宠稳定显示和第 1、6 项的用户目视确认仍是阶段验收缺口；Other→真实后续 planner 的完整入参取证也待补。WhaleDot 不重复 ask；Coopanion 自身的 pending request reminders 是独立设置（本次仍开启），不能声称已控制它的补提醒。测试目标的自主推进已关闭，待决定状态和用户说明保留；提醒偏好恢复 4 次/小时、无勿扰、未静音，语言恢复 auto。测试宿主保留在独立 P04 dataDir 供复查，原 profile 文件备份 `.dsh-dev/p04-profile-before.yml`；所有测试记录保留。不存在“已全部完成手工 1–7”的结论。

桌宠使用文档核对：本机已安装包的 `README.md`、`docs/usage.md` 与 `docs/multi-display-contract.md`；只读取文档，没有读取或改动其实现及素材。设置入口为左下角 Account menu → Settings → Desktop pet，不在 Plugins 的组件详情页。`pet-show-settings.png` 记录的是设置显示 Visible，不是桌宠稳定可见的证明。
