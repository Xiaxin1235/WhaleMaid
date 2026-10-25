# P16：以往的大肥鱼对话轮换归档

## 完成情况

在干净的 `master`（起点 `c9fd6cb`，含 P15 `4e8aebf`）实现轮换归档。当前会话保留，旧会话经 P15 处理后归档；内容不删除，可单条或全部恢复。代码、文档和报告同次本地提交，完成后停下等审查，不推送。

| 模块                   | 改动                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core companion/archive | 归档身份判定与持久拥有权合并：必须同时有 WhaleDot 记录、精确 companion preset、非派生 header、匹配的 companion 目录和 workspace 成员关系；归档审计延续超过最近二十条的拥有权        |
| host companion/archive | 串行启动整理、轮换归档和恢复；先等待既有 P15 summarize，再重新核对身份、当前会话及开关。只调用默认 archiveSession，不强停活动回合；归档报错只记录诊断，不把成功创建的新对话变为失败 |
| session / registry     | 成功创建/复用后才做列表整理；当前会话不归档，若当前已归档则恢复。历史拥有权同步用于运行门禁和隐私过滤，避免旧会话移出 previous 二十条后失去保护                                     |
| 面板 / 设置            | companion.archiveEarlier 默认 true、volatile 可持久化；显示归档数、单条恢复、二次确认全部恢复。关闭自动归档保留既有归档状态                                                         |
| 审计                   | 每次实际归档/恢复各追加一条 autopilot_events，actor=companion、sessionId、时间、动作和 succeeded 结果；已处于目标状态的不重复写事件，既有追溯导出包含这些无 goalId 的全局事件       |
| 文档                   | API 笔记第 30 节追加 P16；README 与 docs/usage.md 说明操作、桌宠差异、活动回合拒绝及恢复后的行为                                                                                    |
| 宿主版本               | 验收期间宿主由 rc.2 升至 rc.3；用户明确回复“可以直接改版本”后，engines.dsh 扩为 0.2.1-rc.2 或 0.2.1-rc.3。包发布版本仍为 0.0.0，未授予兼容豁免                                      |

没有修改鲸鱼插件、P11 人设或伙伴工具，没有使用删除会话或删除工作区接口，没有新增模型调用通道。P15 的频率、失败不重试、skip、开关等行为沿用：等待的是其正常处理结果，不为归档额外重试总结。

## 查证与方案

完整类型路径和行号见 `docs/dsh-api-notes.md` 第 30 节的 P16 补充。安装包只读代码、官方同版本 workspace 声明、原始 npm tarball 与版本收据保存在 `.dsh-dev/p16-evidence/`；不提交这些参考代码。

| 查证                              | 结论                                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| archiveSession / unarchiveSession | workspace 类型 index.d.ts:190–225。归档集是 registry 全局集合，默认分组隐藏，但成员位置和日志保留；归档清除置顶，恢复不恢复原置顶。默认拒绝仍有活动的会话，本任务不传 stopActivity                                                           |
| 工作区级接口                      | 没有工作区隐藏/归档接口；delete 仅删工作区登记、保留会话和目录，可能让会话进入未分组，不采用                                                                                                                                                 |
| sessionController.list            | rc.2 的 SessionListRequest 只有可选 cursor，没有 includeArchived。list 经 sessionQuery.listSessions 读取完整逻辑集合，再按访问准入过滤，**没有按归档集合过滤**                                                                               |
| observeSession / inspect          | 精确读取实时或持久化内容，不受归档列表筛选影响；归档后仍能读取。真实测试鲸鱼冷启动后也恢复了本轮已归档旧会话，证明不是只看到旧进程缓存                                                                                                       |
| prompt                            | 归档后可打开阅读，但模型 pre-step 被官方 ArchivedSessionGate 拒绝。真实旧会话发送探针以 blocked 结束、没有助手回复；恢复后原会话真实回复“恢复后可以聊天。”                                                                                   |
| Harness 侧栏                      | 默认排除归档；View options 的 archivedFilter 有 default/show/only，可显示全部或只看归档。本文方案使用默认侧栏，不改变用户普通会话                                                                                                            |
| 身份关系                          | WhaleDot 以自己的 companion.session 和成功归档审计证明拥有权；桌宠独立按 header.agentPreset、最近创建的伙伴以及其 companionSessionId/companionRole 投影识别角色，不读取 WhaleDot 的记录。归档不改变 header，当前仍为当前、旧会话仍为 earlier |

选择**轮换归档**。因为默认 list 仍包含归档，桌宠“大肥鱼（旧对话）”不会自动消失；直接继续聊归档旧对话会被阻止，需先从面板恢复。此差异已写进使用说明，没有以修改鲸鱼插件来绕过宿主门禁。P16 主要解决 Harness 侧栏，旧桌宠列表另属 C 任务。

## 验证

| 命令              | 结果                                     | 日志（p16-evidence 下） |
| ----------------- | ---------------------------------------- | ----------------------- |
| pnpm -r build     | 通过                                     | build.log               |
| pnpm -r test      | core 913、host 259，共 1172 项通过       | test-recursive.log      |
| pnpm test         | 46 个文件、1172 项通过；既有覆盖阈值通过 | test.log                |
| pnpm typecheck    | 通过，含测试文件                         | typecheck.log           |
| pnpm lint         | 通过，零 warning                         | lint.log                |
| pnpm format:check | 提交前通过                               | format-check.log        |
| git diff --check  | 提交前通过                               | 提交前执行              |

新增 9 项测试覆盖严格身份、未知/普通/派生/错误目录跳过、启动整理、P15 先于归档、当前不归档、新会话不归档、关闭自动归档、归档当前的恢复、逐条/全部恢复、owner 门禁与确认、重复状态不写事件、超二十条后门禁拥有权、追溯导出、归档 API 报错/不可用仍保持新会话 ready。没有放宽测试超时或跳过既有检查。

补充重复启动不重复归档的断言后，9 项相关回归再次通过（archive-regression.log）；该单独定向运行不计算既有 scope/task-state 的全局覆盖率，上表两次全量测试仍使用原覆盖配置。

## 真实隔离验收 1–5

使用 `scripts/dev-host.ps1 -UseUiKey`、whaledot-p02、3182、独立 `.dsh-dev/pet-data`、测试鲸鱼 CDP 9498。WhaleDot 数据目录为本轮独立的 `.dsh-dev/p16-evidence/data`，保留 P15 既有验收数据不动。Chromium 通过 playwright-core/CDP 9497 操作真实认证 Web，Electron 通过 CDP 操作真实桌宠；未使用浏览器控制工具、未注入模拟状态或模型回答。

先关闭自动归档，用真实桌宠聊天和现有“开一个新对话”准备两段旧伙伴对话；通过真实 Web 在同一工作区创建并聊一轮 standard 普通测试会话，命名为“P16 普通会话（必须保留）”。之后创建空白当前伙伴，记录初始状态，再开启归档并重启。空白当前草稿在未选中时遵循 Harness 原有隐藏规则，不算可见旧对话。

| 步骤          | 实际结果                                                                                                                                                                         | 证据                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 记录整理前 | 目标工作区可见 2 段旧“大肥鱼”+1 段普通会话；WhaleDot 记录另有当前空白伙伴，未归档。所有身份及工作区 id 有记录                                                                    | 01-before-startup.json、01-sidebar-rows.json、01-before-sidebar.png、fixture.json                                                                                 |
| 2. 重启整理   | rc.2 启动后两个旧伙伴归档；普通 standard 会话保留。从桌宠向当前伙伴聊“灯塔方案”，确认可用；侧栏变为 1 个当前大肥鱼+1 个普通会话                                                  | 02-startup-archived.json、02-current-usable.json、02-sidebar-rows.json、02-after-startup-sidebar.png                                                              |
| 3. 轮换与回顾 | 旧当前 94e31c30… 的真实 P15“灯塔方案”回顾先写入，然后归档；归档总数 3。向新伙伴 b9b9471c… 发消息，真实回复能说出灯塔、星河、海风三个约定；侧栏仍为新当前+普通会话                | 03-rotated-with-recall.json、03-recall-storage.json、03-rotation-recall-panel.png、03-sidebar-rows.json、03-rotation-sidebar.png、03-new-current-response.txt/png |
| 4. 恢复       | rc.3 上单条恢复后归档数 3→2，再确认全部恢复，变为 0；侧栏恢复为 4 个伙伴+1 个普通会话。归档发送探针 blocked、0 助手回复；恢复后同一旧会话 completed 并真实回复“恢复后可以聊天。” | 04-single-restored.json、04-all-restored.json、04-sidebar-rows.json、04-restored-sidebar.png、04-restored-resumed.txt/png、session-audit.json                     |
| 5. 清理       | 停止本轮宿主、测试鲸鱼和专用 Chromium；3182/9497/9498 无监听，无本轮残留进程或隔离 pet 子进程；恢复隔离配置，备份和恢复后哈希一致                                                | cleanup.json、stopped-processes.json                                                                                                                              |

普通会话 id 为 `session-79afc50f-624a-4604-a929-5cf0b6ff392a`，工作区 id 为 `f6ccf015-337e-4d48-ad6a-9244e18a4395`。最终机器核对 4 个 owned header 均仍为 whaledot-companion，普通 header 仍为 standard；普通会话和当前会话没有归档审计。实际归档 3 次、恢复 3 次，均为 actor=companion。

`03-archived-still-in-pet.json` 精确按本轮归档 id 核对三张旧会话卡均存在；不把同一隔离 DSH 里其他历史测试会话的“大肥鱼（旧对话）”总数冒充本轮数量。

生产 `exportTrace` 已对真实六条归档/恢复审计生成 `trace.md`，全部事件 id 均可见。因为本轮原本没有项目目标，清理后只在本轮数据目录用正常 store 新建一个暂停、无任务、无授权的**导出入口夹具目标**，供现有 goal trace 入口导出全局事件；归档审计本身不伪造、不改写。此项是生产导出函数验收，没有声称本轮点击了 Web 下载按钮。自动核对见 acceptance-summary.json，聊天及 blocked/completed 证据见 session-audit.json。

## 宿主升级与用户授权

启动整理及轮换验收在 rc.2 完成。中途暂停后 Desktop 已升级 rc.3，测试宿主退出；重启时日志明确拒绝仅支持 rc.2 的 WhaleDot。原失败日志 host-after.log、host-restore.log 保留，未把“插件未加载”当通过。

先只读提取新版本：workspace、api-session-controller、session-query 三个后端实现与 rc.2 逐字节一致，client-ui-workspace 有变更。向用户说明并询问隔离豁免后，用户明确答“可以直接改版本”；于是更新 engines.dsh 为 rc.2 或 rc.3，重新构建并以 rc.3 成功加载，再完成门禁、单条/全部恢复及恢复后对话验收。未使用版本豁免，也没有修改宿主本体、SDK 依赖或日常 profile。收据在 versions.json、rc3/versions.json、rc3-comparison.json、host-rc3.log。

## 偏离与待确认

- 提示词要求 API 第 30 节，但原第 30 节已是 P15，因此在同节追加 P16 补充，保留旧内容和引用。
- 现有桌宠没有独立“创建新伙伴对话”入口。本轮使用既有 WhaleDot 面板“开一个新对话”，再从桌宠向新伙伴聊天；未新增或改造鲸鱼入口。
- 归档 Web 当前打开的旧会话时，Harness 会自动切走该页面，验收回到 WhaleDot 面板再核对；没有重复创建会话。恢复回复的精确文本断言最初漏了句号，之后核对真实回复并保存，没有重复发送。
- 只整理有可靠拥有记录的会话。P16 之前已超出 previous 最近二十条且没有可靠记录的历史对话不靠名字猜认，可能需要用户从 Harness 手动归档。P16 新归档的审计保留完整拥有权，不会因二十条上限再丢失。
- 恢复不自动关闭自动归档；若开关保持开启，下次启动仍会整理，面板和使用说明已明确提示。活动回合归档被拒绝时不强停，保留新会话可用并记诊断，之后启动可再整理。
- 本轮完成真实模型、DOM、点击、截图和持久事件核对，已检查关键截图；未取得本轮人工目视签字。
- 最终只读检查发现独立 dsh-coopanion 仓库的 package.json 有 rc.3 兼容范围的外部未提交改动。本轮未编辑、提交或回退该文件，保持原样；不把该独立仓库称为干净工作区。本次提交仅包含 WhaleDot 文件。

## 已知问题 / 下一步建议

P16 完成后停下等审查。Harness 侧栏的主要堆积已解决；桌宠旧会话列表仍保留归档项、归档项的阅读/发送提示如需改版，另开 C 任务，不在本次修改鲸鱼插件。
