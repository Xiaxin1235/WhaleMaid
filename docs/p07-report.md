# P07 目标录入与确认授权验收回报

执行日期：2026-10-22（America/Los_Angeles）。目标宿主：Desktop 0.2.1-rc.2 / Cordis 4.0.5。

## 完成情况

| 模块                        | 实现                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P06 审查遗留                | 独立提交 `25d40a2`：`fix(host): recover stale store locks and clarify scope hash semantics`；六十秒旧 reclaim 标记清理、owner 显式接管、哈希文档更正 |
| core/goal-draft.ts          | 有界 strict 草案和完整确认表单；最后一个 JSON 代码块解析；更早任务依赖、首项 analyze；确认表单优先；mergeProposedTasks 返回被拒提议                  |
| host/goal-intake/project.ts | realpath/stat、项目内路径与符号链接边界、Git/分支/干净状态；检测 pnpm/npm/yarn 常见脚本及 pytest 候选，不运行候选命令                                |
| host/goal-intake/model.ts   | 直接 DSH llm 服务一次无工具调用，读取当前新会话默认模型；不使用 gateway 会话、不重试；拒绝工具输出、异常终止及不完整流                               |
| host/goal-intake/service.ts | 异步草案 id、单在途、取消、两分钟模型超时、十分钟内存清理；手动项目事实；完整确认事务；目标详情、暂停/恢复                                           |
| store                       | 嵌套事务保存点，使目标、ScopeService.grant 与全部初始任务在一个外层事务中提交或回滚                                                                  |
| panel-api                   | draft-goal、draft-status、cancel-draft、project-facts、confirm-goal、goal-detail、set-goal-paused；沿用 owner admission，strict 请求与响应 schema    |
| client/intake.ts            | 自然语言入口、手动表单、可编辑真实字段、权限/动作勾选、默认不选命令及分类、可调限制和扩额确认、任务增删/排序/依赖、二次确认、持久化详情与撤销        |
| core/scope.ts               | 配套支持受保护路径末尾的 `.env*` 前缀；不扩展 allowedPaths 的语法或支持任意 glob                                                                     |
| 文档与语言                  | core 中英文目录；API 笔记第 14 节；core-domain 新契约与哈希说明；本报告                                                                              |

确认前所有模型文本都只是提议；默认只读、默认允许五个保守动作，不提供 network 或 expand-scope
选项。默认保护 `.git` 与 `.env*`，Host 不接受移除基础保护。非 Git 项目在 UI 和 Host 两侧都不能
选择 workspace-write。确认后目标 active，任务均 PENDING；本次未执行任务、验收命令、worktree 或调度。

## 自动验证

| 检查                | 结果 / 关键输出                                                  |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm -r build`     | core / host / 浏览器 bundle 通过                                 |
| `pnpm -r test`      | core `331 passed`，host `69 passed`，合计 400 项 / 17 个测试文件 |
| `pnpm lint`         | 通过，`eslint . --max-warnings 0`                                |
| `pnpm typecheck`    | 通过，包含测试文件                                               |
| `pnpm format:check` | 通过，`All matched files use Prettier code style!`               |
| `git diff --check`  | 通过                                                             |

测试包括：多代码块、非法 JSON、超长字段、向后/自身依赖、首任务类型、注入文本不改变授权、
重复任务及其悬空依赖提示、扩额二次确认；草案并发与过期、取消阻止后续模型请求、无模型错误；
grant 失败及成功 grant/首任务写入后的中途故障整体回滚；文件/缺失目录/越界联接拒绝；候选命令
结构夹具；非 Git 写权限、禁止命令与额外字段拒绝；所有认证方法的未认证拒绝；模型流失败、
缺失终止及工具输出拒绝，且不自动重试。P06 的迁移、锁、持久化、CAS、撤销测试保持通过。

## 手工验收 1–5

全部在仓库 `.dsh-dev` 隔离 home 中完成。正常轮次通过
`scripts/dev-host.ps1 -UseUiKey` 启动 `whaledot-p02`（3182），用测试 UI 已存的 Key。
真实草案只提交一次；未读取或输出 Key，未修改用户 `~/.dsh` profile。
无模型轮次用 Desktop 同一 CLI/profile 加临时 `--patch .dsh-dev/p07-no-model.yml`，仅把该轮
agent-default-model 的 provider/model 置空；这个覆盖没有写入用户或测试 profile 的模型设置。

| 项目            | 实际结果                                                                                                                                                                         | 证据（相对仓库）                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. 自然语言草案 | `.dsh-dev/fixtures/p07-git` 是新 Git 仓库，包含 package.json 与一个故意失败的 Node 测试；输入规划书原句，得到中文结构化草案、三个有序任务，首项 analyze；命令 pnpm test 默认不选 | `.dsh-dev/p07-evidence/draft-confirmation.png`、同名 `.txt`        |
| 2. 编辑后确认   | 修改标题为“P07 验收：最小修复测试”，验收改为两条自填标准；两次确认后详情显示这些实际值、只读授权、三个 PENDING 任务                                                              | `goal-created.png`、`goal-created.txt`                             |
| 3. 撤销并重启   | 面板暂停/恢复目标正常；撤销授权立即生效；重启后仍显示撤销，三个任务仍 PENDING                                                                                                    | `scope-revoked.png`、`revoked-after-restart.png`、对应 `.txt`      |
| 4. 未配置模型   | 临时模型覆盖为空时生成草案，明确提示“尚未选择模型，或模型服务不可用”；手动填写可编辑全部必填值并进入二次确认；测试中取消，未再创建目标                                           | `model-not-configured.png`、`manual-confirmation.png`、对应 `.txt` |
| 5. 非 Git 目录  | 使用专用临时目录，重新检查后提示“非 Git 项目暂只支持只读分析”，workspace-write option 被禁用                                                                                     | `non-git-read-only.png`、`non-git-read-only.txt`                   |

上表第 2–5 行证据均位于 `.dsh-dev/p07-evidence/`。页面较长，PNG 为实际视口截图，完整控件值
和 disabled 状态另存为 DOM 文本快照；未用静态页面或 HTTP 测试代替真实浏览器操作。

数据库只读复核保存于 `.dsh-dev/p07-evidence/store-check.json`：

| 字段                       | 值                                                    |
| -------------------------- | ----------------------------------------------------- |
| goalId                     | `goal_993b1db4-5ae1-4b06-bfc4-d9092d15aeb8`           |
| 目标状态                   | active                                                |
| 授权状态 / 预设 / 已选命令 | revoked / read-only / 空                              |
| 初始任务                   | analyze → edit → test；全部 PENDING                   |
| runs / state_transitions   | 0 / 0                                                 |
| Git 夹具复核               | `git status --porcelain` 为空，没有修改或执行夹具测试 |

测试后恢复 WhaleDot language 为原来的 auto、全局 paused 保持 false；保留已撤销测试目标供复核，
取消未提交的手动表单，关闭测试标签页并停止本轮测试宿主。原始启动日志可能含 DSH 登录 token，
只留在忽略目录；截图、DOM、数据库证据、夹具、临时覆盖均不入库。
非 Git 夹具位置记录在 `.dsh-dev/p07-nongit-path.txt`，没有读取其他项目文件。

## 偏离与待确认

| 项目           | 说明                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 工程依据       | 延续架构决定，WhaleDot 不实现桌宠，不复制或导入 AGPL 代码/素材                                                              |
| 模型来源       | 使用 DSH 当前新会话默认模型选择；面板未绑定聊天，因此不继承现有聊天的单独覆盖。API 出处及真实验证见笔记第 14 节，无臆造接口 |
| 草案通道       | 已找到直接 llm 服务，选择优先方案 (a)，不创建草案会话；只保留内存草案十分钟                                                 |
| 目录选择       | 未查证可直接复用的稳定目录选择器，按提示词允许的文本输入实现                                                                |
| 符号链接根目录 | 保守要求使用真实目录，而不是确认符号链接/联接本身；项目内授权路径跨界联接同样拒绝                                           |
| 额外认证方法   | project-facts 支持无需模型的手动表单；cancel-draft 支持明确取消，不增加领域写入口                                           |

## 已知问题 / 下一步建议

- P07 只确认计划和授权，执行仍在 P08；Git 工作区有改动会明确展示，实际执行前仍需 P08 检查与隔离。
- 候选命令仅覆盖常见 Node 脚本与 pytest 元数据；用户可补充命令，禁止类不能选。命令被确认
  也不能覆盖后续 core/DSH 原生门禁的拒绝。
- `.env*` 是项目内指定位置的文件名前缀保护，不是递归全项目 glob；额外敏感目录需在表单中加入。
- P06 旧报告中的“遗留 reclaim 需手工清理”已由本次六十秒恢复与 owner 接管入口修正；摘要只是
  一致性检测，不能阻止有本机数据库写权限的人重算它。
