# 给 GPT 的实现提示词

## 使用方法
每次发给 GPT：**`00-通用上下文.md` 全文 + 一个任务提示词全文**。按顺序执行，一个完成并经审查后再发下一个。

桌宠由 `@takboo/dsh-coopanion` 提供，WhaleDot 只做 Autopilot（见 `docs/架构与开发路线.md` v0.2）。

| 顺序 | 文件 | 里程碑 | 状态 |
|---|---|---|---|
| 1 | `P00-仓库脚手架.md` | M0 | ✅ 完成并审查 |
| 2 | `P01-core领域模型与状态机.md` | M0（M2 地基） | ✅ 完成并审查 |
| 3 | `P02-host插件骨架与事件桥.md` | M0 | ✅ 完成并审查 |
| 3.5 | `F01-P01P02审查修正.md` | M0 | ✅ 完成并审查 |
| 4 | `P03-WhaleDot面板骨架.md` | M0 | ✅ 完成并审查（已认证通道、中英语言设置） |
| 5 | `P06-存储层与授权范围.md` | M2 | ✅ 完成并审查 |
| 6 | `P07-目标录入与确认授权.md` | M2 | ✅ 完成并审查 |
| 7 | `P08-执行通道.md` | M2 | ✅ 完成并审查 |
| 8 | `P09-独立验收与决策.md` | M2 | ✅ 完成并审查（高危漏洞已修复并复测） |
| 9 | `P10-调度器与三阶段闭环.md` | M2 | ✅ 完成并审查 —— **M2 完成** |
| 10 | `P04-P05-通知投递与智能选项.md` | M1 | ✅ 完成并审查 |
| C01 | `C01-开场白气泡与信封内作答.md` | 鲸鱼插件 | ✅ 完成并审查 |
| C03 | `C03-全屏游戏时桌宠消失.md` | 鲸鱼插件 | ✅ 完成并审查 |
| C04 | `C04-信封点掉后重启又出现.md` | 鲸鱼插件 | ✅ 完成并审查 |
| C05 | `C05-出错时不流眼泪.md` | 鲸鱼插件 | ✅ 完成并审查 |
| C06 | `C06-界面改版.md` | 鲸鱼插件 | ✅ 完成并审查，用户已目视确认 |
| C07 | `C07-新界面打磨.md` | 鲸鱼插件 | ✅ 完成并审查 |
| P11 | `P11-大肥鱼专属会话与人设.md` | M3 | ✅ Claude 直接实现并验收（`fad5b6d`） |
| C08 | `C08-双击直接和大肥鱼聊天.md` | 鲸鱼插件 | ✅ Gemini 完成（`b419f87`），问题由 C08F 修正 |
| C08F | `C08F-C08审查修正.md` | 鲸鱼插件 | ✅ GPT 完成并审查（`627aec6`） |
| — | 桌宠列表隐藏空白草稿 | 鲸鱼插件 | ✅ Claude 直接实现（`3e9ec2d`，报告 `docs/coopanion/blank-draft-report.md`） |
| P12 | `P12-大肥鱼的长期记忆.md` | M3 | ✅ GPT 完成并审查（`8ad8a0d`、`d6e7e54`） |
| P12F | `P12F-P12审查修正.md` | M3 | ✅ GPT 完成并审查（`e3fac84`） |
| 可并行 | `C02-Decisions表情最小版.md` | 鲸鱼插件（可选功能） | 待执行（附 C00；需要 OpenAI API Key，不能用订阅账户） |
| P13 | `P13-大肥鱼提议项目管理动作.md` | M3 | ✅ GPT 完成并审查（`5e7dd18`、`958ceba`） |
| P13B | `P13B-决策卡放弃与改方向.md` | M3 | ✅ GPT 完成并审查（`188601f`），遗留 1 项见下方“待修” |
| C09 | `C09-安静模式.md` | 鲸鱼插件 | ✅ 另一模型写代码，Claude 审查、修 1 处测试并验收提交（`e1bb4c3`，报告 `docs/coopanion/c09-report.md`）；待用户目视两种界面下的开关 |
| P14 | `P14-高权限执行模式.md` | M3 | ✅ GPT 完成并审查（`91e9942`、`353851b`）；危险命令识别有漏判，P14F 修好前不要在真实项目开高权限 |
| P14F | `P14F-P14审查修正.md` | M3 | ✅ GPT 完成并审查（`5c18e29`） |
| P14G | `P14G-高权限剩余漏判.md` | M3 | ✅ GPT 完成并审查（`67263a5`） |
| P14H | `P14H-通配符保护判定.md` | M3 | ✅ GPT 完成并审查（`5c843ab`） |
| 并入 P14I | host 测试 `real worktree reuse, checkpoint/hook suppression and exact original workspace preservation` 在机器负载高时会超过默认 5 秒并报 EBUSY；审查方复跑默认并行全部通过，属负载相关的偶发超时 | M3 | 给该用例单独设更长时限，或让清理在 EBUSY 时重试；顺手做即可 |
| 已由 P14H 修复 | 高权限模式下带通配符的普通命令被直接拒绝：默认保护名称 `id_rsa*`、`id_ed25519*` 与任何 `*.xx` 理论上有交集，所以 `npx prettier --write "src/*.ts"`、`npx eslint src/*.js`、`git add *.md`、`Get-ChildItem *.log`、`copy *.txt out` 全部 deny（P14 起就有；P14G 提示词“可能命中就 deny”的写法加固了它） | M3 | 建议：通配符的字面部分明确指向保护项（如 `*.key`、`.env*`、`id_rsa*`、保护目录下的通配）才 deny；仅理论交集不 deny，普通命令放行，危险类命令仍按类别 ask |
| 已由 P14G 修复 | 高权限模式仍放行的少量命令（审查时另测 54 条，9 条 allow，其中 6 条应拦） | M3 | `forfiles /c "cmd /c del @file"`（未知包装器）、`rundll32`、`regsvr32`、`shutdown`、`Stop-Process -Force` 应归系统类；`git checkout .`、`git switch -f` 会丢弃未提交改动，应归 repository-delete；`schtasks`、`taskkill` 现在只是碰巧以 ambiguous-command-path 被问，类别应改为系统类；`npm uninstall` 可归 package-install。`npm run clean` 等看不到脚本内容属已知限制 |
| P14I | `P14I-危险审批可读原因.md` | M3 | ✅ GPT 完成并审查（`a152779`），信封显示可读原因 |
| 待查 | 桌宠会话列表里 WhaleDot 执行会话全部显示为“WhaleDot: execute this single task within the immutable authoriz…”，看不出是哪个目标 / 任务。执行器传了标题 `[WhaleDot] 目标 · 任务`，但实际显示的是提示词开头，说明标题没生效或被自动标题覆盖。这也影响 C02：它按标题以 `[WhaleDot]` 开头来排除自动任务会话，实际可能匹配不上 | M3 | 先查 DSH 创建会话时标题字段的实际行为，再决定修 WhaleDot 还是改 C02 的判断条件 |
| 原 P14I 说明 | `P14I-危险审批可读原因.md` | M3 | 待执行（附 00）：危险审批在桌宠信封只显示 `whaledot-danger` 标识。原因在 WhaleDot：DSH 只持久化 `reason`，桌宠用它做预览，所以在 WhaleDot 侧把 `reason` 改成可读，不改鲸鱼插件；顺带修下方偶发超时测试 |
| 待修 | 放弃 / 改方向会被历史运行卡死：`execution/execute-task.ts` 的 `stopGoal` 对目标下**所有**未成功任务的历史运行都要求 `observeSession` 返回 `endReason`；宿主崩溃留下的 UNKNOWN 运行或已不存在的会话没有 `turn/end`，于是永远报 `goal-stop-unconfirmed`，目标只能停在 paused | M3 | 并入 P14 第零部分（单独提交） |
| 待修 | Web 上空白大肥鱼会话首次提问时预设被切成 standard | M3 | 已知限制，目前从桌宠发起首次提问 |
| 待修 | 项目经验的“卡住”触发不生效：`lessonTrigger`（`core/src/memory/proposals.ts:47`）只认裸 reason，而 `verify-task.ts:472` 发出的通知 reason 形如 `verification-unknown: …`，真实环境永远匹配不上 | M3 | 并入 P13 第零部分（单独提交） |
| 待用户 | 日常环境安装 WhaleDot 与修改版鲸鱼，目视确认 C08F 与空白草稿 | — | 待安排 |
| 之后 | M3 断点恢复、M4 长期自治、M5 开源发布 | | 待规划 |

> 改鲸鱼插件的任务（C 系列）附 `C00-鲸鱼插件通用上下文.md`，不附 `00-通用上下文.md`。P12 与 C02 改的是不同仓库，可以同时交给两个模型。
