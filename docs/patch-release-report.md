# WhaleMaid 1.2.2 修复与发布核验

已发布 [WhaleMaid 完整版 1.2.2](https://github.com/Xiaxin1235/WhaleMaid/releases/tag/v1.2.2)，内置 [配套 Coopanion 0.5.7](https://github.com/Xiaxin1235/dsh-coopanion/releases/tag/v0.5.7)。解决两项问题：把已有源码修复纳入正式完整包；修复配套桌宠的三平台检查。工作使用独立发行工作区，不改日常 profile，没有调用真实模型 API。

## 正式包中的修复

| 项目               | 行为与来源                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 大肥鱼预设名称     | 设置页显示“大肥鱼 (WhaleMaid)”及说明；沿用 `9378a40` 的修复                                                                                            |
| 源码安装的固定副本 | 中英文安装说明使用 `--config.package-import-method=copy`，避免后续构建通过硬链接改写正在使用的副本                                                     |
| 审批命令可读性     | 内置 Coopanion 0.5.7，包含 `85ec77b` 的修复；普通 PowerShell 变量保留路径值，环境变量和敏感令牌仍遮挡                                                  |
| Linux 原生测试输入 | 只为右键使用 XTest 真实按下、同步和释放；左键双击保留 CDP 的明确点击次数，继续检查真实右键事件及菜单可见性                                             |
| macOS 浏览器回归   | CI 的无头 Chromium 使用 ANGLE SwiftShader；Electron 原生窗口仍使用原生后端，单独验收                                                                   |
| 回归的时间测量     | 动画像素检查等待实际变化；首帧读取运行时已有的 20 秒初始化预算；高刷新率检查按实际帧率和 30 FPS 上限比较；截图保存单独限时 20 秒，原交互限时和断言保留 |

原生字号夹具先通过真实双击打开聊天，再注入长回复进入阅读；避免在小工作区先生成覆盖桌宠中心的气泡后，要求鼠标穿过气泡双击。字号、阅读、草稿及真实输入断言保留。

原生 macOS 发布门禁改用官方 macOS 15 ARM 运行器；macOS 14 容量不足自动取消的作业不计通过。macOS 安装门禁使用系统自带 `shasum -a 256 --check` 核对原始校验文件；Windows/Linux 保留 `sha256sum`。

## 门禁与公开产物

| 项目                     | 结果与证据                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WhaleMaid 三平台全量检查 | 正式标签三平台全量 build、test、typecheck、lint、test:package、format 检查通过：[40662487092](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40662487092)                      |
| 桌宠三平台全套           | 通过，[原始规范包 CI 40658159049](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40658159049)                                                                              |
| 桌宠安装矩阵             | 15/15 通过，三平台 × 五个已声明宿主版本，均使用同一源码、同一规范归档；[逐项报告](https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.7/verification-matrix.json)     |
| 完整包安装矩阵           | 6/6 通过，三平台 × DSH rc.2/rc.3；一个顶层 bundle、真实主面板、原生鲸鱼及卸载；[逐项报告](https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.2/verification-matrix.json) |
| 公开下载                 | 匿名下载版本包和固定别名，摘要与通过安装矩阵的规范归档一致；归档内核对预设名称、配套组件版本及审批修复                                                                               |
| 市场更新                 | 自有索引固定新包的不可变 Git 提交 `97a2a453848b021a83e704fb52238b443100b0da`；社区入口继续使用最新版完整包别名                                                                       |

| 组件             | 版本  | 源码提交                                   | SHA-256                                                            |
| ---------------- | ----- | ------------------------------------------ | ------------------------------------------------------------------ |
| WhaleMaid 完整版 | 1.2.2 | `dcf5196416d959607eeac479773366855987bdea` | `069cfe3bc92f4fd6cad7efbf28c45505efc8e6967420d169b0b091a1db03dd0f` |
| 配套 Coopanion   | 0.5.7 | a1bf29dd8e1afa2390b4c06b621cfc1bc6c1a3b1   | `d5fd1d1a8452c2fabb79ed6f20fbf400eaab9b3f3ed9ff1c4f1b47cdeaa6d9d9` |

## 失败记录与发布追溯

早期失败保留，包括 macOS 独立预览拒绝 WebGL、首帧使用过短交互期限，以及 [40632564990 首轮](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40632564990/attempts/1) 的字号截图保存超时。后续修复按上表区分初始化、截图和实际交互期限；无头浏览器的软件图形验证不代替原生 Electron 验证。

[40636024078](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40636024078) 的三平台全套通过，但安装矩阵发现 macOS 缺少 GNU 校验命令，以及把 XTest 扩展到左键带来的双击回归。现使用 macOS 自带校验工具，并把 XTest 修正收窄到右键。macOS 14 的 [40655987797](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40655987797) 因 ARM 运行器容量不足未获机器而取消；当前使用 macOS 15 ARM 完成全部门禁，核心 macOS 检查另用 Intel。

Windows 曾在 [40636686332 首轮](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/40636686332/attempts/1) 的虚构 CLI 取消测试中返回 `cleanup-failed`；同提交云端复测通过，本次正式标签三平台全量均通过。原失败记录保留，产品进程清理成功条件没有放宽，也没有把单次复测通过写成已查明并修复其根因。

配套组件按其[发布文档](https://github.com/Xiaxin1235/dsh-coopanion/blob/a1bf29dd8e1afa2390b4c06b621cfc1bc6c1a3b1/docs/releasing.md)的原始 CI 规范包路径发布，使用通过全部 15 组安装的同一份归档，未二次构建。创建标签额外触发的[重复自动发布流程 40661900041](https://github.com/Xiaxin1235/dsh-coopanion/actions/runs/40661900041) 已取消；它不计入通过记录。WhaleMaid 由上述正式标签工作流自动发布，两个组件的逐项矩阵均作为永久 Release 附件保留。

完整包继续保持 MIT 与独立 AGPL 组件的源码、许可证和分发边界；不向上游 npm 账户发布。只更新/安装 [WhaleMaid 完整版](https://github.com/Xiaxin1235/WhaleMaid/releases/tag/v1.2.2)，不要再单独安装 Coopanion。旧发布标签和归档保持不变。
