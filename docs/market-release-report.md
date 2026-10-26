# WhaleMaid 完整版市场发布验收

本轮按用户确认，将 Windows、macOS、Linux 的核心授权与执行纳入支持范围；完整发行还需要配套桌宠通过三平台验收，再提交市场。工作在独立的 `codex/market-release` 工作区进行，未替换日常 profile，也未调用模型。

## 已完成的核心检查

| 项目                                                                       | 当前证据                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Windows / macOS / Linux 全量 build、typecheck、lint、test、package、format | [CI 40292635438](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40292635438) 全部通过 |
| 单平台测试量                                                               | 1,305 项，授权范围分支覆盖率 98.05%                                                         |
| Windows 旧授权兼容                                                         | 冻结原实现的 scope hash，移植后保持一致                                                     |
| POSIX 路径                                                                 | 大小写、相邻目录边界、父目录越界、混合路径、保护文件、工作区授权映射均有用例                |
| 真实执行                                                                   | Git 工作区、符号链接逃逸、原目录保留、命令审批、独立 shell 超时及后代进程清理纳入宿主测试   |
| Windows 进程清理                                                           | 仅本机进程验证使用受信任的机器级 PowerShell 模块；Codex 子进程不继承用户模块和 API 密钥     |

## 发行与收录状态

当前尚未发布完整包。桌宠定向恢复检查已在 macOS 与 Linux/X11 通过：[40294320608](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40294320608)。桌宠全套与安装矩阵、完整包六组安装、公开下载和市场界面验收仍待完成，不能据定向检查宣称全套通过。

发布链固定两个独立仓库及许可证：WhaleMaid 的 MIT core 放入自有 host；AGPL Coopanion 作为固定 GitHub Release 依赖安装，保留 fork、上游署名、对应源码和第三方声明，不复制到 MIT 源码中，也不发布到上游 npm 账户。

自有 Discover 索引和社区公共收录是两个入口：前者需要部署启用官方市场模块并添加本项目索引，且安装固定 Git 包需要 Git；直接完整包链接不需要 Git。后者受[官方贡献规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)的仓库满 24 小时与维护者审核约束。完整 Release、索引发布或投稿均不等于已被公共市场收录。

## 平台边界

Linux 桌宠的原生验证使用 X11 / Xvfb / Openbox；需要 `/usr/bin/python3`、libX11，键盘感知另需 libXi。Wayland 桌宠未声明支持。核心授权与执行不依赖 X11。

受控工作区子集与模拟显示拓扑用于跨平台布局检查，实际窗口、渲染和系统鼠标保持原生；它们不等同于物理多显示器、真实混合 DPI、真实游戏、系统通知中心体验或长期资源观察。旧 P18B 的 Windows 源码安装记录保留为历史证据，本报告单独记录完整发行。
