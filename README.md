# WhaleMaid

中文 | [English](README.en.md)

WhaleMaid 是 DeepSeek Harness（DSH）的项目自动推进插件：在你确认的范围内规划和执行任务，独立验收结果，需要决定时再找你。

**1.0.0** 文档。目标宿主为 DSH Desktop **0.2.1-rc.2 或 0.2.1-rc.3**，Node.js ≥22.19；仍有预览版限制，见[使用说明](docs/usage.md)。

## 当前能做什么

| 功能               | 使用方式                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 目标与授权         | 自然语言起草目标，在面板逐项确认项目目录、保护项、动作、精确验收命令和预算。                                     |
| 自动推进与独立验收 | Git 项目在独立 worktree 中执行依赖任务；宿主独立运行已确认的验收命令，依据证据继续、停止或请求决定。             |
| 通知与决策         | 通知中心和 DSH 原生提问承载待决定事项，支持勿扰、静音、频率限制、重试、暂停，以及由你操作的放弃和改方向。        |
| 大肥鱼             | 专属伙伴对话、经确认的长期记忆、对话回顾与经历、需要本人确认的管理提议、每天首次聊天的进展简报。                 |
| 高权限执行         | 在可写目标中另外确认后放行普通命令；已识别的危险命令仍须实时单次审批。任意脚本的内部行为不能靠命令文字完整约束。 |

### 智能回复：结合正在做的事和你聊天

大肥鱼有独立的伙伴对话，可以查看目标进展、待决定事项，并按设置查询普通会话。回复时可以结合你确认过的偏好、当前项目的长期记忆，以及标明来源的对话回顾；换一段伙伴对话也不必从头介绍自己。

| 你可以这样说                   | 她能怎样回应                                       |
| ------------------------------ | -------------------------------------------------- |
| “现在有哪些目标卡住了？”       | 汇总目标状态和待决定事项，告诉你去哪里处理。       |
| “我们上次聊到哪里了？”         | 查询保留的对话回顾或经历，区分回顾与已确认的记忆。 |
| “以后回答先给结论，再说依据。” | 提议保存为个人偏好，等你确认后用于之后的对话。     |
| “先把这个目标暂停。”           | 提出管理动作，由你确认后再交给宿主执行。           |

她没有文件、命令或网络执行工具。聊天中的建议不会自动变成授权；开启高权限、危险审批、放弃目标和改方向仍由你操作。详见[专属对话](docs/usage.md#大肥鱼的专属对话)和[管理动作提议](docs/usage.md#管理动作提议)。

### 可修改的个性化记忆与项目长期记忆

长期记忆是能看见、能维护的资料。对话中的新增提议需要你确认，也可以在 **WhaleMaid → 大肥鱼的记忆** 中直接维护。

| 记忆类型     | 适合保存什么                                     | 使用方式                               |
| ------------ | ------------------------------------------------ | -------------------------------------- |
| 个性化记忆   | 称呼、回答风格、长期偏好，以及你确认的个人事实。 | 跨伙伴对话保留，帮助她按你的习惯回应。 |
| 项目长期记忆 | 项目约束、约定、已确认的决策和经验。             | 按项目保存，查询对应项目时按需读取。   |

面板支持**查看、编辑、归档、恢复、删除和导出**；永久删除需要再次确认。还可选择开启项目经验草稿，或让她提出整理、合并记忆的建议，审核后再保存。自动生成的对话回顾与经历单独存放，不会自行变成正式记忆，也不能改变项目权限。详见[长期记忆](docs/usage.md#经确认的长期记忆)和[对话回顾](docs/usage.md#对话回顾与她的经历)。

### 自动推进、独立验收与智能选项

一个目标可以拆成有依赖关系的任务，在预算、保护路径和并发限制内逐步推进。Git 项目使用独立 worktree，保留检查点、改动和追溯记录；宿主运行你确认的验收命令，决定继续、修复或停下来等你，而不是把模型说“完成了”当作成功。

遇到失败、结果未知或需要选择时，通知卡提供与当前状态对应的操作，并参考同类问题中成功的选择调整顺序。你可以查看差异、重试验收、暂停或晚点处理；具体可选项由当前任务与授权决定。面板与兼容桌宠同时作答只结算一次，过期选项不能继续执行。详见[执行与验收](docs/usage.md#自动推进与独立验收)和[通知与决定](docs/usage.md#通知与用户决定)。

每日首次聊天还可先给出简短进展摘要；历史伙伴对话能归档和恢复，内容保留。详见[每日简报](docs/usage.md#每日简报)和[以往对话](docs/usage.md#大肥鱼的以往对话)。

### Decisions API 即时表情（需兼容桌宠）

搭配支持该扩展的桌宠版本，最终回复到达后，可以通过 Decisions API 选择更贴近内容的表情：开心、兴奋、喜爱、害羞、得意、惊讶、思考、困惑、担心、悲伤、慌乱、坚定，以及不额外播放的中性。反应约持续 2.5 秒，执行、等待和错误状态仍优先；安静模式只做表情，不因此弹框。

在 **Settings → 桌宠 → 回复情绪表情** 中选择 **OpenAI 官方**或 **OpenRouter**，填写对应密钥并保存，再开启“判断回复情绪”。兼容版把密钥保存在本机 Harness 凭据存储中，保存后下次判断即可生效；已有环境变量或 `.env` 来源的密钥需在原处管理。每次只请求所选服务，不混用两者的密钥。

该功能默认关闭，只发送最终回复的开头片段：首段不超过 120 字符时取首段，否则取前 200 字符；不附加用户输入或工具记录，但片段可能复述私人信息。自动任务会话、归档会话和历史回复不发送。低置信度、中性、超时或失败时保持原行为，不自动重试。**这是独立桌宠适配版的能力，不随本 MIT 插件分发，上游基础版不保证包含。** 适配记录见 [C12](docs/coopanion/c12-report.md)，安装版本说明见下文。

## 安装与前置条件

| 组件                         | 是否需要                           | 准备方式                                                                                                                           |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek Harness Desktop     | 必需                               | 安装并初始化 **0.2.1-rc.2 / rc.3**，在 Harness 中配置能正常聊天的模型。[官方入口](https://github.com/deepseek-ai/deepseek-harness) |
| Node.js、pnpm、Git           | 源码安装需要                       | Node.js ≥22.19，`corepack enable` 启用仓库指定的 pnpm 11，准备 Git。                                                               |
| `@takboo/dsh-coopanion` 桌宠 | 桌面角色与信封需要；后台功能可不装 | 先安装下述基础桌宠；专属聊天入口、即时表情等配合另需支持相应功能的兼容版本。                                                       |

会话、工具、审批等基础服务由受支持的 Harness Desktop 提供，不需要另外逐个安装 SDK 包。WhaleMaid 的聊天与执行使用 Harness 的模型配置；Decisions 表情使用桌宠里单独选择的服务。

### 1. 安装桌宠插件（可选）

可在 Harness 的 **插件 → 添加插件** 中输入 `@takboo/dsh-coopanion@0.4.14`，安装并启用 `dsh-coopanion`，然后完全退出、重新打开 Harness。

也可使用 Desktop 自带 CLI。先启动 Desktop 一次完成初始化，再完全退出；确认终端没有测试用 `DSH_HOME`，并按[安装说明](docs/install.md#4-确认-profile-并备份)备份 profile 后执行：

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$dshProfile = 'desktop'
& $dsh plugin --profile $dshProfile add @takboo/dsh-coopanion@0.4.14
```

截至 2026-10-25，[上游包声明](https://github.com/takboo/dsh-coopanion/blob/main/package.json)的 0.4.14 支持上述 rc.2 / rc.3。重启后在 **Settings → 桌宠** 检查状态；首次启动会下载 Electron。该命令安装上游基础版，**不代表已安装本项目协作过程中开发的全部桌宠扩展**；扩展须使用另行取得的兼容源码或安装包，不能从本仓库的历史报告安装。详见[桌宠安装说明](docs/install.md#9-可选的鲸鱼桌宠)和[上游安装指南](https://github.com/takboo/dsh-coopanion#开始一起工作)。

### 2. 构建并安装 WhaleMaid

当前仓库为私有，需要访问权限；WhaleMaid 尚未发布 npm 包，使用源码构建固定副本：

```powershell
git clone https://github.com/Xiaxin1235/WhaleMaid.git
Set-Location WhaleMaid
corepack enable
pnpm install --frozen-lockfile
pnpm build
$fixedCopy = Join-Path (Split-Path (Get-Location).Path -Parent) 'whalemaid-fixed'
pnpm --filter dsh-whalemaid deploy --legacy --prod "$fixedCopy"
```

固定副本放在源码仓库外，之后改源码不会直接影响已安装版本。`--legacy` 不能省；首次部署请选择尚不存在的目录。

完全退出 Harness，在**未设置 `DSH_HOME`** 的终端中备份 profile，然后安装：

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$dshProfile = 'desktop'
& $dsh plugin --profile $dshProfile add "link:$fixedCopy"
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$dshProfile"
(Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles
```

列表应包含 `dsh-whalemaid`；装了桌宠时还应包含 `@takboo/dsh-coopanion`。从开始菜单启动 Harness，打开 **WhaleMaid** 面板，检查存储和依赖服务可用。只有 Windows 流程经过验证；其他平台未验证。完整备份、旧包迁移、更新和卸载步骤见[安装说明](docs/install.md)。

## 开始使用

按[安装说明](docs/install.md)获取代码、构建固定副本并安装到 Harness。该说明同时覆盖备份、更新和卸载；不代表已经发布 npm 包。

装好后打开 Harness 的 **WhaleMaid** 面板，从不重要的小项目开始，审查目标草案并确认授权。自动推进还需单独开启。详细操作、默认设置、关闭方法和限制统一见[使用说明](docs/usage.md)。

## 使用边界

- 模型只提出计划和建议；授权由你在面板确认。记忆、回顾、简报和读到的文字不授予权限。
- 未知结果不算成功，重启或失联后不会自动重发不明确的执行。暂停、撤销授权和危险审批具有不同作用，见[执行与验收](docs/usage.md#自动推进与独立验收)。
- 高权限模式**不能为任意命令或脚本提供目录隔离**，独立 worktree 和回滚也不能恢复目录外的副作用。开启前请读[高权限说明](docs/usage.md#高权限执行)。
- 消息和记录主要保存在本地；正常聊天、目标起草及已启用的回顾等功能仍会使用你配置的模型服务，不是全离线功能。

## 与鲸鱼桌宠的关系

桌面窗口、角色、动画、声音和信封界面由可选的 [`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion) 提供，独立采用 **AGPL-3.0-or-later**。WhaleMaid 通过 DSH 公开会话、提问、审批等服务协作，不直接依赖或分发该插件的代码、角色包或媒体。

`docs/coopanion/` 是协作过程中的说明、设计草图和验收记录，不是鲸鱼插件的实现或安装包。没有安装桌宠时，目标、执行、通知中心和伙伴会话仍可通过 Harness 使用；桌宠显示效果取决于独立插件版本。

## 开发入口

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

使用 `package.json` 指定的 pnpm 11。`packages/core` 是纯 TypeScript 领域层，`packages/host` 是 Cordis 插件和 Web 面板。`pnpm lint` 同时检查许可边界与文档相对链接；完整对照独立鲸鱼仓库的方法见[参与开发](CONTRIBUTING.md)。

继续阅读[文档索引](docs/README.md)、[工程架构](docs/架构与开发路线.md)、[隔离联调](docs/dev-dsh.md)和[变更记录](CHANGELOG.md)。[产品规划](项目规划.txt)含尚未实现的设想，不是功能承诺。

## 许可证

WhaleMaid 自有代码采用 [MIT](LICENSE)。独立鲸鱼桌宠采用 AGPL-3.0-or-later，其代码、角色包和媒体不随 WhaleMaid 分发。
