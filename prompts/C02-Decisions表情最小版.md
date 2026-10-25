# C02 鲸鱼插件：用 OpenAI Decisions API 选表情（最小版，可选功能）

**前置**：`whaledot-local` 分支工作区干净，最新提交至少包含 C11 的提交 `fix: hide archived conversations from the pet lists`，以及之前的 `c97ad54`（rc.3 兼容）、`f6d36a8`（会话名用 Harness 标题）、`e1bb4c3`（安静模式）。若工作区不干净或 C11 尚未提交，先停下说明。

**执行环境**：

- 本任务要写 `D:\dsh_plugins\dsh-coopanion`，报告和证据写在 `D:\dsh_plugins\WhaleDot`，还要能运行 Git、Chromium、Electron，并能访问 `https://api.openai.com`。
- 会话必须在开始时就具备这些权限。发现做不到，立即停下说明，不要只写一半代码。
- 本机宿主为 DSH Desktop **0.2.1-rc.3**。

### 2026-10-25 补充：C08 之后的变化

- **C09 安静模式（`options.quietMode`）**：
  - 安静模式只拦主动弹出的框；鲸鱼自己的表情不算弹框。所以安静模式下**照常**播放情绪反应，但不能借此弹出任何气泡或卡片。
  - 测试里要覆盖“安静模式开启 + 收到 reaction”的情况。
- **C10 会话名**：会话的 `label` 现在取 Harness 的会话标题，WhaleDot 自动任务会话显示为 `[WhaleDot] 目标 · 任务`。“不发送 WhaleDot 会话”的判断用 `label` 以 `[WhaleDot]` 开头即可。另外，再加一个兜底条件：第一条用户消息（`prompt` 字段）以 `WhaleDot: execute this single task` 开头的，也不发送。
- **C11 已归档会话**：已归档会话不会再产生新回复，无需特殊处理；有 `archived` 标记的会话一律不发送。
- **大肥鱼会话**：大肥鱼会话的回复照常适用本功能。大肥鱼会话的回复里可能复述你的记忆或对话回顾，所以发送规则仍然只发开头约 200 字，不放宽。
- **基线测试**：C11 已修复 `figures` 与 `inbox-receipts` 两个超时用例，`npm test` 应能在默认并发下通过。若仍有基线失败，先在基线上复现并写进报告，不改它们。

### 2026-10-23 补充：C01 之后的变化

- C06/C07 界面改版：新版 / 经典两种界面风格（`options.interfaceStyle`、`web/panel-style.js`、`web/redesign.css`）。设置项与状态文字两种风格都要显示正常。
- C08/C08F：大肥鱼专属会话（`snapshot.companionSessionId`、`companionRole`、`web/companion-session.js`）。大肥鱼会话的回复**同样适用**本功能；会话标题判断改为：WhaleDot 自动任务会话（标题以 `[WhaleDot]` 开头）不发送，大肥鱼会话照常。
- 空白草稿：快照中的会话有 `blank` 字段；空白会话不会产生回复，无需特殊处理。
- `web/pet.js` 里**已经存在** `react(mood)`、`reactionMood`、`reactionUntil`（第 240 行附近，用于点击互动与完成庆祝，第 375 行在计算 mood 时优先使用 `reactionMood`）。本任务的情绪反应必须复用这套机制或明确与之合并，不能再定义一套同名变量；若两者同时触发，以较晚的为准，任务状态（working / waiting / error）仍然优先。
- 第 2 节里的“`act(body, activeView, expression)`”以现行签名 `act(actor, pack, word, manualPreview)` 为准；“减少动态效果”以现有 `motionPreference`（`prefers-reduced-motion`）为准。
- 先跑一遍 `npm test` 与 `npm run test:inbox-ui` 确认基线通过，再开始改。

## 目标

每当一轮对话的**最终回复**确定后，可选地调用一次 OpenAI Decisions API，从鲸鱼现有的表情里选一个最贴合回复情绪的，让她做两三秒这个表情。默认关闭；任何失败都静默回退，鲸鱼行为与未开启时完全一致。

成本参考：官方定价为未缓存输入每百万 token 0.10 美元、输出不收费；每次约几百 token，日常使用每月几毛到几块钱。

## 先查证（写进回报，附出处）

1. 打开官方文档 https://developers.openai.com/api/docs/guides/decisions （及其 API reference），确认：请求地址、鉴权头、`model` 名称（文档写当前仅 `gpt-6-luna`）、`input` 与 `questions` 的**确切字段名**、`choice` 类问题的写法与返回字段（`choice`、`probabilities`、`confidence`）、错误格式。**严格按文档写请求，不要凭印象猜字段**；文档与本提示词描述冲突时以文档为准并在回报中说明。
2. 在本仓库中确认：最终回复在 host 侧何时确定（`src/model.ts` 中 `PetResult` 的生成处，以及 `src/completion.ts`）；host → 渲染页的消息如何发送（`src/bridge.ts` 的 `send`、`desktop/main.cjs` 的 `forward`、`web/pet.js` 的消息分发）；渲染页如何播放表情（`web/pet.js` 的 `act(body, activeView, word)` 与按 mood 映射表情的逻辑，约在 `render` 中 `appliedMood` 附近）；当前角色支持哪些词（`web/upstream/kit/body.js` 的 `KIT_EXPRESSIONS`，以及 body 暴露的 `words` 列表——自定义角色包可能不支持全部表情）。

## 实现

### 1. host：`src/reaction-decider.ts`（新文件）
- 触发：一个新的 `PetResult` 被确认（最终回复，不是流式中间文字）时调用一次；同一 result id 只调用一次。
- 前置条件，全部满足才调用：设置开启；环境变量 `OPENAI_API_KEY` 存在且非空；该会话标题不以 `[WhaleDot]` 开头（不把 WhaleDot 自动任务的内容发给第三方）；本小时调用次数 < 30。
- 发送内容（**隐私边界**）：只发送最终回复的开头——若第一段（到第一个空行）不超过 120 字则只发第一段，否则发前 200 个字符。**不发送**用户输入、工具调用与结果、文件内容、会话标题与路径。
- 问题：一个 `choice` 问题“这段话里说话者的情绪最接近哪一个？”，候选值为下面这组表情（与 `KIT_EXPRESSIONS` 一致的子集）：`happy`、`excited`、`love`、`shy`、`smug`、`surprised`、`thinking`、`confused`、`worried`、`sad`、`flustered`、`determined`、`neutral`。
- 结果处理：`confidence`（或文档中的等价字段）低于 0.5，或选中 `neutral` → 不做任何事。
- 网络：使用全局 `fetch`，超时 3 秒（`AbortSignal.timeout`），**不重试**；任何异常（无网络、非 2xx、字段缺失、返回值不在候选中）都只记一条不含 Key 与回复内容的诊断日志，然后放弃。
- API Key 只从环境变量读取：**不写入设置、日志、诊断报告或任何文件**；日志中出现的请求头必须脱敏。
- 成功后经 bridge 发送新消息 `{ type: 'reaction', resultId, sessionId, expression, at }`。

### 2. 渲染页：`web/pet.js`
- 收到 `reaction`：以下情况丢弃——距 `at` 超过 15 秒；对应 result 不是该会话最新的结果；当前角色不支持该表情（查 body 的 `words`）；正在拖拽/被拎起；当前 mood 为 `working`、`waiting`、`error`（任务状态优先于情绪反应）。
- 否则用现有的 `act(body, activeView, expression)` 播放，并设置 `reactionUntil = now + 2500ms`；在此期间 mood→表情的映射不得立刻把表情覆盖回去（只延后，不吞掉之后真实的状态变化：若期间 mood 变为 working/waiting/error，立即结束反应）。
- 遵守“减少动态效果”设置：开启时不播放反应。

### 3. 设置与文案
- 新增设置项「用 OpenAI 判断回复情绪（会把每条回复开头约 200 字发送给 OpenAI）」，默认**关闭**；下方状态文字：未检测到 `OPENAI_API_KEY` / 已检测到密钥（不显示任何密钥内容）/ 本次运行已调用 N 次。中英文案进现有 locale。
- `docs/usage.md` 新增一节：功能说明、隐私边界（发送什么、不发送什么、WhaleDot 会话不发送）、如何设置用户级环境变量 `OPENAI_API_KEY` 并**从开始菜单**重启 Harness、费用说明、如何关闭。

### 4. 测试
- host（mock `fetch`）：请求体只含允许的文本且长度符合规则；未开启/无 Key/WhaleDot 会话/超过每小时上限时不发请求；超时、非 2xx、非法返回、低置信度、`neutral` 均不发送 reaction；同一 result 不重复调用；日志中不出现 Key 与回复原文。
- 渲染页：过期/非最新/不支持的表情被丢弃；任务状态优先；保持 2.5 秒后恢复 mood 映射；减少动态效果时不播放。
- 补充用例：
  - 安静模式开启时照常播放反应，且不弹出任何气泡或卡片；
  - `label` 以 `[WhaleDot]` 开头、`prompt` 以 `WhaleDot: execute this single task` 开头、`archived` 为真的会话，均不发请求；
  - 大肥鱼会话照常发送，且只发开头。
- `npm test`、`npm run test:inbox-ui`、`npm run test:desktop` 全部通过。

### 5. 提交
`feat: optional OpenAI Decisions reaction for reply mood`

## 验收

**Key 的处理**：

- OpenAI API Key 由**用户本人**在测试终端里临时设置，命令为 `$env:OPENAI_API_KEY = '...'`，然后在该终端启动隔离宿主。
- 你（执行模型）不要索取、读取、打印或记录 Key 的值。
- 用户暂时没有 Key 时，完成验收 1、3 和全部自动测试，把验收 2 标为“待用户提供 Key”，不要伪造 API 返回。

**验收步骤**：

1. 不设置 Key 或不开启开关：行为与之前完全一致，包括测试结果。
2. 在 WhaleDot 隔离测试环境中开启开关：
   - 环境要求：profile `whaledot-p02`；启动命令 `$env:DSH_PET_TEST_DEBUG_PORT='9498'; & .\scripts\dev-host.ps1 -UseUiKey`；测试鲸鱼使用 `DSH_PET_TEST_DATA_DIR`。
   - 让模型回复几条情绪明显不同的消息，例如庆祝修好 bug、报告失败、提出疑问。
   - 记录每次 API 返回的表情、置信度和耗时，截图鲸鱼表情。
   - 再开启安静模式重复一次，确认只做表情、不弹框。
3. WhaleDot 自动任务会话（`[WhaleDot]` 开头）不产生任何 API 请求，贴出请求计数。
4. 请用户目视确认：鲸鱼在回复出现后做出的表情是否与内容相符、是否会和任务状态动画冲突。
5. 清理：停止测试宿主与测试鲸鱼，3182 / 9498 无监听；关闭测试终端，让临时 Key 一起失效；不在日常 profile 测试。

报告写到 `D:\dsh_plugins\WhaleDot\docs\coopanion\c02-report.md`（prettier 格式），证据放 `D:\dsh_plugins\WhaleDot\.dsh-dev\c02-evidence\`。证据中不得出现 Key。报告不要提交进 coopanion 仓库。完成后停下，等审查。

## 不做
- 不做多档判断来源、不对外开放表情接口、不判断动作（motion）、不分析用户输入；不调用 Decisions 以外的 OpenAI 接口。
