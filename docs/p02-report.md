# P02 实现与验收回报

## 交付

已修正 Desktop 0.2.1-rc.2 / Cordis 4.0.5 目标，增加只复制文档和声明的 Desktop 参考提取器，更新隔离联调指南。
已实现 session 事件桥、只聚合被 watch 会话的 RunTracker、Config、dataDir/status.json、可选服务探测与启动异常降级。
九项 API 查证见 [dsh-api-notes.md](dsh-api-notes.md)。本轮未实现 P03 面板、P04 通知、P08 会话创建/驱动。

| 变更              | 行为                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| session-events.ts | 按真实 `{type,seq,time,data}` 映射四类会话事件和销毁；不复制原始消息、参数、结果内容；tool/result 无工具名故省略 toolName                 |
| 结束原因          | 六种已支持原因原样保留；forked、未来值及缺失原因映射 unknown，不当作 completed                                                            |
| RunTracker        | watch/unwatch、快照、注入 Clock、计数、结束回调；销毁中断记 unknown，endSource 保留 turn-end / session-disposed；结束后重复事件不再回调   |
| 观察边界          | RunTracker 不为未登记会话保留内容或状态；debugLogSignals 默认 false，开启时仅输出窄结构信号                                               |
| status.json       | 插件版本、启动时间、gateway/commands/userQuestions 可用性；服务晚到及卸载时更新，异步写入按顺序完成；使用同目录临时文件 + rename 原子替换 |
| 宿主隔离          | 测试仅在 `.dsh-dev/profiles/whaledot-p02`；没有复制用户配置/凭据，没有向用户 profile 安装插件                                             |

实施时 P01 尚未合入，最初按 P02 允许方式使用 host 同名 Clock 接口。P01 随后已合入为
`2d1e80d`，最终对接改用 `@whaledot/core` 的 Clock 类型，host 不再重复定义。

## 自动检查

| 检查                | 实际结果                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| `pnpm build`        | 通过，core 与 host 均编译                                                  |
| `pnpm typecheck`    | 通过                                                                       |
| `pnpm test`         | 当前工作树 321 项通过（包括并行 P01 测试），其中 P02 host 为 23 项         |
| `pnpm lint`         | 最终通过；此前看到的并行 core lint 问题已由该范围工作修复，本轮未修改 core |
| `pnpm format:check` | 通过                                                                       |
| RunTracker 全分支   | host 单独运行：语句 28/28、分支 19/19、函数 8/8、行 24/24，均 100%         |

映射测试夹具注释给出同版本声明来源；检查真实 payload 层级、全部已支持原因、forked/未来/缺失原因、忽略非目标事件、取消订阅及部分订阅失败回滚。
初始化测试使用真实 Cordis，覆盖 status 文件、晚加载服务、同步 logger 异常和异步文件系统异常。
F01 修正补充：会话销毁的 unknown 结果及结束来源、销毁后重复事件、状态文件原子替换和失败降级、依赖范围均有回归测试。
覆盖率命令：`pnpm exec vitest run --project host --coverage.include=packages/host/src/bridge/run-tracker.ts --coverage.reporter=text --coverage.reportsDirectory=.dsh-dev/p02-coverage`。

## 真实宿主手工验收

| 提示词验收项           | 实际执行与结果                                                                                                                                                       | 状态                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Desktop 版本与插件装载 | Desktop 自带 dsh.cmd 确认为 0.2.1-rc.2；新建 web 测试 profile，add link 成功；127.0.0.1:3182 Web UI 实际打开；status 中三项服务均 true                               | 已通过加载检查                                                                               |
| 工具消息完整信号链     | 已启用 debugLogSignals，但隔离环境未设置可用的模型认证；UI 尚无选中模型，账户探测返回 403/协议错误；未提交模型消息                                                   | **待验收**，没有可粘贴的真实 turn-start → tool-call → tool-result → turn-end(completed) 日志 |
| 两插件同时启用         | 同 profile 实际安装 @takboo/dsh-coopanion@0.4.13 并重新启动，Web UI 可打开、WhaleDot status 更新、原生窗口 DeepSeek Whale · Harness 出现，进程路径属于该测试 profile | 已通过双插件启动检查                                                                         |
| 鲸鱼正常动作           | 已使用 computer-use 查看该原生窗口；透明窗口截屏不能可靠证明鲸鱼的动画/动作状态                                                                                      | **待验收**，未以窗口存在替代动作验收                                                         |
| apply 抛错不阻断宿主   | 在已编译 lib/index.js 的 apply try 内、取得 logger 后临时加入 `throw new Error("P02 deliberate apply fault")`，重新启动真实 Host，Edge 刷新后仍显示完整会话 UI       | 已通过宿主存活检查                                                                           |
| 撤销故障               | 已从测试前副本恢复 lib/index.js，检查无 deliberate fault 字符串；生产 TS 从未加入故障                                                                                | 已完成                                                                                       |

本机 Desktop 版本在 coopanion package.json 的 `engines.dsh` 兼容列表内；不需要升级或豁免兼容。
参考补充：Desktop 原包缺少 .d.ts，已取得用户同意后用 npm 同版本声明补充；没有将旧社区插件接口当作当前版规范。
原始 CLI 输出、安装记录、参考与测试 profile 留在忽略的 `.dsh-dev/`、`.dsh-ref/`，不提交可能含启动认证参数的原始日志。

## 待完成的真实验收

在专用终端按 [dev-dsh.md](dev-dsh.md) 设置所选模型认证并启动 `whaledot-p02`，
以 Web UI 发一条明确要求读取测试工作区文件的消息，取得四类真实结构信号日志并核对 completed；
同时目视确认鲸鱼在同 profile 中正常动作。不要将 API Key 发到聊天或复制用户凭据文件。
**P02 代码与静态/单测检查已交付；上述两个真实验收点尚未通过，不能称 P02 全部验收完成。**
