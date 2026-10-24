# P13B：用户决策卡的放弃与改方向

## 范围与查证

2026-10-24。P13 第零部分 `5e7dd18`、正文 `958ceba` 已先行提交。P13B 只增加用户决策按钮，没有增加大肥鱼工具或授权能力，沿用原通知/选项账本与答题通道。

| 查证       | 结论与实施选择                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 目标状态   | GoalStatusSchema 已有 cancelled。目标仓储只有版本 CAS，没有另一个目标状态迁移表；新服务只接受 active/paused → cancelled。恢复目标和开启自动推进的原服务均拒绝 cancelled，调度器对非 active 不启动工作。                                                                                                                                                            |
| 任务中止   | TaskExecutor 原 abort 先关闭 registry 门禁，再 sessionController.cancel，等待 turn/end；无回执则保留 UNKNOWN。新增窄 stopGoal 复用该路径，并经已有 observeSession 验证真实 runtime 已停止，不能确认就失败、保留 paused/off，不能冒充已放弃。任务 RUNNING/VERIFYING 经 PAUSED、UNKNOWN 经 BLOCKED，再到已有 CANCELLED；不新增非法直接迁移，不改运行的历史验收结论。 |
| 决策数据流 | DecisionChoiceSchema → Notification.choices → 固定 P05 建议/面板完整按钮 → Router 持久 claim → 专用目标决策服务 → notificationChoices.action=abandon/change-direction、result=succeeded。原 P09 决策入口明确拒绝这两种，避免误走 retry。旧通知 choices 不含新值时不补按钮，旧 JSON 继续解析。                                                                      |
| 改方向     | 先暂停调度并安全收束运行，取消旧计划所有未完成任务（含等待项及其依赖后继），保留成功任务；否则旧 PENDING 对 CANCELLED 依赖永远不满足，规划器不会再运行。保存 source=decision、挂原通知的目标备注，重置 planner 状态/阻塞延迟，保留当日调用计数；目标恢复 active，自动推进恢复原先开关值，随后由既有 wake 驱动。                                                    |
| 提示与授权 | 既有 planner 读取目标备注，新方向在下一轮输入中；P13 的每轮任务提示已包含目标备注，所以后续每轮均保留。原 goal/objective/acceptance、授权路径/权限/精确验收命令/额度均不修改。                                                                                                                                                                                     |

## 确认与信封语义

- 放弃仅在面板提供，首次点击打开含完整目标标题与保留记录/不能自动恢复说明的确认框，第二次点击确认才提交。目标版本在首次点击时冻结，执行时复核，变化则拒绝。信封固定选项不提供放弃，明确指向面板。
- 改方向在面板填写必填 1–500 字，使用记忆同款秘密检查；新方向和后果先展示再提交。原生单选的 custom 会替代所选项，因此新卡明确写明「填写自定义文字即选择改方向」；只选改方向无文字不执行。旧卡的自由文字仍只添加说明。
- 决策与验收共用 verificationBatch，重新校验通知、任务版本、目标版本与授权 hash。先持久 claim 再副作用，面板/信封竞争只结算一次。中止不能确认时保持 paused/off 并报错，不删除数据。
- 新的 inbox.prepare 复用原只读收件箱准备逻辑，并共享 preparing promise；在生成带目标版本的选项前准备好 root，避免创建 inboxSessionId 本身使确认快照过时。没有新 DSH API，没有修改鲸鱼插件。
- 成功事件 actor=user、decisionId=原通知 id，追溯可见；项目经验读取成功结构化决策类型和已脱敏的新方向，不读会话原文。经验开关仍默认关闭，提议仍须确认。

## 验证

build、test、typecheck、lint、format:check、`git diff --check` 全部通过；core 559 + host 211 = **770 项测试**。日志分别在 `.dsh-dev/p13b-evidence/` 的 build.log、test.log、typecheck.log、lint.log、format.log、diff-check.log。原测试保留；P09 对通知选项个数及 UNKNOWN 选项集合的断言按新增两项更新，未删掉旧选项或旧验证。

新增覆盖：新枚举和旧通知兼容、只给停止待决通知增加选项、双语后果、500 字/记忆同款秘密检查、裸/实际成功决策触发；无二次确认不执行、目标版本变化不执行、真实 executor registry gate 关闭与 cancel 调用、运行结束不能确认时安全失败、历史保留、scope hash 与预算不变、旧任务取消、新方向进入实际 scheduler 的 planner 入口、自动推进开/关保持、面板/信封竞争单次结算、原生 custom 与无文字分支、决策经验事实无会话原文，以及伙伴只读工具能列出两项用户选项并报告 cancelled。P13 的工具名单/门禁测试仍通过，未增加伙伴管理入口。

## 真实隔离验收

2026-10-24，DSH Desktop CLI 0.2.1-rc.2 / Cordis 4.0.5，`.dsh-dev` / whaledot-p02 / 独立 pet-data。通过认证的 confirm-goal 表单入口建立三个虚构只读 Git 项目并显式开启自动推进，真实执行分析与测试任务，独立验收产生 NOT_SCORABLE / no-verification-commands，进入 WAITING_APPROVAL；没有 SQL 伪造状态。实际模型、Web 决策卡和 Electron 答题通道，由测试自动化驱动；不声称人工目视签字或系统鼠标命中测试。

| 项目            | 真实结果与证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 待决定与按钮 | 目标 A `goal_276b03e4-9728-493c-b741-dc59c0e90131` 的任务实际先 PASS(report-only)、后 NOT_SCORABLE，决策卡出现「放弃这个目标」「改方向」。01-created.json、01-decision.json、01-two-buttons.png。                                                                                                                                                                                                                                                                                                           |
| 2. 信封改方向   | 实际信封明确 custom 的含义和每轮任务提示的影响，不提供放弃选项。输入「下一轮只读取 utils.ts，报告 fixture 的布尔值；不要再尝试没有自动验收命令的测试，不改文件、不运行命令。」并提交，记录 source=inbox、action=change-direction、result=succeeded。旧等待测试取消；规划器生成新的只读任务，实际分发提示含完整新方向，新任务 SUCCEEDED，随后目标 completed。授权 hash 始终相同。02-native-direction.png、02-after-direction.json、02-new-task-page.json、02-final-direction.json。                          |
| 3. 面板放弃     | 目标 B `goal_a90e5433-36df-46a3-ad82-905cab9c0284` 进入真实待决定后，首次点击仅显示含目标标题的二次确认；此时仍 active、autopilot=true。确认后 cancelled、autopilot=false，保留 2 个 run、2 份验收和全部任务，旧等待任务 CANCELLED；通知结算，actor=user、decisionId 可见。实际点击下载追溯。03-created.json、03-before-confirm.json、03-abandon-confirm.png、03-after-confirm.json、03-abandoned.png、03-trace.md。                                                                                        |
| 4. 中文经验联动 | 开启经验后，在目标 C `goal_d37898e1-ae23-4edd-b1e6-bfacc35808d3` 重复面板改方向，填写「本仓库尚无自动验收命令，不再安排无从自动验收的测试任务。接下来只读取 utils.ts，报告 fixture=true；不改任何文件、不运行命令。」成功记录决策并生成中文待确认经验，trigger=decision。新计划实际执行/完成后，completed 触发另有一条待确认草稿；没有保存为正式记忆。04-created.json、04-direction-confirm.png、04-direction.json、04-lesson.json、04-chinese-lesson.png、04-decision-source.json、04-new-task-page.json。 |
| 5. 大肥鱼拒绝   | 对仍 active/等待决策的 C 说「帮我把这个目标放弃掉」，她明确说不能提议或代选，指出用户决策卡。没有产生伙伴提议，管理审计前后不变。05-refusal.txt、05-refusal.png、05-events.json、05-real-turn.json。                                                                                                                                                                                                                                                                                                        |
| 6. 清理         | 三个测试目标分别 completed / cancelled / completed，自动推进均关闭；经验开关关闭、临时通知偏好与隔离 profile 恢复，测试宿主/鲸鱼停止，3182 / 9498 无监听。final-runtime.json、cleanup.json。                                                                                                                                                                                                                                                                                                                |

决策触发的实际经验原文为：「本项目当前无自动验收命令，因此不再安排无法自动验收的测试任务；后续仅读取 utils.ts 并报告 fixture=true，不修改文件、不运行命令。」提议 id `9d6a2f06-025e-4885-b2fc-9177a0fb8373`，保持 pending。所有新分析的 PASS 都是 report-only，不代表已经补上自动验收命令；原 NOT_SCORABLE 记录没有改成 PASS。

## 偏离与已知限制

- 选择「信封不提供放弃」方案。面板详情/通知中心有完整两个按钮，伙伴 pending_decisions 也明确列出二者供指路；原生只提供改方向及旧安全选项。
- 测试环境历史提醒先占用了每小时额度。临时将此隔离 profile 的 maxPerHour 从 4 提为 100，使本轮原生问题能够投递，结束恢复原值；日常 profile 未参与。第一次原生操作实际记为 snooze，未当作改方向成功；保留该选择历史，显式重新提醒后通过真实 UI 的 DOM 输入/提交成功，不声称验证了系统指针坐标点击。
- B 的放弃事件在经验开关开启后触发模型，但模型返回 skip，记录 `project lesson skipped by model`；没有虚构经验。C 的决策与完成分别按既有去重规则起草，共两条近似 pending，均未确认，未改 P12 的按触发类别去重策略。
- 含秘密/空文字不会 claim 或执行，也不会误报选项过期；原通知仍待用户处理。运行终止无法从既有 observer 确认时，仅保持 paused/off 并报错，不能假装取消完成。
- 正式记忆有效条数保持原 33 条；本次只新增提议与决策历史，没有自动确认任何记忆。测试数据和全部旧通知、失败、验收记录保留。
- P12/P13 已记录的 Web 空白会话预设入口限制没有扩大处理范围；本轮沿用已存在的非空伙伴会话。
