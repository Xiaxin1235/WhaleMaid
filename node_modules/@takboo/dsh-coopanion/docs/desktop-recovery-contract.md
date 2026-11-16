# 桌面异常恢复契约

Host 的 `PetControls` 独占恢复调度。意外退出（包括没有主动关闭回执的 exit 0）及明确标记为可恢复的启动失败，最多自动重试三次，依次等待 1、3、10 秒；连续运行 60 秒后清零。休眠或锁屏中不计算稳定时间。时间参数可注入。未知错误、缺少图形环境、无效或不可执行的运行时路径直接进入 error；清理未确认成功也不启动新进程。

共享原生寿命类型位于 [desktop-lifecycle.ts](../src/desktop-lifecycle.ts)。`NativeStartError.recoverable` 明确标记启动错误；spawn 仅 EAGAIN / ENOMEM 可重试，原生初始化捕获的异常仅 EADDRINUSE / EAGAIN / ENOMEM 经 `startup-error` 消息允许重试。启动超时、未发送错误分类便异常退出属于失去原生进程的可恢复路径。主动退出回执为 `closed`，不会依赖 exit code 0 猜测用户意图。

`NotificationRuntime` 同包扩展 `recovering` 阶段、`desiredVisible`、`recoveryAttempt` 和可选 `retryAt`。`visible` 只来自本代原生回执；显示意图独立保留，隐藏恢复通过进程启动参数初始化，第一帧也不显示。恢复中不具备通知领取资格；新代必须先收到原生 visibilityRevision 才能领取或呈现提醒。旧代 action、退出、可见性和发送失败回调不能污染新代。

停止、停用和卸载同步取消等待及在途启动，随后在有界期限内清理。用户从托盘退出或关闭窗口属于主动关闭，不自动重启。手动启动/重启重置重试预算，设置页显示等待、次数和有界诊断；停止在启动及等待期间始终可用。清理失败保留错误与手动重启入口，Harness 不等待恢复完成。

新进程 ready 后 Host 下发 `init { baseline: true, options, snapshot }`（完整结果）及 `notification-state`（有效请求）。baseline 只将已有结果加入 renderer 的已展示集合，不标记已读，结果仍在收件箱；后续新结果正常呈现。恢复不重新折叠历史、不增加未读、不重发旧提醒，也不调用聊天提交或任务执行。已领取通知继续按 broker 的 generation/visibilityRevision 取消和结算，迟到的送达证据不重新派发其他通道。锁屏/休眠状态由原生回执报告；已观察的锁屏和休眠分别传入新进程，resume 不会清除锁屏，unlock 不会清除休眠。新进程在收到初始化回执前保持无投递资格。

异常／暂停及 continued 提问的已查看回执由 Electron userData 独立保存；重载和进程恢复时加载后再呈现，已查看的同一事件不恢复信封。open 提问与审批仍保留入口。存档不进入任务或请求的持久事实，具体身份、期限与损坏恢复见[提醒契约](notification-contract.md)。

草稿、在途输入及阅读位置仍仅属于当前 renderer；进程崩溃会丢失这些临时界面状态。Host 已接受的消息留在 Harness 的持久队列，恢复不会重放输入或伪造接受回执。用户可在源会话核对后继续发送；本项不扩展跨进程草稿协议。Host 模型持有的关注会话、全文结果、未读与有效审批/提问保持不变。

验证分为可控时钟状态机、子进程 IPC、通知集成、真实 Electron 和宿主安装矩阵。三平台 CI 复用现有矩阵；本机执行不能替代其他平台原生或远端 CI 验收。

`textScale` 随最新完整配置传入新代 Renderer；当前 Renderer 的热字号切换保留阅读和草稿，进程恢复仍遵循上述临时状态丢失边界，见[文字契约](text-readability-contract.md)。

熟悉度、邀请预算与安静偏好由独立的[陪伴存档](companionship-contract.md)保存，原生恢复只读取摘要，不重放活动／邀请。它不扩展草稿或在途聊天的持久化范围；损坏关系档只停用持久成长与邀请，原任务恢复和阅读仍可使用。

冷启动先校验当前锁屏状态：macOS 只读取 CoreGraphics 的锁屏／控制台／登录完成三个布尔标记，Windows／Linux 使用 Electron 原生空闲状态 API。恢复时已有的锁屏状态继续保守保留；状态未知时挂起自主活动和主动投递，等明确的锁屏／解锁事件或在有效会话重新启动。生命周期监听先于初始化检查建立，避免校验期间漏掉新事件；此检查不读取用户名、输入或会话内容。

## 窗口可见性恢复（C03）

原生进程内的可见性恢复与 Host 的崩溃重启分开：不重建进程或 Renderer、不重放输入／提醒，保留原 generation。仅 ready、未关闭、desiredVisible=true 且系统未挂起时生效。用户隐藏先记录意图再 hide；系统 hide/minimize、失去置顶、blur 和显示器变化触发合并后的检查；两秒巡检在健康状态下只读，不制造显示／置顶循环。退出先关闭守护，锁屏／休眠／未知锁状态不自动恢复。

Windows 使用 `showInactive()` 恢复最小化及隐藏状态，随后必要时 setAlwaysOnTop/moveTop；不调用 focus/show。Electron 44 的 restore() 即使临时设置 focusable=false 仍可能影响前台，因此本平台不采用它。其他平台保留受限 restore 后 inactive show，跨平台原生行为另行验收。

`aboveFullscreen=true` 默认选 Windows/macOS `pop-up-menu`（最低的任务栏／Dock 之上级别），false 使用旧 floating；Linux 使用 floating。设置不改变主动隐藏语义。Windows 44.7.0 的 floating 实现会使用 behind_task_bar_，pop-up-menu 与 screen-saver 不使用；选择依据见 [Electron v44.7.0 源码](https://github.com/electron/electron/blob/v44.7.0/shell/browser/native_window_views.cc) 及 [BaseWindow API](https://www.electronjs.org/docs/latest/api/base-window#winsetalwaysontopflag-level-relativelevel)。本行为不保证绕过独占全屏或系统受保护桌面。

隔离原生测试使用自己的全屏前台窗口，比较三个置顶级别，测试系统最小化、hide、失去置顶、主动隐藏跨巡检及模拟锁屏／休眠，断言前台仍聚焦、桌宠不聚焦。测试专用变更 IPC 仅在独立数据目录、显式测试控制标志、测试沙箱和调试端口同时具备时加载；普通安装不开放。
