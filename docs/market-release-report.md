# WhaleMaid 完整版市场发布验收

本轮按用户确认，将 Windows、macOS、Linux 的核心授权与执行纳入支持范围；完整发行还需要配套桌宠通过三平台验收，再提交市场。工作在独立的 `codex/market-release` 工作区进行，未替换日常 profile，也未调用真实模型 API。

## 本轮门禁与产物

当前桌宠已发布；WhaleMaid 1.2.0 在整包安装阶段被 pnpm 的 URL 子依赖保护拦下，未发布完整包或索引。新候选 1.2.1 改用标准 bundled dependencies，保留独立组件许可证和对应源码，待重新执行完整门禁。

| 项目                                   | 状态与证据                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WhaleMaid 正式标签三平台全量检查       | 通过，[40363360148](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40363360148)，源码 `cecefd6e33bd2cf89305770052326c063a21a3e7`                                   |
| 桌宠三平台全套                         | 通过，[40330572335](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40330572335) 的三项 Test 均成功；后续未取得运行器的安装任务取消，不算通过                   |
| 桌宠五个 DSH 版本 × 三平台             | 15/15 同包安装通过；逐项成功作业、源码和摘要见 [verification-matrix.json](https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.6/verification-matrix.json) |
| 桌宠公开 Release                       | [0.5.6](https://github.com/Xiaxin1235/dsh-coopanion/releases/tag/v0.5.6)，版本包、固定别名及报告已公开；WhaleMaid 发布输入校验器匿名下载并核对通过                       |
| 完整包六组安装                         | 进行中，发布必须等待 Windows／Linux 各两组及 macOS 的两个顺序安装全部成功                                                                                                |
| 完整包公开下载、固定 Git 包和 Discover | 待完成                                                                                                                                                                   |
| 社区公共市场投稿                       | 待完成，收录需维护者审核                                                                                                                                                 |

| 组件             | 版本  | 源码提交                                   | SHA-256                                                                                         |
| ---------------- | ----- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| WhaleMaid 完整包 | 1.2.0 | `cecefd6e33bd2cf89305770052326c063a21a3e7` | `c579aa83f6023106b5079554ea609f4a418428bac3cbca42db6b6fb0933a303d`（失败的 1.2.0 候选，未发布） |
| 配套 Coopanion   | 0.5.6 | `6871c1ad684dad86a258dbff9b3dea88c64378c5` | `370c79a5b255c27bd018b8390d60224fdd27020c812bb77ef6b1966817321a37`                              |

WhaleMaid 核心在 Windows x64、Linux x64 和 macOS 的 ARM／Intel 运行器完成检查；桌宠的 macOS 原生证据来自 ARM。桌宠安装矩阵的 13 项来自主运行，macOS rc.1 来自 [macOS 15 补验](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40335590873)，macOS alpha.1 来自 [macOS 14 补验](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40361437707)。逐个核对成功状态、上述源码和同一规范包摘要后，使用原始规范包创建 Release；没有重打包、移动标签或拼接不同候选。

## 已完成的核心检查

| 项目                                                                       | 当前证据                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Windows / macOS / Linux 全量 build、typecheck、lint、test、package、format | [正式标签 40363360148](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40363360148) 的三项检查全部通过 |
| 单平台测试量                                                               | 1,305 项，授权范围分支覆盖率 98.05%                                                                         |
| Windows 旧授权兼容                                                         | 冻结原实现的 scope hash，移植后保持一致                                                                     |
| POSIX 路径                                                                 | 大小写、相邻目录边界、父目录越界、混合路径、保护文件、工作区授权映射均有用例                                |
| 真实执行                                                                   | Git 工作区、符号链接逃逸、原目录保留、命令审批、独立 shell 超时及后代进程清理纳入宿主测试                   |
| Windows 进程清理                                                           | 仅本机进程验证使用受信任的机器级 PowerShell 模块；Codex 子进程不继承用户模块和 API 密钥                     |

## 历史定位与修复

准备阶段尚未发布完整包。桌宠定向恢复检查先在 macOS 与 Linux/X11 通过：[40294320608](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40294320608)。当时全套和安装矩阵尚未完成，未据定向检查宣称全套通过。

桌宠定向完整安装已在三平台通过：[40316639806](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40316639806)。其中核对了安装、设置持久化、字号与双语文案、已有历史的冷会话恢复、消息去重、原生进程崩溃恢复及审批保留。保留 v0.5.0、v0.5.1、v0.5.2 候选记录；修正旧版测试预期和测试数据后，曾进入 0.5.3 候选，不移动旧标签。

0.5.3 的正式门禁在三平台全套和 14/15 宿主安装通过，Windows / DSH alpha.1 暴露了会话切换竞态，阻止发布。已用渲染器用例稳定复现：旧读取回执会覆盖用户刚选的目标；修复后同时验证发送目标、打开目标及宿主确认后的正常切换，完整界面回归通过。候选调整为 0.5.4，标签与旧失败记录全部保留，重新执行[正式门禁 40322702173](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40322702173)。

0.5.4 的单元检查发现旧 VM 夹具未提供新增状态；已补齐，并在本地完成全部单元、类型与完整界面检查，正式候选调整为 0.5.5（`4bb50abc1577978dd7fde57c34ba3a5593ef875c`），继续保留旧失败标签。

0.5.5 的[首次运行 40323578148](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40323578148)遇到 Windows 键盘辅助进程 15 秒启动超时及 Ubuntu 镜像依赖下载超时；[后续运行 40325745320](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40325745320)的 Windows、macOS 全套通过，Linux 仍在依赖准备阶段超时。日志确认运行器通过 `/etc/apt/apt-mirrors.txt` 选择 Azure 镜像，首次替换仅覆盖常规 sources 文件而未覆盖此列表；补齐后运行[40328191998](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40328191998)，Linux 图形依赖已安装成功。此次只修复工作流依赖源，仍检出并打包上述不可变 0.5.5 提交；未放宽产品断言、移动标签或用其他版本产物替换。

本地完整包安装预演在 DSH rc.3 通过主面板、状态服务、原生桌宠及卸载检查；使用的是本地配套依赖，仅为预演，不能代替公开 URL 和六组正式安装验收。

40328191998 的 Linux 全套通过，但 Windows 再次在键盘辅助进程的 15 秒期限失败，因而未发布。独立[Windows 初始化探针 40329970668](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40329970668)测得冷启动首响应 4,350ms、后两次 923ms／938ms，不能据此确定完整回归中的慢阶段。产品改为允许 Windows 初始化最多 60 秒，期间始终 unknown；就绪后 2.5 秒失联、停用清理、失败不自动重启均保留，并新增延迟就绪与最终超时用例。新候选 0.5.6（`6871c1ad684dad86a258dbff9b3dea88c64378c5`）在本地完成类型、单元和元数据检查，重新进入三平台及 15 组安装门禁；0.5.5 标签和失败记录保留。

后续等待主要来自 GitHub 的 macOS arm64 容量不足；任务注释明确记录始终未取得运行器，取消项没有计为成功。尝试 Intel 虚拟机时，原生 Electron 无法创建 WebGL；[独立探针 40362094901](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40362094901)对默认、GL、Metal、SwiftShader 等八组配置均得到不可用结果。软件渲染探路已撤回，桌宠最终使用有原生图形能力的 ARM 运行器，未降低渲染或窗口断言。WhaleMaid 核心的 Intel 检查中，1001 次真实数据库写入超过原有 20 秒测试期限，单项预算调整为 60 秒；Windows 原生进程清理检查改为单工作线程运行，原有进程清理成功判定保留。[40361460190](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40361460190)及正式标签三平台检查均已通过。

本地复核发现 Windows `tar` 输出 CRLF 导致校验器将文件名末尾的 CR 误认为文件缺失；仅修正校验器的换行解析后，对原始规范包复核 667 个文件、提交和摘要全部通过。校验工具改进没有改变已固定的 0.5.6 产品标签或压缩包字节。

发布链固定两个独立仓库及许可证：WhaleMaid 的 MIT core 放入自有 host；AGPL Coopanion 作为固定 GitHub Release 依赖安装，保留 fork、上游署名、对应源码和第三方声明，不复制到 MIT 源码中，也不发布到上游 npm 账户。

自有 Discover 索引和社区公共收录是两个入口：前者需要部署启用官方市场模块并添加本项目索引，且安装固定 Git 包需要 Git；直接完整包链接不需要 Git。后者受[官方贡献规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)的仓库满 24 小时与维护者审核约束。完整 Release、索引发布或投稿均不等于已被公共市场收录。

## 平台边界

Linux 桌宠的原生验证使用 X11 / Xvfb / Openbox；需要 `/usr/bin/python3`、libX11，键盘感知另需 libXi。Wayland 桌宠未声明支持。核心授权与执行不依赖 X11。

受控工作区子集与模拟显示拓扑用于跨平台布局检查，实际窗口、渲染和系统鼠标保持原生；它们不等同于物理多显示器、真实混合 DPI、真实游戏、系统通知中心体验或长期资源观察。旧 P18B 的 Windows 源码安装记录保留为历史证据，本报告单独记录完整发行。
