# C08F：C08 审查修正与真实宿主验收

## 完成情况

2026-10-23 完成 C08F 五项修正和隔离 P11 宿主八步验收。产品仓库 `D:/dsh_plugins/dsh-coopanion`，分支 `whaledot-local`，提交 `627aec60dbff25dfe79afe93ac81d7aecaf90f3d`（`fix: only the current companion session is Dafeiyu`）。先提交再构建；版本保持 0.4.13；未 push、未发布。原 C08 报告和原夹具截图保留。

| 问题                    | 实现与结果                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 旧伴侣误认当前大肥鱼 | Host 下发 `companionRole: current / earlier`；Renderer 与托盘共用 `web/companion-session.js`，当前身份只取 `companionSessionId`。旧对话按普通会话排序，中英文名称区分，卡片、聊天胶囊、气泡、阅读器、信封和托盘隐藏其内部目录。                                |
| 2. 返回按钮竖排         | 新版增加横向可换整项的容器，按钮禁止文字换行和收缩；经典同步修正。两种界面 × 中英文 × 100%/125%/150% 共 12 组断言通过：高度 ≤ 1.6 倍行高、宽度大于文字宽度、处于卡片边界内。真实新版测得宽 103.6、高 32、行高 21.7、文字宽 84 CSS px；经典宽 101.6，其余相同。 |
| 3. 删除选中会话偏向伴侣 | `PetModel.remove` 恢复选择第一个剩余会话。模型测试覆盖删除工作会话后仍回退普通工作会话、删除当前伴侣后次新升为 current；UI 覆盖 last 配置下删除回退快照再双击保持工作会话。                                                                                    |
| 4. 经典转交口吻         | 当前伴侣使用要求的中英文直接对话提示和「发送 / Send」；工作会话保留原转交提示。真实经典窗口也已检查。                                                                                                                                                          |
| 5. 列表点选后的差异     | 有伴侣时选中工作会话立即打开输入框；无伴侣保持 C07 的只关闭列表行为。契约和使用说明已同步原因。回归测试不模拟同步 select 回声，确认立即发送仍使用所点选的工作会话，再可返回大肥鱼。                                                                            |

### 真实 P11 八步验收

环境为 DSH Desktop 自带 CLI 0.2.1-rc.2、Cordis 4.0.5，profile `whaledot-p02`，端口 3182；`DSH_HOME=D:/dsh_plugins/WhaleDot/.dsh-dev`、`DSH_PET_TEST_DATA_DIR=.../.dsh-dev/pet-data`。确认 profile 依赖 `@takboo/dsh-coopanion: link:D:/dsh_plugins/dsh-coopanion`，P11 已部署。以下原生截图直接来自真实 Electron 桌宠窗口；`02b` 明确是另附的真实宿主 Web 截图。没有向实际宿主注入模拟快照或模拟模型回复。

| 步骤              | 结果与证据（目录 `.dsh-dev/c08f-evidence/`）                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 冷会话双击     | 在任何 Web 打开陪伴会话之前，原生双击显示「和我聊天」、空目录；`01-cold-native.png`。                                                                                                                                                                                                                                                             |
| 2. 问「你是谁？」 | 桌宠提交一次，真实回复首段为「我是大肥鱼，一只住在你桌面上的鲸鱼女仆，也是你在 WhaleDot 项目里的伙伴。我能看能聊，但不动手。」气泡来源「大肥鱼」；`02-native-real-reply.png`。随后由 WhaleDot 面板「打开对话」进入 Web，看到同一轮问题和全文；`02b-web-same-round.png`。持久记录 seq 103 为提问、107 为回复、109 为 completed。                   |
| 3. 历史列表       | 一个置顶「大肥鱼」、两个「大肥鱼（旧对话）」；旧对话目录为空，`03-native-session-list.png`。                                                                                                                                                                                                                                                      |
| 4. 普通工作会话   | 经认证的公开 `session/create` 在虚构目录 `.dsh-dev/fixtures/c08f-work` 创建普通 standard 会话。在桌宠列表选中，提交一次「只回复收到」，真实回复「收到」且 turn/end completed。`04-native-work-back.png`、`04b-native-work-reply.png`；返回按钮单行，点击后显示「和我聊天」。持久记录 seq 9 为提问、16 为回复、18 为 completed，无测试轮工具调用。 |
| 5. 上次的会话     | 从原生右键角色设置改为 last，选工作会话、关闭、双击后仍显示该工作会话及「收到」；重新进入设置仍为 last。`05-native-last-setting.png`、`05b-native-last-reopen.png`。随后改回 companion，隔离 profile 配置文件也已核对。                                                                                                                           |
| 6. 面板开新对话   | 在真实 WhaleDot 面板点击「开一个新对话」。当前 id 从 `9a309cbd-6fc8-4ae1-9a20-37d25b52283a` 变为 `22854519-4304-4cba-aff4-29bd9328ac4c`；新会话唯一置顶且选中，原会话变为第三个旧对话。`06-native-rebuilt-list.png`、`06b-native-rebuilt-chat.png`、`native-current-identity.json`。测试鲸鱼重启后仍默认连接新会话；没有额外发送模型消息。        |
| 7. 经典界面       | 由原生角色设置切到经典，当前伴侣显示「和我聊天」「直接和我说就好，我会在这里回你。」「发送」。选择真实工作会话保留转交文案和单行返回按钮；返回当前伴侣成功。`07-classic-companion.png`、`07b-classic-work.png`。结束前恢复新版。                                                                                                                  |
| 8. 清理           | 用公开 coopanion/control stop 停止测试鲸鱼；核对本次 host PID 43640 的 `--profile whaledot-p02` 后结束。3182、9498 均无监听，Electron 桌宠主进程无残留；`cleanup.json`。此项使用进程和端口记录，不以已退出窗口截图替代。                                                                                                                          |

## 验证（命令与关键输出）

| 命令（产品仓库）                                                | 结果                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                             | exit 0，两套 TypeScript 检查通过。                                                                                                                                                                                                                                      |
| `npm run build`                                                 | exit 0，提交后构建成功。                                                                                                                                                                                                                                                |
| `npx vitest run tests/model.test.ts tests/presentation.test.js` | 35 passed。                                                                                                                                                                                                                                                             |
| `node tests/companion-session-ui.mjs`                           | 12 组 PASS。已加入 test:inbox-ui 正式链。                                                                                                                                                                                                                               |
| `npm test`                                                      | exit 0；254 passed、11 skipped；随后 Node 发布/Client 检查 11 passed、locale Client 1 passed。日志 `npm-test.log`。本轮显式将 VITEST_MAX_FORKS、VITEST_MIN_FORKS、VITEST_MAX_THREADS、VITEST_MIN_THREADS 均设为 1，以避免既有磁盘写入测试在并发时超时；未修改测试超时。 |
| `npm run test:inbox-ui`                                         | exit 0；新增 12 组、C07 polish、redesign、inbox，以及后续 Node 测试 11 + 1 + 16 + 15 全通过；日志 `inbox-ui.log`。                                                                                                                                                      |
| `npm run test:desktop`                                          | exit 0；全屏焦点、多屏真实 OS 光标、陪伴活动、NPC、诊断、信封重启、生命周期、恢复、聊天 IPC、角色导入等全部通过；日志 `desktop.log`。用户已授权本轮暂停输入。`text-scale-native.json` 绑定产品提交，系统 scaleFactor 和 Renderer dpr 均为 1.25。                        |

原生关键输出原文：

```text
Native window visibility passed: fullscreen focus retained, three top levels compared, system recovery, explicit hide and suspension.
M5 native screen measurements, controlled work areas, unplug recovery and real OS cursor/CDP clicks passed.
Native inbox receipts passed: atomic save, real process restart, continued dismissal, pending entrances and new error.
Native recovery passed: hidden and visible crashes, full Host state, no replay, stop and unload during backoff.
Native smoke passed: Electron ready handshake, isolated renderer, two-way chat IPC, host reply, notification, and clean shutdown.
```

`session-audit.json` 只读核对真实持久会话：两个测试问题各有一次 user/message，各有真实 assistant/message 和 completed；保留旧会话历史，没有重放或重试发送。构建、UI 夹具、原生回归、真实 P11 聊天分别记录，不混用证据。

WhaleDot 根目录执行 `pnpm exec prettier --write docs/coopanion/c08f-report.md`、`pnpm format:check` 均 exit 0；后者原文为 `All matched files use Prettier code style!`，记录在 `format-check.log`。

## 偏离与待确认（含对 DSH API 的假设与出处）

- 无新增 DSH API 假设。按 `docs/dsh-api-notes.md` 第 3、21–24 节及同版本参考类型，使用公开 header.agentPreset、sessionController.list、sessionQuery.observeSession、session/create；Web 导航使用现有 WhaleDot 面板的公开 openSession 行为。模型调用经桌宠现有 chat → sessionController.prompt 链路完成。
- 普通工作会话通过认证的公开 RPC 创建，真实发送仍在桌宠完成。首次创建请求缺少 Gateway 要求的外层 args，被拒绝为 `gateway/internal: Remote payload must contain exactly one plain-object args field`，补正封装后创建成功；拒绝请求没有创建或发送模型消息。
- `session/disposed` 表示 Agent/Session 分离，并非持久会话删除，未改为 remove。删除回退和当前伴侣提升由模型测试覆盖；本轮未对真实历史做破坏性删除。
- P11 验收通过 CDP 操作实际 Electron DOM、真实 Host 和真实模型；系统输入与点击穿透另由 test:desktop 在 Windows 125% 实机覆盖。12 组界面矩阵是浏览器夹具回归，未用它代替 P11 验收。
- 原 C08 报告所称「P11 尚未完全部署」与本轮查证不符；原报告保留，本轮以实际 P11 和原生证据为准。

## 需要用户目视确认的项目

本轮未取得用户对 C08F 外观的人工目视确认。已检查真实原生窗口截图，但不能据此声称用户亲眼确认桌面持续可见。可复核：新版/经典返回按钮是否舒适、旧对话名称是否清晰。此人工确认与已通过的自动化和真实模型记录分开。

## 已知问题 / 下一步建议

- 本轮没有未完成的 C08F 代码修正或八步宿主验收。只修改产品仓库的实现、测试与使用文档；报告和证据留在 WhaleDot，未迁入 AGPL 资源或实现。
- 宿主日志有 DeepSeek 账号 `/auth-api/v0/users/current` 的既有 HTTP 403/network 提示；API 模型目录加载成功，两轮实际模型回复均完成，无需改账号设置。
- 隔离环境保留新建的虚构工作会话与重建后的陪伴历史，便于追溯；默认聊天对象和界面风格均已恢复为 companion / new。本次宿主和测试鲸鱼均已停止，日常 profile 未用于测试。
