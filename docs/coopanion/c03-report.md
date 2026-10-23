# C03 全屏与普通桌面可见性修复验收

## 完成情况

2026-10-23，修改独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支。基线 `8c491be05ee024ccab526d4863be042035791b3d`，本地提交 `399ad8fe8763e0dbe3bdbccc29dcaf1cd6030f60`（`fix: keep the pet visible over fullscreen apps unless the user hides it`）。版本保持 0.4.13，未 push、未发布；实现和素材未复制进 WhaleDot。

| 项目 | 结果 |
|---|---|
| 自动恢复 | 系统最小化、隐藏、失去置顶及显示器变化时恢复；每 2 秒核对，健康状态不反复显示或置顶 |
| 用户意图 | 主动隐藏、锁屏、休眠、退出期间不自动恢复；解锁或恢复后按显示意图处理 |
| 全屏设置 | “在全屏应用上方显示”默认开启，Windows/macOS 使用 `pop-up-menu`；关闭恢复旧 `floating`，Linux 保持 `floating` |
| 诊断 | 复用 schema 1，只在开启本地诊断时采集；最近最多 24 条事件，含时间、窗口状态、显示意图、DIP bounds/workArea、scaleFactor、角色矩形 |
| 文档与文案 | 中英文设置、中文游戏说明、恢复/诊断/多屏契约同步 |
| 用户目视 | 隔离真实宿主普通桌面，用户确认“能持续看到” |
| 清理 | 测试宿主、测试鲸鱼已停止；隔离配置恢复；日常 profile 未修改 |

诊断不读取其他应用标题或进程名。角色矩形每至多 500ms 更新一次，附独立采集时间；事件中的角色位置可能是上一采样值，并非事件瞬间测量。关闭诊断清空事件并撤下接口。

## 验证（命令与关键输出）

环境：Windows、实际屏幕缩放 125%、Node 24.18.0、Electron 44.7.0、DSH Desktop CLI 0.2.1-rc.2 / Cordis 4.0.5。所有桌宠运行使用独立用户数据目录。

| 检查 | 结果 |
|---|---|
| `npm ci` | 成功，未改版本及锁文件 |
| `npm run typecheck` / `npm run build` | 通过；提交后再次构建通过 |
| `npm test` | Vitest 241 passed、11 skipped；Node release/client 11 passed、locale 1 passed |
| `npm run test:inbox-ui` | 完整通过：收件箱、回复/字号、多屏、交互/拖动、陪伴 |
| `npm run test:desktop` | **125% 下全套通过**：窗口可见性、多屏/原生输入、陪伴、NPC、诊断、启动生命周期、崩溃恢复、聊天/通知、角色导入与持久化 |
| 可见性原生断言 | 最小化、系统隐藏、丢失置顶、越界恢复；Electron 与 Win32 双重确认前台测试窗口仍有焦点，桌宠未获焦点 |
| 主动隐藏与暂停 | 主动隐藏跨越 2.3 秒巡检仍隐藏；模拟锁屏/休眠期间不恢复，解锁/唤醒后恢复 |
| 设置关闭 | 热切回 `floating` 后跨巡检，无重复置顶/显示/聚焦调用 |
| 几何与输入 | 100%/125%/150% 纯函数及浏览器矩阵；125% 实际原生窗口、OS 光标、命中测试与渲染坐标通过 |
| 真实隔离宿主 | `scripts/dev-host.ps1 -UseUiKey`，`whaledot-p02` 链接本地版，正常启动，无测试调试端口；认证状态与诊断均显示可见 |
| `git diff --check` | 通过 |

Windows 三种层级在同一个普通全屏前台测试窗口上比较：

| 层级 | 桌宠在测试窗口上方 | `isAlwaysOnTop()` | 测试窗口保留 Win32 前台焦点 |
|---|---|---|---|
| `floating` | 是 | false | 是 |
| `pop-up-menu` | 是 | true | 是 |
| `screen-saver` | 是 | true | 是 |

选择 `pop-up-menu`：它是本次比较中最低的、位于任务栏之上且原生置顶状态稳定的层级。`floating` 在这个普通全屏窗口上也可见，但 Electron 44 的 Windows 实现将该层级放在任务栏之下；关闭设置时保留其旧语义，不把其 `isAlwaysOnTop() === false` 当作每两秒必须修复的故障。[Electron 44.7.0 实现](https://github.com/electron/electron/blob/v44.7.0/shell/browser/native_window_views.cc)、[官方层级说明](https://www.electronjs.org/docs/latest/api/base-window#winsetalwaysontopflag-level-relativelevel)。此比较不能证明可覆盖独占全屏或任意其他 TOPMOST 游戏窗口。

实际隔离宿主快照：visible=true、minimized=false、alwaysOnTop=true、desiredVisible=true；bounds 与 workArea 均为 `(0,0,1536,816)` DIP，scaleFactor=1.25；角色矩形 `(1356,647,127,145)` 位于 viewport 内。用户随后确认持续可见。

证据在 `D:/dsh_plugins/WhaleDot/.dsh-dev/c03-evidence/`：`manifest.json` 记录源码与证据摘要；三份 c03 日志记录完整测试，`window-visibility-native.json` 记录层级/焦点/恢复，另含多屏、字号、生命周期、诊断、恢复、NPC/陪伴 JSON。`isolated-host-snapshot.json`、`host-status.json`、`cleanup.json` 分别记录正常宿主、公开认证接口与清理结果。未复制含登录入口的宿主原始日志。

测试与真实隔离宿主运行于提交前的最终工作树，因此原始运行元数据保留基线提交和 dirty=true；不改写为新提交。manifest 将这些证据与最终源码逐文件摘要关联。提交后仅重新构建以刷新构建身份，未将该构建冒充又一次原生运行。最终构建 commit=`399ad8f`、dirty=false；productDigest=`5c8a345812c0e4b4ba5fc5db588054a670e96cd17ef78d22bddf1e7cb692d7ac`，与真实隔离宿主的已测构建一致。

## 偏离与待确认（含对 DSH API 的假设与出处）

**原始真实游戏消失的根因尚待用户日常 profile 的诊断确认。** 自动化主动制造了最小化、隐藏与丢失置顶，并验证恢复；用户的普通桌面目视确认不能替代《杀戮尖塔》的实际游戏验收。

Windows 恢复采用 `showInactive()`，没有照字面先调用 `restore()`：实测 `restore()` 即使临时禁用 focusable，也可能改变焦点。Electron 44.7.0 的 Windows 实现中 `showInactive()` 使用不激活的正常显示状态，测试确认能解除最小化并保留 Win32 前台窗口；`moveTop()` 也不激活窗口。[固定版本源码](https://github.com/electron/electron/blob/v44.7.0/shell/browser/native_window_views.cc)、[BaseWindow 文档](https://www.electronjs.org/docs/latest/api/base-window)。其他平台有实现分支，但本次未做 macOS/Linux 原生验收。

125% 的既有原生点击失败来自**测试工具**：PowerShell 的光标注入线程未声明 DPI 感知，物理坐标又被 Windows 虚拟化。修正为 Per-Monitor-V2 线程上下文，再使用 Electron `dipToScreenPoint` 的物理点；例：目标 `(266,371)` DIP → `(333,464)` 物理像素 → 回读 `(266,371)` DIP。产品窗口/光标/角色继续使用 DIP，未额外乘 DPR。多屏测试接受原生 bounds 与请求工作区每轴最多 1 DIP 的整数舍入差，viewport 与实际 contentBounds 仍严格匹配。[Electron screen 坐标说明](https://www.electronjs.org/docs/latest/api/screen)、[Microsoft 线程 DPI API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext)。

全屏测试使用自己的前台窗口；准备阶段仅点击已确认属于该测试窗口的点，随后移除测试窗口的临时 TOPMOST，再验证桌宠恢复时的原生 Z-order 与前台焦点。未操作用户游戏。锁屏/休眠为受控事件模拟，多屏为受控布局；未执行真实系统锁屏/休眠或物理混合 DPI 多屏验收。既有角色测试所需示例 ZIP 用仓库命令从 `examples/star` 生成，未提交该生成文件。

“全屏时自动隐藏”作为可选项未实施：本次没有验证可靠的跨应用全屏识别能力，因此不提供无效开关。新增设置仅“在全屏应用上方显示”。

本次没有新增 DSH API。设置沿现有 `settings.mutate('dsh-coopanion', ...)` 与 volatile 配置机制；Host → Electron 配置沿现有 bridge。出处为 WhaleDot `docs/dsh-api-notes.md`、`.dsh-ref/0.2.1-rc.2/` 和插件既有设置实现；隔离宿主状态查询沿官方 Connection 认证链。新增窗口能力均使用 Electron 公开 API，测试 Win32 前台判断依据 [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)，未臆造宿主能力。

## 需要用户目视确认的项目

普通桌面隔离鲸鱼已确认；下面是**尚未执行的日常安装与真实游戏验收**。

1. 完全退出日常 Harness 与旧桌宠。打开一个普通 PowerShell，逐条执行；每条成功后再执行下一条：

```powershell
Remove-Item Env:DSH_HOME,Env:DSH_PET_TEST_DATA_DIR,Env:DSH_PET_TEST_DEBUG_PORT,Env:DSH_PET_TEST_NO_SANDBOX,Env:DSH_PET_TEST_WINDOW_CONTROL,Env:DSH_PET_TEST_DIAGNOSTICS_DIR -ErrorAction SilentlyContinue
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop remove '@takboo/dsh-coopanion'
& $dsh plugin --profile desktop add 'link:D:/dsh_plugins/dsh-coopanion'
```

2. 从开始菜单正常打开日常 Harness。确认“设置 → 桌宠 → 在全屏应用上方显示”已开启，并在复现前开启“本地诊断”。
3. 打开《杀戮尖塔》全屏，左右键正常操作几分钟：桌宠持续可见、托盘提供“隐藏”，游戏焦点及操作不被恢复动作打断；退出游戏后仍可见。主动隐藏后等待至少 5 秒应保持隐藏，再点“显示”应恢复。
4. 如仍消失，尽快导出诊断，保留消失前后的事件。以下命令在只运行日常实例时使用；若提示多个实例，给第二条添加 `--instance`，值取自第一条列表：

```powershell
node D:/dsh_plugins/dsh-coopanion/scripts/sample-companion.mjs --list
node D:/dsh_plugins/dsh-coopanion/scripts/export-diagnostics.mjs --output "$env:USERPROFILE/Desktop/whale-window-diagnostic.json"
```

导出文件不能已存在；下次可改文件名。导出依赖本地诊断已开启，无需调试端口。请将该 JSON 与“全屏/窗口、左键/右键、托盘显示什么、退出游戏后是否恢复”的现象一起提供。

## 已知问题 / 下一步建议

真实游戏、独占全屏、其他系统平台及物理多屏仍待对应实机验证。下一步以日常游戏诊断判定原始触发原因，再决定是否需要针对性修复；现有模拟恢复通过不能替代此判断。

如需换回原 npm 版，完全退出日常 Harness 与桌宠，在上面的普通终端逐条执行，再从开始菜单重开；保留用户数据目录：

```powershell
& $dsh plugin --profile desktop remove '@takboo/dsh-coopanion'
& $dsh plugin --profile desktop add '@takboo/dsh-coopanion@0.4.13'
```

本次已停止自己启动的测试宿主与测试鲸鱼，恢复隔离 YAML；未安装或替换用户日常 profile。
