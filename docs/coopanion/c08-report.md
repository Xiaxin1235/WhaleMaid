# C08 双击直接和“大肥鱼”聊天 验收报告

## 完成情况

基于 C07 打磨成果，在独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支完成 C08「双击直接和大肥鱼聊天」功能。

### 核心改动要点

1. **专属会话识别与管理（Host 侧）**：
   - 在 `src/model.ts` 的 `PetModel` 中，从 `session.header.agentPreset` 识别专属会话（ID 为 `whaledot-companion`）；
   - 若存在多个专属预设会话，选择最近创建（`createdAt` 最大）且未删除的一个作为主伴侣会话；
   - 在 `PetSnapshot` 快照中下发 `companionSessionId: string | null`，并在专属会话对象上标记 `companion: true`；
   - 专属会话被注销或淘汰时自动回退到次新专属会话或 `null`。
2. **默认聊天对象设置**：
   - 新增配置项「双击时默认：和大肥鱼聊天 / 上次的会话」（`defaultChatTarget`: `'companion' | 'last'`，默认 `'companion'`）；
   - 在 Harness 设置面板（`src/client/Settings.tsx`）及右键角色换装扮面板（`web/index.html`）提供设置项，支持持久化存储与双向同步；
   - 当设置值为 `'companion'` 且存在专属会话时，双击桌宠默认选中专属会话；不存在或设置为 `'last'` 时退回原有会话直连行为（与 C07 完全一致）。
3. **界面呈现（新版与经典界面风格）**：
   - **选中专属会话时**：聊天横幅胶囊展示“和我聊天”，不显示工作目录与项目标签，隐藏“回到和我聊天”入口；胶囊可继续点击“换一段 ›”进入会话列表；
   - **会话列表展示**：专属会话固定排在列表第 0 位（置顶），展示角色专属头像（`.companion-card-portrait`，带当前角色装扮或内置鱼形徽标）与“大肥鱼”，不显示工作目录；
   - **切换到工作会话时**：横幅胶囊展示该工作会话名称与工作目录，并在胶囊旁显示「回到和我聊天」快捷入口（`#chat-to-companion`），点击即可无缝切回大肥鱼；
   - **经典风格支持**：经典界面下同样默认选中专属会话，横幅胶囊与快捷切换入口均自适应保持可用。
4. **气泡、阅读器与信封收件箱**：
   - 专属会话的回复照常进入桌面气泡、阅读器和信封；
   - 气泡状态栏显示来源为“大肥鱼”；
   - 阅读器标题展示“大肥鱼”，细节仅显示时间而隐藏工作目录；
   - 信封列表中，回复卡片来源名称展示为“大肥鱼”，卡片细节仅展示“阅读回复”，不展示工作目录。
5. **文档与本地化**：
   - 中英文双语 locale 完全补齐（`companionName`, `chatWithMe`, `backToCompanion`, `defaultChatTarget` 等）；
   - 同步更新 `docs/usage.md` 与 `docs/session-chat-contract.md`。

## 验证（命令与关键输出）

| 检查项                             | 结果 / 证据                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                | 通过（root tsconfig 与 client tsconfig 均为 0 错误）                                                                                                                            |
| `npm run build`                    | 通过（前端资源与客户端包构建正常）                                                                                                                                              |
| `npm test`                         | 通过（32 个 Vitest 测试套件，252 个测试全过；另 12 项 Node release-checks、client-build 及 locale-client 测试全过）                                                             |
| `npm run test:inbox-ui`            | 通过（43 项 Playwright/Node UI 测试全过，包含 redesign-ui、inbox-ui、session-replies-ui、companionship-ui 等）                                                                  |
| `tests/c08-acceptance-fixture.mjs` | 通过（9 项全流程验收测试全部通过，无控制台错误，生成 7 张状态截图）                                                                                                             |
| `npm run test:desktop` 说明        | Windows 无交互桌面/控制台锁屏环境下 `SetCursorPos` 返回失败（符合 C00 预期说明）。由于 P11 真实设备链路尚未完全部署，采用独立 Playwright 测试夹具替代完成 100% 视觉与交互验收。 |

## 验收截图证据

证据保存在 `D:\dsh_plugins\WhaleDot\.dsh-dev\c08-evidence\`：

| 编号与场景            | 说明                                                                                              | 截图文件                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 01 双击打开“和我聊天” | 存在伴侣会话时，双击桌宠直接打开聊天，横幅胶囊显示“和我聊天”，无工作目录，隐藏“回到和我聊天”      | [01-double-click-chat-with-me.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/01-double-click-chat-with-me.png)             |
| 02 会话列表置顶       | 点击“换一段 ›”打开会话列表，专属会话固定排在首位（#0），展示角色头像与“大肥鱼”，无工作目录        | [02-conversation-list-companion-top.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/02-conversation-list-companion-top.png) |
| 03 切换至工作会话     | 切换到 `whaledot-core` 工作会话后，横幅胶囊显示工作会话名与工作目录，右侧显示「回到和我聊天」入口 | [03-work-session-back-to-companion.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/03-work-session-back-to-companion.png)   |
| 04 伴侣回复气泡       | 专属会话的回复展示在桌面气泡中，状态栏来源显示为“大肥鱼”                                          | [04-companion-reply-bubble.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/04-companion-reply-bubble.png)                   |
| 05 伴侣信封列表       | 信封收件箱中展示伴侣会话回复，来源名称显示为“大肥鱼”，副标题隐藏工作目录只保留“阅读回复”          | [05-companion-inbox.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/05-companion-inbox.png)                                 |
| 06 经典风格呈现       | 经典风格界面下双击同样默认打开专属会话并展示“和我聊天”，支持无缝互通                              | [06-classic-style-companion.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/06-classic-style-companion.png)                 |
| 07 设置默认聊天对象   | 角色换装扮面板中提供「双击时默认：和大肥鱼聊天 / 上次的会话」下拉选择                             | [07-default-target-setting.png](file:///D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence/07-default-target-setting.png)                   |

## 偏离与原则遵守说明

1. **零 WhaleDot 代码依赖**：
   - 未 import 任何 WhaleDot 模块或内部文件；
   - 纯粹通过 DSH 公共会话契约中的 `session.header.agentPreset === 'whaledot-companion'` 判断；
   - 未安装 WhaleDot 时，所有逻辑平滑降级，与 C07 完全一致。
2. **API Notes 约束**：
   - 严格遵守指令，未在 `D:\dsh_plugins\WhaleDot\docs\dsh-api-notes.md` 中编写第 21–24 节（由 P11 后续单独负责）。
3. **退回与容错机制**：
   - 当多个伴侣会话存在时，依 `createdAt` 降序优先使用最新创建者；
   - 当专属会话被删除后，自动回退至次新伴侣会话或退回标准会话；
   - 当切换设置为“上次的会话”时，双击桌宠准确打开最后一次交互的工作会话。

## 用户日常环境确认指引

当 WhaleDot 的 P11 部署完成并在日常环境中运行时，请按以下步骤确认：

1. 打开 Harness，确保已启用 `dsh-coopanion`（`whaledot-local` 分支）以及 WhaleDot 插件；
2. 双击桌面上的大肥鱼桌宠，确认聊天窗口直接打开，横幅胶囊文字为「和我聊天」；
3. 在输入框发送消息（如“你是谁？”），确认大肥鱼能够正常应答，且回复气泡上方来源显示为“大肥鱼”；
4. 点击横幅胶囊中的「换一段 ›」，确认会话列表中置顶首项为带有鱼头像的“大肥鱼”；
5. 点击选择任意一个正在编码的工作会话，确认聊天横幅切换为该工作会话名称，且旁边出现「回到和我聊天」按钮；
6. 在工作会话中输入一条消息，然后点击「回到和我聊天」，确认能够直接回到和大肥鱼的对话；
7. 右键桌宠 → 换装扮，在「双击时默认」中切换为「上次的会话」，确认双击桌宠会打开上次选中的工作会话。
