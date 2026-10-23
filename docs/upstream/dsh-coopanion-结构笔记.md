# dsh-coopanion 结构笔记（为本地扩展准备）

> 源码：`D:\dsh_plugins\dsh-coopanion`（克隆自 https://github.com/takboo/dsh-coopanion ，`v0.4.13` / `a5f5408`）。
> 许可：AGPL-3.0-or-later；`web/upstream/whale/` 贴图另有权利声明（见其 `THIRD_PARTY_NOTICES.md`）。
> 本地修改仅自用时无额外义务；公开分发修改版须以 AGPL 开源并保留声明。**修改代码放在该仓库，不放进 WhaleDot（MIT）。**
> 读取日期：2026-10-23。上游更新频繁，动手前先 `git pull` 并核对行号。

## 1. 工程信息

| 项       | 值                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| 包管理   | **npm**（`npm-shrinkwrap.json`，`packageManager: npm@11.19.1`），不是 pnpm                                            |
| Node     | `.node-version` 为 24.21.0                                                                                            |
| 宿主兼容 | `engines.dsh`: `0.2.0-rc.2 \|\| 0.2.1-alpha.1 \|\| 0.2.1-rc.1 \|\| 0.2.1-rc.2`                                        |
| 构建     | `npm run build`（`scripts/build.mjs`），产物 `dist/`                                                                  |
| 测试     | `npm test`（vitest + node --test）；改回复/收件箱/字号/多屏/NPC 要跑 `npm run test:inbox-ui`；原生窗口 `test:desktop` |
| 贡献约定 | 先读 `AGENTS.md` 与 `docs/README.md`，按任务读对应契约文档；产品行为变更需同步实现、测试与 `docs/usage.md`            |

## 2. 三层结构与数据流

```
DSH Host 进程                         Electron 子进程                 渲染页（桌宠）
src/index.ts  ──(ctx 事件)──▶ src/model.ts (PetModel 快照)
             ──▶ src/notification-broker.ts (信封/通知)
src/bridge.ts ──(Node IPC: init/snapshot/notice/configure/control…)──▶ desktop/main.cjs
                                                     └─(webContents 'pet:update')──▶ web/pet.js
                                                     ◀─(ipcMain 'pet:action'/'pet:hit')──┘
web/pet.js ──▶ web/upstream/kit/body.js（动作/表情）+ rig.js（WebGL 网格渲染）+ whale/figure.js
```

- **host 入口** `src/index.ts`：`inject: ['agents']`；订阅 `session/event`、`agent/status`、`agent/assistant-stream`、`session/created/disposed`、`user-questions` 等；`ctx.provide('coopanion', controls)`（只有窗口 start/show/hide/stop）。
- **完成语义** `src/completion.ts`：决定一轮结束后的类别（reply / goal-progress / completed / blocked / stopped）与 mood。
- **bridge** `src/bridge.ts`：spawn Electron，`send({ type: ... })` 发消息：`init`、`snapshot`、`notice`、`notification-state`、`configure`、`control` 等。
- **主进程** `desktop/main.cjs`：`process.on('message')` 收 host 消息 → `forward()` 给渲染页；`ipcMain.on('pet:action')` 收渲染页操作。
- **渲染页** `web/pet.js`（约 1060 行）：气泡、聊天、收件箱、角色库、NPC 日常；`web/speech.js` 打字机与回复预览；`web/session-ui.js` 会话列表与收件箱的纯函数。

## 3. 三个扩展点

### 3.1 精简回答（气泡显示）

- 现状：`web/speech.js:5` `replyPreview(text, limit = 180)`——超过 180 字按句子截断，`web/pet.js:163` 使用。
- **最小改动（推荐先做）**：配合 WhaleDot 的“开场白”全局指令（`~/.dsh/AGENTS.md`），`replyPreview` 增加“若回复第一段（到第一个空行）不超过 120 字，则只预览第一段”。不调用模型，开场白完整、正文不被截一半。加设置项开关。
- **完整版（可选）**：host 在最终回复确认后用一次无工具模型调用生成角色口吻摘要（参照 WhaleDot `packages/host/src/goal-intake/model.ts` 的 `llm.stream` 用法），随 snapshot 下发；渲染页优先显示摘要、保留“展开全文”。

### 3.2 会话归档

- 会话列表来自 host 的会话恢复（`docs/session-chat-contract.md`：启动恢复最多 100 个），渲染逻辑在 `web/pet.js` / `web/session-ui.js`。
- 归档状态需持久化：参考 `src/companion-store.ts`（已有 zod 请求联合 `companionRequest` 与存储类 `CompanionStore`）或 `settings.mutate('dsh-coopanion', ...)`（`src/index.ts:61`）。
- 先查 DSH 自身是否有会话归档状态（用户的 web profile 装有 `@linxin666/dsh-session-archive`），有则跟随。

### 3.3 响应式表情（含可选 Decisions API）

- **词表**：`web/upstream/kit/body.js:84-87`
  - 表情 `KIT_EXPRESSIONS`：neutral, happy, wink, love, shy, surprised, angry, sad, sleepy, thinking, smug, pout, worried, determined, flustered, scared, excited, cry, confused
  - 动作 `KIT_MOTIONS`：stand, jump, hop, look, turn, nod, shake, spin, sit, sleep, dizzy, walk, run, wave, bow, shiver, flap, dance
  - `body.js:280-284`：动作走 `act(w)`；表情在 `busy()` 时拒绝，否则 `setExpr(w)`。
- **现有映射**：`web/pet.js:355` 按 mood 映射表情：thinking→thinking，talking/working→determined，waiting→worried，error→sad；空闲时用 NPC 情绪。
- **扩展方案**：
  1. 新 IPC 消息 `{ type: 'react', expression?, motion?, intensity, holdMs, source, id }`：host `bridge.ts` → `main.cjs forward` → `pet.js` 应用；遵守 `busy()`、最短保持时间（如 2.5 s）、过期丢弃、与 mood 映射的优先级（任务异常/等待审批优先于情绪反应）。
  2. host 新增 `ReactionEngine`，判断来源可替换：
     - ① 规则（默认）：已有 mood 映射 + 少量事件规则；
     - ② 回复首字符表情符号（零成本）：开场白若以约定 emoji 开头（🎉→excited、😟→worried、🤔→thinking、😊→happy、😢→sad、😳→flustered……），映射为表情，并从气泡文字中去掉该 emoji；
     - ③ OpenAI Decisions API（可选，默认关闭）：`POST /v1/decisions`，`model: gpt-6-luna`，choice 问题在表情/动作/强度词表中选；**只发送最终回复前 200 字或用户输入一句**，不发文件/工具输出；需单独的 OpenAI API Key（存 DSH 凭据或环境变量，不写进配置文件）；超时 1.5 s，失败回退到①。成本约 $0.10/百万输入 token，输出免费。
  3. 可选：对外 `ctx.coopanion.react(...)`，让 WhaleDot 在目标完成等时机让鲸鱼做动作（WhaleDot 只通过该公开服务调用，不引用代码）。

## 4. 本地安装方式（扩展完成后）

```powershell
cd D:\dsh_plugins\dsh-coopanion
npm ci
npm run build
# 先装进 WhaleDot 的隔离测试环境验证，再装进日常 desktop profile（替换 npm 版本）
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add link:D:\dsh_plugins\dsh-coopanion
```

命令以届时的 `dsh plugin --help` 与上游 `docs/development.md` 为准。日常 profile 中原有的 `@takboo/dsh-coopanion@0.4.13` 需要先移除，避免两个同名插件同时加载。
