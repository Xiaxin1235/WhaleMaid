# 开发与验证

先从[文档索引](README.md)阅读对应行为契约。工具链分别固定在 `.node-version` 和 `package.json#packageManager`，依赖锁为随包提供的 `npm-shrinkwrap.json`。

## 准备与验证入口

```bash
npm ci --ignore-scripts
npm run verify:metadata
npm run setup:electron
npm run typecheck
npm test
npm run build
npx playwright-core install chromium
npm run character:pack -- examples/star paper-star.zip
npm run test:ui
npm run test:notification-ui
npm run test:inbox-ui
npm run test:keyboard-native
npm run test:desktop
npm pack
node scripts/check-package.mjs
npm run test:install
```

按改动选择检查；完整发布门槛见[发布流程](releasing.md)。Linux 原生窗口需要 X11／Xvfb 和窗口管理器，测试光标还需要 Python 3 与 libX11；浏览器及网格动画需要 Chromium WebGL。CI 的 Linux 显示准备由 `.github/actions/setup-linux-display` 完成。

`npm run dev` 打开浏览器演示（默认 `http://127.0.0.1:4173`），`npm run demo` 启动桌面演示，二者的任务事件均为模拟。首页素材的重拍见[素材说明](assets/README.md)。

浏览器检查真实 API 2 动画、聊天、完整阅读、角色导入及脚本隔离；桌面检查真实 Electron 窗口、IPC、托盘和恢复；安装检查使用官方 DSH loader 安装实际 `.tgz`。用 `DSH_TEST_VERSION=<支持版本>` 选择宿主，用 `DSH_TEST_PACKAGE_DIR=<规范包目录>` 消费已有规范包及校验文件。完整平台／宿主列表以 CI 矩阵为准。

原生测试和安装使用隔离数据目录，系统桌面操作串行执行。CI 测试沙箱参数仅供隔离实例；普通安装保留 Chromium sandbox 与 contextIsolation，关闭 Node integration。测试通知适配器和模型答复器属于受控边界，不能代替通知中心实机送达或真实模型会话验收。

## 关键行为回归

动画像素检查等待实际渲染结果，不以固定 400 毫秒延迟判定成功；仍沿用界面测试的超时上限并保留像素变化断言。Linux 原生点击通过 XTest 同步按下与释放，保留真实事件到达、右键菜单和系统鼠标位置断言，不在点击超时后自动重发操作。

macOS ARM 发布检查使用 `macos-15` 运行器；`macos-14` 曾因容量不足未分配到运行器而取消，该取消不计通过。macOS 云端无头 Chromium 的独立角色预览曾拒绝创建 WebGL 上下文。CI 在安装浏览器后运行 `scripts/setup-ci-browser.mjs`，为浏览器检查显式选择 ANGLE SwiftShader；真实网格、像素变化与界面断言保持不变。该设置仅包装 `CHROMIUM_PATH`，Electron 原生窗口、输入、焦点及恢复仍使用原有原生图形后端，分别报告。

收件箱回归中的多屏、NPC、异常表情及拖放浏览器用例串行运行，避免同一运行器同时竞争多个 WebGL 浏览器。所有浏览器入口均遵循 `CHROMIUM_PATH`；交互超时和断言保持不变。浏览器夹具的首帧初始化共用运行时已有的 `READY_MS`（20 秒），避免把仍处于合法初始化期的 WebGL 首帧按各自的短交互限时判失败。

| 改动 | 检查入口与范围 |
|---|---|
| 完成、通知与请求结算 | `npm test`、`test:n0`、`test:notification-ui`；宿主接口检查由安装入口执行 |
| 聊天、收件箱、字号、多屏、NPC 日常 | `test:inbox-ui`；会话与字号浏览器用例串行，初始化失败保留有界状态、控制台与截图 |
| NPC 配置 | `tests/npc-controls-ui.mjs`：关闭许可、quiet／interactive、热切状态保持与禁用上游随机漫游 |
| 异常查看与尺寸 | `tests/attention-size-ui.mjs`：通用异常回执、新修订、审批／提问与固定角色尺寸 |
| 拖放与小窝 | `tests/npc-drag-ui.mjs`：真实指针轨迹、两侧边缘、区域外停留、旧路线取消、按住及释放后小窝锚点 |
| 自主循环与互动存档 | `tests/npc-life.test.js`、`tests/npc-life-native.mjs`、`tests/companionship-ui.mjs`、`tests/companionship-native.mjs` |
| 原生冷启动 | `tests/lifecycle-startup-native.mjs`：受控 unknown／locked 与实际系统状态分别检查 |

原生 NPC 用例控制时钟、粗粒度输入和鼠标感知；身体移动及 arrived／interrupted 保持真实。受控循环通过与物理输入、自然体验分别报告。

小窝回归支持录制隔离页面，不录桌面其他窗口或音频：

```bash
DSH_HOME_MARKER_VIDEO=/absolute/path/drag.webm \
DSH_HOME_MARKER_TRACE=/absolute/path/drag.json \
node --test --test-name-pattern="home marker" tests/npc-drag-ui.mjs
```

默认不录视频。断言同时检查按住、拖动及松手后的锚点，并覆盖大尺寸及两端小窝设置。

## 键盘与生命周期

`test:keyboard-native` 启动当前系统的真实辅助进程，检查固定枚举、停用和清理，记录首个响应耗时；Windows 允许完整的 60 秒初始化，首次响应后继续观察至少 5 秒，报告写入 `artifacts/keyboard-activity-native.json`。macOS 与可用 X11 需取得 active／idle；不支持的会话保守 unknown。Linux CI 在隔离 Xvfb 中设置 `DSH_KEYBOARD_TEST_X11_INPUT=1`，用 XTest 验证键盘触发、仅鼠标不触发和恢复 idle；日常会话不使用这个注入开关。

macOS 可在已解锁桌面运行普通沙箱探针：

```bash
DSH_LIFECYCLE_NATIVE_REAL=1 DSH_LIFECYCLE_EXPECT_STATE=unlocked \
node tests/lifecycle-startup-native.mjs
```

它要求真实初态已知、未挂起且键盘适配器 available。锁屏场景使用 `DSH_LIFECYCLE_EXPECT_STATE=locked`，在实际锁屏环境单独执行；探针不改变锁屏状态。物理键盘、跨应用、锁屏／休眠、远程会话与平台资源分别验证。

## 资源与诊断

先按[使用指南](usage.md#自主陪伴)核对开关，再按[诊断契约](diagnostics-contract.md)解释时长、缺口和报告状态。独立采样器 `scripts/sample-companion.mjs` 使用本地诊断接口及 OS 指标，不操作窗口、不读取聊天正文、不启动模型。

`scripts/measure-idle.mjs` 支持 `off`、`npc-day`、`npc-night` 的同机短时对照，使用固定随机种子与真实时间；`npc-controlled` 强制粗粒度 keyboard=idle，只用于区分输入阻塞。短测不能作为两小时或其他平台资源结论。

受控 Linux 观察使用 `scripts/run-resource-observation.sh`；按脚本参数提供隔离 DSH runtime、冻结包、完整来源提交和尚不存在的输出目录：

```bash
bash scripts/run-resource-observation.sh \
  --runtime /path/to/dsh-runtime \
  --package /path/to/frozen-package.tgz \
  --source-commit <包实际来源的完整提交> \
  --output artifacts/resource-observation-unique
```

VM 需图形依赖、Xvfb、Openbox、Python 3、procps 及固定工具链。观察器核对包内采样脚本，使用独立 profile，设置 `roam=true`、`companionship=interactive`、`diagnostics=true`；开始时用 CDP 证明渲染并设置随机源，周期采样交给同一独立采样器。默认预热 20 秒、采样至少 7200 秒、每 5 秒一次，首末各 1800 秒时间加权 RSS 增量 ≤20 MiB；NPC 覆盖、邀请落盘、存档与队列边界另行检查。`--seconds 60 --window 20` 仅做短检。

## 运行时与隔离

高频事件只发送动画元数据，完整结果在结果或已读状态变化时传输。角色脚本运行于 `sandbox="allow-scripts"` 的 opaque-origin iframe，仅通过有限协议交互；没有 Node、Electron 桥、外部网络或顶层导航权限。本地资源服务只监听 `127.0.0.1`，原生实例使用随机路径，写入校验可信页面来源。

上游代码和资源固定在仓库，不在启动时在线拉取；Electron 首次准备仍下载并校验运行时。插件不收集遥测，也不提供独立模型 API。许可及对应源码要求见[第三方声明](../THIRD_PARTY_NOTICES.md)。
