# C10：会话名读取 Harness 标题

## 完成情况

在独立 AGPL 仓库 `D:\dsh_plugins\dsh-coopanion` 的 `whaledot-local` 分支实现。开始时工作区干净，基线为 `e1bb4c3 feat: quiet mode keeps new messages in the envelope`；写入、Chromium 启动、Electron 44.7.0 启动均在修改前验证。产品提交：`f6d36a8d4341a124bada958b31e48dd3776c1f93 fix: use Harness session titles as pet session names`，提交后工作区干净。未推送、未发布、未修改版本号或依赖。

| 范围     | 结果                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| 会话模型 | 最新 `session/title` 去首尾空白、按 Unicode 码点截取 64 字；标题序号防止恢复历史后被较旧事件覆盖 |
| 回退     | 无有效标题时先工作目录名，再首条非空真人消息；后续消息维持原有 `prompt` 摘要更新                 |
| 大肥鱼   | 当前与历史专属会话继续优先显示本地化角色名                                                       |
| 展示入口 | 列表、聊天、信封、阅读器、托盘继续读取同一模型；补齐两处无障碍名称的角色优先处理                 |
| 提醒     | `NotificationBroker` 通过回调读取同一会话模型的当前名称，初次提醒与后续提醒均可采用最新名称      |
| 行为边界 | 标题事件不更新排序时间、选择、未读数、完成状态；没有新增改名入口或外部请求                       |
| 文档     | 更新产品仓库 `docs/session-chat-contract.md` 和 `docs/usage.md`                                  |

产品改动仅有 9 个文件：`src/model.ts`、`src/index.ts`、`src/notification-broker.ts`、`web/pet.js`、3 个相关测试文件及上述两份文档。WhaleDot 仅提交此报告，没有复制 AGPL 产品代码。

## 验证（命令与关键输出）

所有日志、截图和参考声明位于 `D:\dsh_plugins\WhaleDot\.dsh-dev\c10-evidence\`，不提交这些本机证据。

| 检查                                        | 结果                                                                            | 证据                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 修改前环境预检                              | 两仓库可写；Chromium、Electron 可启动                                           | `preflight.json`                                                          |
| 基线 `npm test`，默认并发                   | 未通过：已有 figures 用例 5000ms 超时；另一次并发复测也触发 inbox-receipts 超时 | `baseline-test.log`、`baseline-test-repeat.log`、`baseline-test-idle.log` |
| 基线 figures 单文件                         | 6 项通过，原超时用例耗时 4003ms                                                 | `baseline-figures-alone.log`                                              |
| 基线 `npm test`，单 worker                  | 264 通过、11 跳过；后续 Node 测试 11 + 1 通过                                   | `baseline-test-one-worker.log`                                            |
| 基线 `npm run test:inbox-ui`                | 完整命令退出 0                                                                  | `baseline-inbox-ui.log`                                                   |
| 相关模型、展示、提醒测试                    | 71 项通过                                                                       | `development-tests.log`                                                   |
| 最终 `npm test`，单 worker                  | 277 通过、11 跳过；后续 Node 测试 11 + 1 通过，完整命令退出 0                   | `final-test-one-worker.log`                                               |
| 最终 `npm run test:inbox-ui`                | 完整命令退出 0，所有串联 UI 测试通过                                            | `final-inbox-ui.log`                                                      |
| 最终 `npm run test:desktop`                 | 完整命令退出 0；窗口、托盘、全屏、重启恢复、多屏、NPC、诊断与收件箱持久化均通过 | `final-desktop.log`                                                       |
| `npm run build`、`npm run typecheck`        | 均退出 0                                                                        | `final-build.log`、`final-typecheck.log`                                  |
| `git diff --check`                          | 通过                                                                            | 两仓库提交前执行                                                          |
| 报告 prettier、WhaleDot `pnpm format:check` | 通过，All matched files use Prettier code style!                                | `report-format-check.log`                                                 |

单 worker 使用临时进程环境变量 `VITEST_MAX_THREADS=1`、`VITEST_MIN_THREADS=1`、`VITEST_MAX_FORKS=1`、`VITEST_MIN_FORKS=1`，结束即清除。没有放宽测试超时、跳过额外用例或修改 figures / inbox-receipts 测试。基线和最终完整测试采用相同 worker 设置；不把它表述为默认并发测试通过。

新增测试覆盖：目录与首条消息回退、标题先于消息、消息后改名、多次改名、空白及非法标题清除、仅快照含标题的冷恢复、旧事件不覆盖新标题、WhaleDot 原样标题、Unicode 64 字截断、角色/选择/未读/排序时间不变，以及列表/托盘和提醒的共同名称来源。

### 真实隔离宿主验收

使用 `whaledot-p02`，先构建，再以 `DSH_PET_TEST_DEBUG_PORT=9498` 和 `scripts/dev-host.ps1 -UseUiKey` 启动；junction 指向本地产品仓库。进程命令行确认测试鲸鱼数据目录为 `.dsh-dev/pet-data`，未启动带测试 `DSH_HOME` 的桌面应用。启动前只读核对没有正在运行的目标执行或已启用的活动调度（`start-precheck.json`）。

使用本地 `playwright-core`：专用 Chromium 经 CDP 9497 访问带认证的真实 Web 页面 3182；真实 Electron 桌宠经 CDP 9498 读取 DOM、操作并截图。没有使用浏览器控制工具，没有注入伪造快照，没有发送模型消息。

| 验收         | 结果                                                                                              | 证据                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 冷会话标题   | 40 个主名称以 `[WhaleDot]` 开头，0 个主名称以 `WhaleDot: execute` 开头                            | `01-session-rows.json`、`01-cold-session-list.png`                    |
| Web 改名同步 | 普通会话从“测试单选题提问流程”改为“C10 实时标题同步验收”；真实桌宠列表随即显示新名                | `02-live-rename.json`、`02-harness-renamed.png`、`02-pet-renamed.png` |
| 角色名保留   | 当前“大肥鱼”1 个，历史“大肥鱼（旧对话）”8 个                                                      | `03-restored-and-roles.json`                                          |
| 恢复测试内容 | 用 Web 现有改名入口恢复普通会话原名，并等待桌宠 DOM 确认恢复                                      | `03-restored-and-roles.json`                                          |
| 清理         | 测试宿主、鲸鱼及专用 Chromium 停止；3182/9497/9498 无监听，测试进程无残留；隔离配置哈希与备份一致 | `04-cleanup.json`                                                     |

已打开并检查两张桌宠截图：列表确实可见，冷恢复与改名后均显示正确名称。列表中的“最近”副标题仍可包含旧任务提示词，这是保留 `prompt` 摘要的预期行为，不能误称整页已删除这些文本。Web 改名只追加本地会话标题事件；验收后名称已恢复，不删除历史记录。

## 偏离与待确认（含对 DSH API 的假设与出处）

安装的 Desktop 版本已核对为 **0.2.1-rc.2**。其 `app.asar` 包含该版本运行时代码与包元数据，但未包含这些包的 `.d.ts`；不能声称从安装目录直接读到了类型声明。为核对同版本公开接口，使用 `npm pack --ignore-scripts` 获取官方 npm 的 `@deepseek-ai/dsh-session-title@0.2.1-rc.2` 和 `@deepseek-ai/dsh-session-query@0.2.1-rc.2`，仅解出声明到证据目录，没有安装或修改项目依赖。原始包、版本、integrity 收据在 `reference-packages/pack.json`；安装包检查在 `reference-metadata.json`。

| 查证项                        | 结论与准确出处                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 标题事件注册                  | `D:\dsh_plugins\WhaleDot\.dsh-dev\c10-evidence\reference\dsh-session-title\index.d.ts:42` 注册 `'session/title': SessionTitleEventData`                                                            |
| 标题载荷                      | 同目录 `types.d.ts:34–40`：`title: string`、`messageSeqs: SessionSeq[]`、`source: SessionTitleSource`                                                                                              |
| `source.kind` 全部取值        | 同文件 `types.d.ts:23–32`：`fallback`、`provider`、`user`；provider 另含 provider id 与可选 model；显示逻辑不依赖来源类别                                                                          |
| 冷会话观察                    | `reference\dsh-session-query\index.d.ts:47` 的 `observeSession`；`observation.d.ts:7–19` 的 live/prepared 来源及连续、不可变 `events`                                                              |
| 冷恢复现有路径                | `D:\dsh_plugins\dsh-coopanion\src\index.ts:224–228` 将 `observed.events` 适配为 `snapshotEvents` 后传给 `model.restore`；`model.ts` 的 observe/restore/describe 读取历史标题；真实冷恢复验收已验证 |
| 实时现有路径                  | 产品 `src/index.ts:245` 的 `session/event` 调用 `model.consume`，经过 `fold` 到 `describe`；真实 Web 改名同步已验证                                                                                |
| `SessionSummary` 是否带 title | `D:\dsh_plugins\WhaleDot\.dsh-ref\0.2.1-rc.2\@deepseek-ai\dsh-api-session-controller\lib\types\types.d.ts:160–174` 没有直接 `title` 字段，不能从它初始化名称；沿用公开历史事件路径                 |
| 默认并发基线超时              | 修改前已复现；按 C10 要求保留原测试，采用相同单 worker 环境完成基线与最终全量检查                                                                                                                  |

## 需要用户目视确认的项目

本次已完成真实 Electron 的 DOM、点击、截图自动化验收，并检查截图；尚未取得用户人工目视确认。没有把截图自动化结果称作人工实机签收。本地代码提交后停下等待审查，无需继续操作日常桌宠。

## 已知问题 / 下一步建议

默认并发运行的基线超时仍保留，未在 C10 中修复。C02 仍需独立实现和验收；本次仅恢复可靠的 `[WhaleDot]` 会话名称来源，没有实现外部服务路由或过滤规则。
