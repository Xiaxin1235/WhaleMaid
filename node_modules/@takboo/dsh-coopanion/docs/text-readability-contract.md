# 文字可读性契约

支持的宿主版本见 `package.json`。持久字段 `textScale` 使用数值 `1`、`1.25`、`1.5`，分别表示 100%、125%、150%；默认 `1`。缺失字段沿用 100%，遵循现有 Harness schema 的空值默认行为；其他值拒绝保存。共享值、默认值与类型见 [text-scale.js](../web/text-scale.js) 和[类型声明](../web/text-scale.d.ts)。

## 配置链路

Harness 的 **Settings → 桌宠 → 文字大小** 使用三档选择框，沿现有 `ConfigForm.set` 保存到 `dsh-coopanion` 设置；只允许本地可写连接修改。Host 读取 volatile 配置，在 `settings/document-updated` 后通过 `PetControls.configure` → `ElectronBridge` → Electron main → 当前 Renderer 发送完整 `options`。初始化与原生恢复使用同一字段。原生层原样转发，不改变窗口缩放或设备比例。

Renderer 将该值设置为 CSS `--text-scale`，对缺失或无效线值保守使用默认档。文字尺寸与角色 `size`（90–240）独立；字号变化不会重建角色 frame 或调用模型。设置标签和说明复用 Client 中英文本地化；桌宠已有中英文文案保持原机制，字号不引入新的消息类别。

## 呈现与状态

缩放覆盖回复气泡、提醒、收件箱、完整回复阅读、会话选择与聊天面板的标题、正文、元数据、输入和主要按钮。用字号和 CSS 正常排版，不用 transform 缩放整个面板。面板宽度受当前 viewport 约束；阅读和收件箱正文可纵向滚动，长代码及宽表格保持横向滚动，按钮允许换行。

配置更新同步重新测量当前位置，`ResizeObserver` 在文字换行、异步布局后再次测量；保持已打开面板的锚点，只按新面板实际宽高夹入当前工作区。未读入口也用其实际尺寸夹入工作区。工作区和跨屏坐标沿用[多屏契约](multi-display-contract.md)，字号本身不改变 DPI 变换。

仅尺寸/字号的 configure 不触发内容 render，不替换阅读 DOM 或捕获的 `readerResult` / `readerQueue`，不切换关注会话，不增加 read/select/chat 动作。新回复继续保持独立未读，阅读正文不被替换。当前 Renderer 的草稿、输入选择、焦点与在途请求 ID 保持；字号切换不发送输入，不清空失败草稿，不延长气泡驻留时间。阅读位置保留现有滚动偏移；字体换行可能改变同一像素偏移对应的文本行。

Host 快照或语言、提醒偏好的正常变化仍走原有 render；字号本身不改变完成判定、接受与去重、恢复、审批/提问结算。Renderer 进程崩溃后的草稿及阅读位置仍会丢失，参见[会话契约](session-chat-contract.md)及[恢复契约](desktop-recovery-contract.md)；不扩展跨进程草稿持久化或自动重放。

## 验证入口

- `tests/plugin.test.ts`：旧配置默认、无效档拒绝、三档与两种角色极值独立，Host 立即发送新配置且不重启原生进程。
- `tests/text-scale-ui.mjs`：320×640、中英文、三档 × 两种角色尺寸，阅读 DOM/滚动位置、代码/表格滚动、阅读中新增回复、收件箱/聊天边界、键盘操作、草稿/选择/焦点、在途接受身份、原气泡计时。
- `tests/desktop.mjs` 与 `tests/helpers/text-scale-native.mjs`：真实 Electron IPC，三档 × 两种角色尺寸 × 中英文的原生工作区定位、捕获正文与草稿。
- `tests/install.mjs`：同一包经支持版本的官方 loader 安装，旧配置默认、正式设置页六种组合持久化及即时同步、原生重启、完整 Host 重启、中英文标签，并保留 完成、会话和恢复回归。

`npm run test:inbox-ui` 包含文字检查；三平台测试和宿主安装矩阵复用这些入口，执行范围以对应 CI 结果为准。


## 回复开场白预览

持久设置 `preferOpeningParagraph` 默认 true，沿现有 ConfigForm → Host → DesktopOptions → Renderer 配置链同步。仅回复气泡调用 `replyPreview(text, 180, preferOpeningParagraph)`；聊天和收件箱摘要显式使用原有模式。第一段由首个空行界定，支持 CRLF；普通文本首段最多 120 个 Unicode 字符且还有正文时完整显示，`long=true` 保留全文入口。Markdown 代码、表格、列表、标题、过长首段和只有一段均回退原算法；关闭设置无条件使用原算法。不改变全文、已读、模型调用或气泡驻留规则。


## 界面风格

`interfaceStyle` 为 `new | classic`，默认 `new`。角色面板选择框通过 preference → Host 白名单 → `settings.mutate('dsh-coopanion', [{op: 'set', path: ['interfaceStyle'], value}])` 保存；完整 configure 及原生重建均携带该值。仅三种面板使用新版布局，经典恢复原 DOM 位置与 C05 样式。切换不重建角色、草稿、捕获正文或在途身份，不自动发送或确认。

新版面板上方空间不足且下方可容纳时放到角色下方，尾巴随之朝上；其他情况优先在上方并夹入工作区。尾巴水平位置夹在圆角内。内层内容滚动，横幅与尾巴保留。所有文字沿用 `--text-scale`；0.85 / 1 / 1.3 是布局压力验证值，不新增持久字号档位。主题底色由原 `--accent` 派生，文字与实心按钮使用同色系加深值，确保白字和说明文字对比度至少 4.5:1。Nunito 字体本地加载，中文回退系统字体。


新版细节打磨仅限 `.redesigned`：关闭态开关为浅灰轨道，轨道/圆钮描边提供至少 3:1 非文字对比度；禁用态另降不透明度。回复摘要和全文入口并排末端对齐，不重叠，摘要保留 130px 上限与内部滚动；隐藏入口后不占位。胶囊箭头为 12px 装饰 SVG，经典模式移除该节点并恢复原文案。

信封保留原生 radio、label、name、禁用状态及全部数据钩子，使用透明的原生控件覆盖卡片作为点击目标，仍参与键盘和屏幕阅读器导航。卡片通过 `:has(input:checked)` 与 `:has(input:focus-visible)` 呈现选中和键盘焦点，提交中/终态沿现有 disabled 锁定；不更改作答、回执或结算。
