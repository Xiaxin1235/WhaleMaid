# WhaleMaid 完整版市场发布验收

本轮完成 Windows、macOS、Linux 的核心授权与执行移植，并发布 WhaleMaid 1.2.1 完整版，内置配套 Coopanion 0.5.6。工作在独立的 `codex/market-release` 工作区进行；真实模型 API 调用为 0，测试 profile 与日常安装分开。

## 本轮门禁与产物

[WhaleMaid Complete 1.2.1](https://github.com/Xiaxin1235/WhaleMaid/releases/tag/v1.2.1) 已发布，自有 Discover 源已完成真实安装、启用和卸载验收。社区公共目录 [PR #9681](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9681) 已于 2026-10-26 合并。后续名称与宿主要求修正见文末记录。

| 项目                             | 结果与证据                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhaleMaid 正式标签三平台全量检查 | 通过，[40367350637](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40367350637)，源码 `41c288bbbbf9527e834675803d09ae0c18e4b90f`                                           |
| 桌宠三平台全套                   | [40330572335](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40330572335) 的三项 Test 均成功；未取得运行器的安装任务取消，不计通过                                     |
| 桌宠五个 DSH 版本 × 三平台       | 15/15 同包安装通过；逐项作业、源码和摘要见 [桌宠矩阵](https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.6/verification-matrix.json)                             |
| 完整包 rc.2 / rc.3 × 三平台      | 6/6 通过，含真实主面板、原生鲸鱼、一个顶层 bundle、卸载与 0 模型调用；见 [完整包矩阵](https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.1/verification-matrix.json) |
| 公开下载身份                     | 匿名下载版本包与固定别名，均与经过六组安装的规范包 SHA-256 一致                                                                                                                  |
| 自有 Discover 真实界面           | 一个“WhaleMaid 完整版”入口；通过固定 Git 提交安装并点击“立即启用”，1.2.1 状态服务正常、Coopanion 被检测到、鲸鱼实际渲染为 127 × 145，页面错误 0                                  |
| 清理                             | 六组云端安装均正常卸载；本地测试浏览器已关闭，核对归属后停止市场测试宿主及其子进程，移除测试 bundle 并删除临时认证 URL 文件；保留验收记录                                        |
| 社区公共收录                     | PR #9681 已合并；名称修正 PR #9725 单独提交，未把提交状态写成已上线                                                                                                              |

| 组件             | 版本  | 源码提交                                   | SHA-256                                                            |
| ---------------- | ----- | ------------------------------------------ | ------------------------------------------------------------------ |
| WhaleMaid 完整包 | 1.2.1 | `41c288bbbbf9527e834675803d09ae0c18e4b90f` | `7a081119ded6cfe2ba6c04ac4a269e023e7ba931851b06177efe6a70bae789be` |
| 配套 Coopanion   | 0.5.6 | `6871c1ad684dad86a258dbff9b3dea88c64378c5` | `370c79a5b255c27bd018b8390d60224fdd27020c812bb77ef6b1966817321a37` |

WhaleMaid 核心检查覆盖 Windows x64、Linux x64、macOS ARM／Intel；桌宠的 macOS 原生证据来自 ARM。桌宠安装矩阵中 13 项来自主运行，macOS rc.1 来自 [macOS 15 补验](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40335590873)，macOS alpha.1 来自 [macOS 14 补验](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40361437707)。逐项核对成功状态、相同源码和规范包摘要后发布原始规范包，没有拼接不同候选。完整包六组安装使用一个规范归档；两个 macOS 版本在同一原生运行器顺序执行，各自单独保存报告。

自有索引为 `https://raw.githubusercontent.com/Xiaxin1235/WhaleMaid/master/market/index.json`。索引固定的 Git 包提交为 `e217d15c842bc969657503cbb4d594b6dfa2785b`，对应已验证归档的文件树；其 `release-source.json` 与公开归档源码一致。真实市场安装后的 profile 只有一个顶层 `dsh-whalemaid` bundle，没有另一个顶层桌宠 bundle。

本地市场截图、公开下载复核及逐项报告保留在原工作区的 `.dsh-dev/market-release-evidence`。云端截图见上述工作流的六个安装附件；长期包身份和矩阵同时作为 Release 附件保存。

## 已完成的核心检查

| 项目                                                                       | 当前证据                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Windows / macOS / Linux 全量 build、typecheck、lint、test、package、format | [正式标签 40367350637](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40367350637) 的三项检查全部通过 |
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

发布链保留两个项目的源码与许可证：WhaleMaid 的 MIT core 放入自有 host；经过校验的 AGPL Coopanion 及其运行依赖以标准 npm bundled dependency 放入独立的发行树，保留 fork、上游署名、对应源码和第三方声明。完整版按各组件许可证分发，MIT 实现不导入桌宠代码，不发布到上游 npm 账户。

自有 Discover 索引和社区公共收录是两个入口：前者需要部署启用官方市场模块并添加本项目索引，且安装固定 Git 包需要 Git；直接完整包链接不需要 Git。后者受[官方贡献规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)的仓库满 24 小时与维护者审核约束。完整 Release、索引发布或投稿均不等于已被公共市场收录。

## 完整包问题与收尾修正

1.2.0 的三平台核心检查成功，但整包安装被 pnpm 11 默认的 `blockExoticSubdeps` 拦下：URL 形式的传递依赖不被允许。未关闭该保护，也未发布失败包；保留 v1.2.0 标签和失败记录。1.2.1 从公开桌宠 Release 核对源提交及摘要后组装标准 bundled dependency，并通过六组默认保护开启的真实安装。归档包含独立依赖的许可证与对应源码，不包含构建机器的 Electron 平台二进制，也未内置一套重复的 Harness SDK。安装后由同一个 bundle 启用两部分。

1.2.1 首轮 Linux 检查在子进程 PID 的即时消失断言上失败；同一提交复测成功，记录保留在工作流首轮。后续主分支将原 PID 消失断言改为最多 3 秒的有界等待，给系统进程回收留出时间；实际进程组终止实现未修改，相关 17 项测试通过。打包单元用例名称也改为说明“组装清单与加载私有 core”，实际双组件启用以六组安装和真实市场 UI 为依据。

发布器生成的索引原先不符合仓库 Prettier 格式；已格式化当前索引，并让后续发布按同一项目配置输出，避免下一次提交的格式检查因生成文件失败。后续更新按 [发布流程](releasing.md) 推送新版本标签即可自动检查、发布完整包并更新固定下载链接和自有索引；社区条目无需逐版本重投。

## 公共市场名称与宿主要求

首次收录的 `Xiaxin1235/WhaleMaid#host` 被市场渲染成了“host”。[收录修正 PR #9725](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9725) 改为明确显示名 `WhaleMaid`，并在中英文说明中写明 DSH `0.2.1-rc.2`、`0.2.1-rc.3`。完整包下载和子目录地址保留，维护者补充的 fork 署名、许可证及不能与上游桌宠同装的说明同步回本仓库。

市场原先只为 npm 条目读取宿主要求，GitHub 完整包即使已声明也显示未知。[市场代码修正 PR #1030](https://github.com/dsh-market/dsh-market/pull/1030) 为 GitHub 条目读取所指包的清单；Release 下载按对应标签读取，`latest/download` 先解析当前 Release 标签。沿用已有兼容判定，发现页、收藏页与筛选使用同一来源身份，读取失败仍显示未知。未扩大 WhaleMaid 现有支持范围，也未变更安装审批逻辑。

定向读取、路由及真实组件检查通过；真实公开 Release 读取和隔离 DSH rc.3 的 HTTP 路由均取得 `0.2.1-rc.2 || 0.2.1-rc.3`，rc.2、rc.3 判兼容，rc.4 判不兼容。市场 `npm run check`、打包预检、差异检查通过；本机全量测试 2,910 项通过、9 项跳过、2 项因 Windows 不允许创建符号链接而失败，未修改或跳过这些断言。模型调用为 0。两个修正 PR 的提交不等于已合并或市场已经发版；名称随公共目录合并刷新生效，宿主标签还需市场应用更新。

## 平台边界

Linux 桌宠的原生验证使用 X11 / Xvfb / Openbox；需要 `/usr/bin/python3`、libX11，键盘感知另需 libXi。Wayland 桌宠未声明支持。核心授权与执行不依赖 X11。

受控工作区子集与模拟显示拓扑用于跨平台布局检查，实际窗口、渲染和系统鼠标保持原生；它们不等同于物理多显示器、真实混合 DPI、真实游戏、系统通知中心体验或长期资源观察。旧 P18B 的 Windows 源码安装记录保留为历史证据，本报告单独记录完整发行。
