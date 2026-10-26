# 使用指南

本页说明安装、操作、配置与升级。产品介绍见[项目首页](../README.md)，开发和验证见[开发指南](development.md)，行为契约从[文档索引](README.md)进入。

## 安装到 Desktop

支持 **DSH 0.2.0-rc.2、0.2.1-alpha.1、0.2.1-rc.1、0.2.1-rc.2 和 0.2.1-rc.3**；其他版本未声明兼容。Linux 桌宠使用 X11，需要 `/usr/bin/python3` 与 libX11；Wayland 桌宠未声明支持。

在 0.2.1-rc.1 / rc.2 中，从左下角账号菜单（未登录时显示“更多”）选择“设置”，再进入“桌宠”；0.2.0-rc.2／0.2.1-alpha.1 从侧栏“设置”进入。

### 在 Harness 中从 npm 安装

打开侧边栏 **插件 → 添加插件**，在「包名或地址」输入 **`https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.6/dsh-coopanion-0.5.6.tgz`**，点击安装，再启用 `dsh-coopanion`。显式版本可以避免发布首日的裸包名解析回退，原因见下方。安装方式见 [Harness 官方插件管理说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.zh.md#安装一个组合包)。

### 安装版本与发布时间保护

pnpm 11 的 `minimumReleaseAge` 默认为 1440 分钟（24 小时）。详情页可以从 npm metadata 显示最新版本，但仅输入 `@takboo/dsh-coopanion` 时，安装解析仍可能跳过等待期内的新版本。见 [pnpm 官方说明](https://pnpm.io/supply-chain-security)。

安装后请核对日志中的实际版本与上方精确版本一致。自定义启用了 `minimumReleaseAgeStrict` 时，按安装器提示确认该精确版本或等待保护期结束。发布时间保护与 DSH 宿主兼容校验分别生效，无需全局关闭保护或豁免不兼容的旧版本。

### 通过 dsh 命令行安装

**Desktop：** 使用 Desktop 自带的 `dsh` 命令。先启动 Desktop 一次初始化 profile，完全退出应用，再执行：

```bash
dsh plugin --profile desktop add https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.6/dsh-coopanion-0.5.6.tgz
```

npm 安装的 dsh 不能管理 Desktop 所拥有的 profile；若系统找不到 Desktop 的命令，先在 Desktop 的菜单栏中使用 **Manage dsh command／管理 dsh 命令** 安装命令入口。

**本机 Web profile：** 使用 npm 安装的 dsh 时，向实际使用的 profile 安装。例如默认 `web` profile：

```bash
dsh plugin --profile web add https://github.com/Xiaxin1235/dsh-coopanion/releases/download/v0.5.6/dsh-coopanion-0.5.6.tgz
dsh --profile web
```

此方式需要本机图形桌面才能显示桌宠，浏览器承载系统通知；其他自定义 profile 将 `web` 替换为实际名称。已有 Host 先停止，再安装并重新启动。

### 通过压缩包安装

下载 [Release](https://github.com/Xiaxin1235/dsh-coopanion/releases/latest) 的 `dsh-coopanion.tgz`（或对应版本包），在 **插件 → 添加插件** 中填写压缩包绝对路径，安装后启用。自行构建见[开发指南](development.md)；本地 `npm pack` 的文件名包含 scope。

也可使用 Desktop 自带的 CLI，在完全退出 Desktop 后执行：

```bash
dsh plugin --profile desktop add /absolute/path/dsh-coopanion.tgz
```

### 安装完成后

完全退出并重新打开 Harness。首次启动会下载并校验 Electron 44 运行时；在 **Settings → 桌宠** 查看运行状态，打开一段会话后双击角色即可聊天。

## 配置与会话

**Settings → 桌宠** 沿用 Harness 的主题、中英文与系统语言设置。可控制随 Harness 启动、闲时活动、任务通知、安静模式、系统通知、待处理请求补提醒、等待时间、角色尺寸（90–240）、文字大小（100% / 125% / 150%）和气泡时长（2–60 秒）；数值按 Enter 或离开输入框保存。文字大小选择后立即保存并同步到当前桌宠，独立于角色尺寸，保留当前阅读、草稿与在途发送；旧配置默认 100%。

### 自主陪伴

在 **Settings → 桌宠 → 自主陪伴** 或角色右键菜单中选择“安静陪伴”或“互动陪伴”。默认关闭，停止自主活动；安静模式从小窝沿当前屏幕底部的一段空间慢走、观察、停留并返回，互动模式额外在白天低频邀请，每天最多两次。所有自动日常统一使用 NPC 调度；关闭陪伴后停止自动日常和邀请。

启用自主行为与邀请时使用以下组合；英文界面的开关名称一并列出：

| 设置 | 建议值 | 作用 |
|---|---|---|
| 闲时走动／Roam when idle | 开启 | 当前也是自主行为和邀请的总许可；关闭后即使选了互动陪伴也不会自动活动或邀请 |
| 自主陪伴／Companionship | 互动陪伴／Interactive | 开启新日常与低频邀请 |
| 本地诊断／Local diagnostics | 仅需外部采样时开启 | 允许读取状态；开关本身不启用自主行为 |

旧 `dailyRhythm` 设置和旧随机漫游已移除。旧配置中的 `dailyRhythm` 不再生效，也不会自动开启陪伴或邀请；原先使用旧节奏的用户需选择安静陪伴或互动陪伴。

“闲时走动”同时控制自动活动许可。NPC 是唯一的自动日常调度；不自主跑跳、跨屏或沿其他窗口行走。

**Settings → 桌宠 → 小窝横向位置／探索范围** 可调整相对当前显示器工作区的百分比，默认 85%／30%；角色实际边界、尺寸及工作区会进一步收紧范围。底部的浅蓝色椭圆就是小窝标记，点击穿透，尚无实体家具；拖动角色不改变小窝位置。也可从菜单临时隐藏、关闭自动活动或手动拖动；拖出当前活动段后先安静停留，拖回或调整位置／范围后恢复。拖动松手后在新位置放下，不因惯性弹回，也不恢复拖动前的旧路线或首次归位；区域内安静等待后重新安排。正文阅读和手动操作始终优先。

鼠标靠近先停；最近键盘活动时暂停外出和邀请，保留未完成目标。角色始终保持设置中的尺寸，打字、选中、悬停或拖动都不自动缩放；稳定空闲至少 12 秒后重新评估活动。键盘感知包含 macOS 聚合事件时间、Windows Raw Input 通知和 Linux X11／XInput2 适配，辅助进程仅输出 active／idle／unknown；不能区分打字与快捷键，也不读取具体按键或其他应用内容。Windows 需要系统 Windows PowerShell；X11 需要 `/usr/bin/python3`、libX11 与 libXi。Wayland（含 Xwayland）、无图形会话、非交互／远程 Windows、接口或依赖不可用均为 unknown，此时安静停留。macOS 不再将“事件监听授权”误当成聚合时间接口的前置条件，无需先授予额外权限。若辅助进程失效，可关闭再开启陪伴重试；诊断中的 keyboardBackend／keyboardStatus 可区分不支持、缺依赖、失败与过期。物理键盘、跨应用／锁屏场景及资源表现按平台分别验证。

无需 DSH 在前台或先打开会话。新工作、异常和审批优先；已呈现的长期待办保留入口，可允许小窝内安静观察。任务与 NPC 情绪各自保留。关闭闲时走动、用户休息、隐藏、锁屏／休眠及减少动态效果暂停自动路径，宿主退出后桌宠仍退出。详见[日常契约](companionship-contract.md)。

在角色上连续轻轻抚摸，或从右键菜单选择“一起活动”；实际完成的互动才计入熟悉度，五分钟内不重复增长，每天最多三次。跨至少三天累计六次会解锁挥手后的爱心招呼，缺席和忽略不会扣分。角色更新或换配色不重置，换角色各自保存。菜单可查看相处进展。

邀请可选择“一起活动／稍后／今天安静”，十秒不回应便自然结束。稍后至少等待一小时，今天安静跨重启保留，菜单可恢复邀请；它们不影响任务通知。进度无法保存时菜单会提示，原工作功能仍可使用。详情见[陪伴契约](companionship-contract.md)。

桌宠意外退出后按 1、3、10 秒间隔最多自动恢复三次，连续稳定运行 60 秒后清零。设置页显示恢复次数和诊断，可随时关闭或在失败后手动重启；主动关闭不触发恢复。隐藏的角色恢复后仍隐藏，关注会话、完整结果、未读和有效待办保留，旧结果不再次主动提醒。窗口内草稿与阅读位置会随进程退出丢失，恢复不会重发聊天或任务。缺少图形环境、无效运行时路径或未确认清理的进程直接反馈错误，详见[恢复契约](desktop-recovery-contract.md)。

```yaml
- id: dsh-coopanion
  config:
    autoStart: true
    size: 180
    roam: true
    # 自主陪伴与诊断默认关闭
    companionship: off  # quiet / interactive
    diagnostics: false
    npcHome: 0.85  # 工作区横向比例，0.05–0.95
    npcRange: 0.30 # 活动范围比例，0.10–0.60
    notifications: true
    quietMode: false
    systemNotifications: false
    reminders: true
    reminderDelayMs: 600000
    bubbleDurationMs: 12000
    # electronPath: /absolute/path/to/electron
```

最终回复气泡与事件互动提示分别显示。回复气泡时长从逐字显示完成后计时，鼠标停留或键盘聚焦时暂停收起；互动提示收起后，未处理的审批和提问仍保留在小信封列表。默认优先展示不超过 120 个 Unicode 字符、后面仍有正文的纯文本首段；否则沿用 180 字／句子预览，可展开完整阅读；原文保留且不截断，完整阅读器不会自动关闭。减少动态效果时禁用闲时活动与逐字显示，保留直接拖动及落地。

桌宠展示普通顶层会话，忽略子代理；首次可用会话成为当前对话，之后保持用户选中的关注会话。启动时从正式列表恢复最近最多 100 个普通会话，冷会话无需先在 Harness 中打开即可续接。发送中保留草稿，收到“已进入收件队列”回执后才清空；失败可重试，同一次提交复用请求 ID。切换关注会话不会改变在途消息的目标；会话缺失、其他进程占用、权限限制或模型不可用会明确反馈。接受不代表任务完成。详见[会话续接契约](session-chat-contract.md)。桌面版通过公开的 `dsh://open` 协议唤回 Harness。多个本机客户端同时连接时，返回请求由首先领取的客户端处理。

### 安静模式（新消息只亮信封）

默认关闭。可在 **Settings → 桌宠**、鲸鱼右键菜单或系统托盘中开启；开关沿用 Harness 的偏好保存，重启后仍生效。新版与经典界面均可使用。

开启后，新回复、提问、审批和异常只更新小信封计数，不自动弹回复气泡、互动卡或系统通知；陪伴邀请和反馈也只留在信封中。计数可轻跳一次，系统开启减少动态效果时不跳；鲸鱼原有表情与状态仍正常变化。主动点信封、双击聊天、打开菜单及阅读器照常可用，已打开聊天面板也照常更新回复。

提问仍可在信封内回答，审批仍回 Harness 处理。已读、接受回执与任务结算不变。与关闭“任务通知”不同，安静模式保留“稍后提醒”按钮：你仍可安排提醒，到点仍处于安静模式时只保留待办入口。

关闭安静模式不会补弹积压消息，也不会为旧请求重新启动自动补提醒；关闭后新到的消息恢复原有展示方式。已安排且在安静模式中到期的提醒不再补投；需要重新提醒时可在信封中再点“稍后提醒”。本窗口收到的陪伴卡片按种类合并保留，点开后可选择一起活动、稍后、今天安静或收起反馈；不会修改任务未读。它们不跨窗口重启保存，换角色时清空，关闭自主陪伴时撤去旧邀请。“安静模式”与自主陪伴的“安静陪伴／今天安静”分别控制消息展示和自主邀请。

## 提醒与系统通知

开启任务通知后，角色显示时用动作、表情和互动提示提醒；输入、阅读或拖拽期间先排队，结束后再呈现。最终回复与未读列表独立保留。审批／提问可预览内容、返回源会话或选择“稍后提醒”；限时提问标记“仍可回答”时，回合结束后仍可处理。

补提醒默认开启，等待时间可设为 1–1440 分钟。新的待处理请求自动补提醒一次；“稍后提醒”按当前等待时间重新计时。处理、取消或销毁会话后撤销该请求的计时。历史恢复保留待处理入口，不重放旧提醒。关闭任务通知会停止主动提醒，保留会话状态和未读回复。

系统通知默认关闭。在 **Settings → 桌宠 → 提醒与通知** 开启后，点击 **申请／刷新权限**，隐藏运行中的角色，再发送 **测试系统通知**。Desktop 使用 DeepSeek Harness 的应用身份，本机 `dsh web` 使用浏览器身份；点击通知请求打开源会话。角色关闭、启动中、失败或锁屏／休眠期间暂停主动投递。

网页权限“允许”、已请求和收到显示回执分别表示不同步骤；系统送达需在通知中心核对，并点击检查源会话。macOS 在 **系统设置 → 通知 → DeepSeek Harness** 管理授权；Windows 在 **设置 → 系统 → 通知**，Linux 在桌面通知设置中管理。权限或客户端不可用时，待处理入口仍保留；恢复显示不会补发旧系统通知。

## 本地诊断与可选采样

在 **Settings → 桌宠 → 本地诊断** 提供默认关闭的开关。开启后允许独立采样器读取有限的活动／邀请、队列和存档规模，不上传数据或读取聊天正文。它与自主陪伴独立；观察自主活动前先核对上方开关组合。关闭诊断清空诊断计数并撤下接口，不清除关系存档。

macOS／Linux 可直接运行包内的 Node 脚本，无需开发环境或调试端口。Desktop 默认安装路径示例：

```bash
node "$HOME/.dsh/profiles/desktop/node_modules/@takboo/dsh-coopanion/scripts/sample-companion.mjs" --list
node "$HOME/.dsh/profiles/desktop/node_modules/@takboo/dsh-coopanion/scripts/sample-companion.mjs" \
  --output "$HOME/dsh-companion-samples/trial-unique" --seconds 600 --interval 30 --window 60
```

输出目录须尚不存在。发现多个实例时加入 `--instance <list 显示的实例>`，避免混入测试 profile。采样不操作鼠标、不抢焦点、不截图、不防休眠；重启、休眠缺口和关闭诊断会分段记录。关闭接口时采样器可等待恢复，按 Ctrl+C 结束并写报告。日志默认上限 128 MiB，达到后明确停止，不静默丢弃记录。

上例是可选的十分钟工程采样，每 30 秒一条，首／末窗口各 60 秒，不等同于两小时资源验收。脚本默认间隔为 10 秒，默认时长七天仅是工具参数，体验验证无需采用它。`--seconds` 使用进程的单调时钟；跨系统休眠时墙钟结束可能延后，固定日历截止可增加 `--until <含时区的未来 ISO 时间>`，包括接口不可用时也到期结束；休眠跨过截止则在首次唤醒后停止。前台终端退出或系统重启后不保证继续运行，长时工程任务需独立托管并核对进程；不为此阻止正常休眠。

锁屏和休眠状态分别记录，启用诊断后固定事件计数可识别采样间隔内的锁屏、解锁、休眠与唤醒；缺口仍独立结算，计数不提供精确事件时间。原始数据为 `samples.ndjson`，数据可读时约每分钟更新 `progress.json`，接口不可用等变化写入 `events.ndjson`，结束报告为 `summary.json`。日常模式的 `recorded` 只表示数据已记录；关闭 `roam`、陪伴模式未开启或持续工作占用的时间不能作为自主陪伴有效体验。采样是可选的工程诊断；自然体验通过实际使用和反馈判断，资源报告不能替代体验。Windows 通过命名管道提供诊断接口，独立 OS 资源采样尚未支持。数据范围及鉴权见[诊断契约](diagnostics-contract.md)。

## 新角色

右键角色 → **换个模样** → **导入角色包**，选择包含 `figure.json` 的 API 2 ZIP。预览、试播动作、选择配色或搭配，再点击 **使用角色**。删除正在使用的自定义角色会恢复内置大肥鱼。

`examples/star` 是基于上游 `kit.createBody()` 的最小 SVG 角色，具备共享动作、表情、说话和拖拽。复制目录、修改 id 和素材后打包：

```bash
npm run character:pack -- examples/star paper-star.zip
```

完整工厂接口、资源规则、动作映射及换装说明见 [角色对接文档](characters.md)。内置大肥鱼的 `web/upstream/whale/figure.json` / `model.json` / `figure.js` 展示网格角色的完整实现。内置角色的 id 为 `whale`。

## 破坏式更新

当前版本已移除旧 Canvas 关键帧引擎、`dsh-character` v1 协议、`.dshpet` 包、旧 schema 和转换工具。旧角色不能直接加载，也不提供旧引擎兼容模式；需要重新制作或导入 API 2 包。

桌面版改用独立数据目录 `figures-v2`，旧角色选择恢复为内置大肥鱼。旧 `characters` 数据不会被读取；不再需要时可自行删除。Harness 的会话与配置不受角色数据重置影响。
## 回复、未读与会话保护

异常发生时小鲸鱼用一次“担心”（皱眉、汗滴）提示，未查看期间保持不流泪的担心表情；重复状态刷新不会重播该表情动作。点掉异常后按本机已查看记录恢复空闲，重启也不再为该事件流泪。自动任务、通知、陪伴与 NPC 不调用“难过／大哭”；这两种表情仍可在角色面板中手动预览。异常与待确认均使用温和的担心表情，具体原因由信封条目及标题说明。

桌宠不作出审批，也不单独收集 API Key。聊天始终发给明确选中的关注会话，新建会话和后台任务不会自动切换目标。关注会话进行中时优先展示它的动作；空闲时用动作反映后台工作或确认 / 异常。状态栏图形优先提示任一会话的确认 / 异常，菜单显示详情。

信封直接打开回复与待办收件箱：同一会话的多个未读回合合并展示最新回复，未读数量按会话计算。只有一份回复时展开全文；多份回复显示摘要和各自的 **继续对话 ↗**（在桌宠输入框继续来源会话），审批、提问及异常提供 **去处理 ↗**。全文支持 Markdown 标题、粗体、列表、表格和代码块。阅读不会切换正在聊天的会话；收件箱阅读器可连续读不同会话的结果，并返回收件箱查看新内容。正在阅读的回复不会被新结果替换。保留最近 200 份完整结果，优先淘汰已读；只有本次 Harness 运行中实时完成的回复计入未读，打开历史会话或重启 Harness 不会把旧回复重新标为未读。重启后原始对话仍由 Harness 保存；任务动画根据当前 Agent 的运行状态恢复。

回复气泡展示或自动收起、查看收件箱摘要及收起收件箱均不会标记已读；主动展开阅读、关闭单份回复气泡或通过该回复回到源会话时，确认展示时合并的未读回合。阅读期间新到的回合继续保留未读，旧回合的完整结果仍可通过历史导航查看。通用异常／暂停项点击“去处理／Take a look”后，会清除该轮的信封条目与持续担心／等待神态；相同快照不会恢复，新异常仍会提醒。任务的原始失败／暂停事实保留，查看异常／暂停或关闭对应提示的回执会保存在本机，窗口重载或 Harness 重启后仍然有效。已超时且标记“仍可回答”的提问，点“去 Harness 处理”后也从信封移除并记住；它仍能在原会话中查看与回答。仍在阻塞等待的问题与审批继续保留入口，“稍后”沿用原提醒逻辑。回执最多 1000 条、保留 30 天，损坏时从空开始，旧条目可能重新出现。审批由 Harness 决定；提问按原请求的实际答复或取消结果结算；查看、收起互动提示或打开源会话均不会代替处理请求。


### 回复气泡的开场白

“设置 → 桌宠 → 回复气泡：优先显示开头一段”默认开启。回复有空行分隔的后续内容时，若第一段是不超过 120 个 Unicode 字符的普通文本，气泡只展示这一段，并保留“展开全文”。代码块、表格、列表、标题和超过上限的首段继续使用原有 180 字按句子截断预览；不分段的回复保持原样。关闭设置后气泡完全恢复原有预览。聊天和收件箱摘要仍使用原有预览，正文、已读及完成语义不变。

## 在小信封中回答提问

默认开启 **Settings → 桌宠 → 在小信封里直接回答提问**。展开提问后可查看原问题、补充说明、选项及说明，选择一项后提交，也可在“其他”输入文字；输入其他文字会清除单选，文字只作为答案。整批问题需要逐题回答。提交中禁止再次提交；成功后由原提问结算，条目随实际状态撤下。Harness 与信封同时打开时先回答的一边生效，另一边撤下等待。接受答案不代表模型或 WhaleMaid 任务完成。

审批、多选、计划评审、不支持或过大的问题只提供 **去 Harness 处理**；普通单选也保留此入口。提交失败保留简短提示和入口；十秒未确认不会自动重发，请先检查 Harness。限时问题不会因为展开表单而暂停倒计时；标记“仍可回答”时仍可提交，需该会话的原 Agent 可用。关闭设置恢复 0.4.13 的 Harness 处理路径。

本地隔离测试的 Harness 跳转只走连接的 Web 客户端，不启动日常桌面应用；测试鲸鱼和日常鲸鱼使用不同的数据目录。

## 在游戏中使用

“设置 → 桌宠 → 在全屏应用上方显示”默认开启，Windows／macOS 使用 `pop-up-menu` 层级；关闭后回到原 `floating` 层级。游戏及全屏应用前台运行时，桌宠尽量保持在上方；系统导致的最小化、隐藏或失去置顶会自动恢复，恢复不激活窗口。用户主动隐藏、锁屏／休眠和退出时不会自动弹回。默认不按游戏自动隐藏；本版没有跨应用全屏检测开关。独占全屏、受保护桌面和特定游戏的实际显示仍需实机验证。

如挡住游戏操作，可拖到角落、缩小，或手动隐藏；点击桌宠自身的聊天和菜单仍是正常交互，本项不增加游戏鼠标穿透。窗口状态每两秒轻量核对，正常状态不反复调用显示或置顶。游戏退出后无需重启桌宠。

若再次消失，打开“设置 → 桌宠 → 本地诊断”，复现一次后尽快导出。Windows 的默认安装目录示例（无需开发环境、调试端口或管理员）：

```powershell
node "$env:USERPROFILE/.dsh/profiles/desktop/node_modules/@takboo/dsh-coopanion/scripts/sample-companion.mjs" --list
node "$env:USERPROFILE/.dsh/profiles/desktop/node_modules/@takboo/dsh-coopanion/scripts/export-diagnostics.mjs" --instance <上一步的实例值> --output "$env:USERPROFILE/Desktop/whale-window-diagnostic.json"
```

输出文件须尚不存在。导出为现有 schema 1 诊断快照：最近最多 24 条窗口事件、显示意图、可见／最小化／置顶状态、窗口和工作区 DIP 矩形、缩放比例及有采集时间的角色本地矩形。不读取其他应用的标题或进程名，不含聊天或凭证。关闭诊断清除事件并撤下接口。


### 界面风格

默认使用新版聊天、伙伴菜单和小信封：围裙花边横幅、当前角色头像与配色、指向角色的尾巴。右键桌宠 → 换装扮 → **界面风格** 可切换「新版 / 经典」，沿现有 Harness 设置保存，重启后保留；经典沿用原布局。新版「自主陪伴」用关闭 / 安静 / 互动三段按钮，方向键切换，仍默认关闭；四个开关和一起活动沿用原功能。

双击聊天，输入框支持最多约五行，Enter 换行、Ctrl / ⌘ + Enter 发送；发送失败保留草稿。信封提问默认展开，选择选项或填写「其他」后点击「就这样」才提交；审批仍需回 Harness 处理。新版文字随「文字大小」缩放，配色随角色变化，源码 · AGPL 入口保留。

Interface style: right-click the pet → Dress up → Interface style. New is the default; Classic restores the original layout. The choice is saved through Harness settings and survives restart. Chat drafts, shortcuts, inline question submission and companionship controls retain their existing behavior.


新版细节：关闭的开关使用浅灰轨道与清晰的圆钮边框；上一句话和「看全文」并排，长摘要仍可滚动；会话胶囊使用 SVG 下拉箭头。信封选项整张卡片都可点击，选中后显示主题边框和浅底色，也可用 Tab 聚焦、方向键切换，再点击「就这样」提交；提交中或已处理时选项不可改动。经典模式保持原样。

### 默认聊天对象与大肥鱼专属会话

多个陪伴对话中，只有最新创建的一个显示为置顶「大肥鱼」。保留的历史显示为「大肥鱼（旧对话）」，按普通会话排序，隐藏内部目录。列表选中工作会话会直接打开输入框，可发送后点「回到和我聊天」；没有陪伴会话时，点选仅关闭列表，保持原有行为。当前大肥鱼使用「直接和我说就好，我会在这里回你。」和「发送」，工作会话保留转交提示。「上次的会话」下删除所选会话会选择第一个剩余会话。

在 **Settings → 桌宠 → 双击时默认** 或右键桌宠 → 换装扮 → **双击时默认** 中，提供「和大肥鱼聊天 / 上次的会话」两项选择，默认值为「和大肥鱼聊天」（`defaultChatTarget: 'companion'`）。

- **和大肥鱼聊天（默认）**：当系统存在专属陪伴会话（预设为 `whaledot-companion`）时，双击桌宠直接打开与大肥鱼的专属对话。横幅胶囊显示「和我聊天」，不显示工作目录与项目标签。点击胶囊（「换一段 ›」）可切换到其他工作会话；切换后横幅显示工作会话名与工作目录，并提供「回到和我聊天」快捷入口，方便随时切回大肥鱼。
- **上次的会话**：双击桌宠时沿用上次选择的活跃会话，与 C07 行为完全一致。
- **无专属会话时**：若未安装或未创建专属预设会话，自动退回原有会话直连行为，不影响既有工作流。
- **回复与信封**：大肥鱼专属会话的回复照常进入桌面气泡与信封，来源名称明确显示为「大肥鱼」，省略冗余的项目路径。


### 会话名称

桌宠会话列表、聊天标题、信封、提醒和托盘会同步显示 Harness 的最新会话标题，包括手动改名和自动生成的标题，最多显示 64 个 Unicode 字符。WhaleMaid（原名 WhaleDot）的自动任务会显示「[WhaleMaid] 目标 · 任务」，改名前的旧任务仍是「[WhaleDot] …」。没有有效标题时，仍先显示工作目录名，再使用首条用户消息的前 64 字；消息摘要保留原有行为。当前和以往的大肥鱼专属会话继续显示「大肥鱼」和「大肥鱼（旧对话）」。

### 已归档的会话

在 Harness 里归档的会话（包括 WhaleMaid 自动归档的以往大肥鱼对话）不再出现在桌宠会话列表和托盘里，约 2 秒内同步。正在聊的会话被归档时仍会显示并标注“已归档”，输入框不可用，并提示去 WhaleMaid 面板或 Harness 恢复。恢复后会自动重新出现。已归档会话里没读的回复仍可在信封中阅读。

### 可选的回复情绪表情

在 Harness 的 **Settings → 桌宠 → 回复情绪表情** 中开启「判断回复情绪」，或使用桌宠菜单的同名开关。默认关闭。「判断服务」单独选择 **OpenAI 官方**（默认）或 **OpenRouter**，每次只请求所选服务，不自动切换。切换服务或关闭开关时，尚未返回的旧结果不再播放。不开启或没有对应密钥时，保持原有行为。两者都只调用 Decisions API。

| 判断服务 | 环境变量 | 固定模型 | 接收回复片段的服务 |
|---|---|---|---|
| OpenAI 官方 | `OPENAI_API_KEY` | `gpt-6-luna` | OpenAI |
| OpenRouter | `OPENROUTER_API_KEY` | `openai/gpt-6-luna-decisions` | OpenRouter，再转交 OpenAI |

只发送最终回复的第一段：第一段不超过 120 个 Unicode 字符时只取该段，否则取回复前 200 个字符。不附加用户输入、工具调用及其结果、文件、会话标题或路径等字段；但回复本身可能复述文件、记忆或个人信息，这些内容若在片段中仍会发送，不做语义脱敏。大肥鱼专属对话同样适用。标题以 `[WhaleMaid]` 或旧的 `[WhaleDot]` 开头、首条消息以 `WhaleDot: execute this single task` 开头或已归档的会话一律不发送；已有历史回复不会补发。

推荐做法：在 Harness 的 **Settings → 桌宠 → 回复情绪表情** 中直接填写对应服务的 API Key 并点击「保存密钥」。密钥保存在本机 Harness 的凭据存储中，与模型的 API Key 同处，保存后立即生效，无需重启 Harness；插件设置、`cordis.yml`、浏览器存储或日志中绝不会记录密钥值。点击「清除密钥」可随时从凭据存储中移除。

系统环境变量方式（`OPENAI_API_KEY` / `OPENROUTER_API_KEY`）仍然受支持且优先级更高；当系统中已存在对应环境变量时，设置页将显示为「已设置（来自系统环境变量，只读）」，保存与清除按钮均禁用，需先在操作系统中删除环境变量才能在设置页修改。两个服务的密钥不混用，也不会用另一把密钥兜底，不自动换模型或重试。

设置旁只显示所选服务是否检测到对应密钥，以及本次宿主运行已尝试的次数（含失败，不等于成功或计费次数）。每个最终结果最多一次，两个服务合用每个滚动小时 30 次的额度，3 秒超时；失败、低于 0.5 的置信度或 neutral 均保持原表情。模型价格以 [OpenAI 定价](https://developers.openai.com/api/docs/pricing)与 [OpenRouter 模型页](https://openrouter.ai/openai/gpt-6-luna-decisions)为准；2026-10-25 查证为未缓存输入每百万 token 0.10 美元、输出免费，实际费用取决于片段和问题消耗的 token，缓存费用依服务定价。

表情持续约 2.5 秒后恢复原映射；执行、等待、错误状态立即优先，拖拽和「减少动态效果」期间不播放。安静模式仍播放表情，但不会因此弹出气泡或卡片。原有任务错误仍使用「担心」；只有主动开启本功能后，普通回复明确表达悲伤时才可能由 Decisions 选择 `sad`。自定义角色不支持所选词时忽略。

Reply emotion reactions are optional and off by default. In **Settings → Desktop pet → Reply emotion reactions**, choose **OpenAI direct** (default, `OPENAI_API_KEY`, `gpt-6-luna`) or **OpenRouter** (`OPENROUTER_API_KEY`, `openai/gpt-6-luna-decisions`). Recommended: enter and save the API key directly in the Harness settings card; keys are stored in the local Harness credential store and take effect immediately without restarting. System environment variables are also supported with higher precedence and set the page to read-only. Secret values are never stored in plugin configuration, `cordis.yml`, browser storage or logs. Only the selected Decisions endpoint is called, without provider fallback, credential sharing or model changes. Switching services discards pending reactions from the previous choice.

Only an eligible final reply opening is sent (first paragraph up to 120 Unicode characters, otherwise the first 200 characters). Excerpts may repeat private information; no prompt, tool, file or session metadata is appended. WhaleMaid (formerly WhaleDot) automatic tasks and archived sessions are excluded; companion replies are eligible. Each result is attempted once, with a shared 30-per-rolling-hour limit, a three-second timeout and no retries. The attempt count includes failures. Quiet mode permits the expression without opening panels; task states and reduced motion take precedence. Disable the switch to stop new calls and discard pending reactions.

## 在桌宠里回答审批

“在桌宠里回答审批”默认开启。信封中的“需要批准”事项显示来源会话和可读原因，可选“允许一次”“拒绝”，或“去 Harness 查看”。这等于按下 Harness 原审批卡的按钮，不增加审批策略，也没有“总是允许”。允许按钮在打开面板后 1 秒才可点，默认不获焦点，回车不会允许；拒绝可立即点。

需要至少一个 Harness 窗口（桌面主窗口或已连接 Web 界面）持续运行。客户端插件随窗口启动，不依赖设置页是否打开；连接离线超过 5 秒后撤下可答入口，信封仅提示“请在 Harness 里处理”。重新连接后恢复。多个客户端的同一会话／调用只显示一项，作答交给最近上报的客户端；Harness 先答后桌宠显示“已在 Harness 处理”并移出。

关闭该开关后，客户端不上报审批摘要、不作答，信封仍可打开源会话。摘要只含客户端／卡片／会话／调用身份、工具名、出现时间和最多 600 字的可读原因，除下述命令和目录外，不含其他工具参数。安静模式照常只亮信封；普通模式沿用待处理提醒。菜单和托盘没有审批按钮。

开启 WhaleMaid 日常自动审批后，已自动放行的普通命令不会到达桌宠，危险操作才会进入人工审批。多选提问和计划审阅仍在 Harness 处理。旧宿主没有 rc.3 的公开卡片能力时，仅保留 Harness 入口。


### 审批中的命令与模型说明

bash／pwsh 审批按公开会话事件的精确 callId 取得要运行的 command，可选显示 workdir。信封先显示等宽命令块及目录，再以次要文字显示“模型说明：”；说明来自模型，只作参考。其他工具继续显示原因，并提示去 Harness 查看详情。

命令和目录在宿主端隐去常见密钥／令牌及环境变量赋值中的值，去掉控制字符（保留换行），最多 12 行、500 字符，超出附“…（已截断）”。只下发处理后的 command/workdir，不附 description、justification、超时或沙箱参数。找不到对应调用、JSON 无法解析或 command 缺失时，显示“未能取得命令，请在 Harness 查看”，允许按钮保持禁用，宿主也拒绝允许请求；仍可拒绝或打开源会话。已有的 1 秒防误触与原生 Harness 卡片作答通道不变。
