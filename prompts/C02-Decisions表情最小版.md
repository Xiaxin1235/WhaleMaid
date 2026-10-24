# C02 鲸鱼插件：用 OpenAI Decisions API 选表情（最小版，可选功能）

**前置**：`whaledot-local` 分支工作区干净，最新提交至少包含 `3e9ec2d fix: hide blank Harness drafts from the conversation lists`。若工作区不干净，先停下说明。

### 本提示词写于 C01 之后，此后代码有这些变化（2026-10-23 更新）

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
- `npm test`、`npm run test:inbox-ui` 全部通过。

### 5. 提交
`feat: optional OpenAI Decisions reaction for reply mood`

## 验收
1. 不设置 Key 或不开启开关：行为与之前完全一致（含测试结果）。
2. 在 WhaleDot 隔离测试环境中（测试鲸鱼使用独立数据目录；**测试终端里的 Key 只在该终端临时设置**），开启后发几条情绪明显不同的消息让模型回复（如庆祝修好 bug、报告失败、提出疑问），记录每次 API 返回的表情与置信度、耗时。
3. `[WhaleDot]` 开头的会话不产生任何 API 请求（贴出请求计数）。
4. 请用户目视确认：鲸鱼在回复出现后做出的表情是否与内容相符、是否会和任务状态动画打架。

## 不做
- 不做多档判断来源、不对外开放表情接口、不判断动作（motion）、不分析用户输入；不调用 Decisions 以外的 OpenAI 接口。
