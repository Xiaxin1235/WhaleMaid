# C07 新版界面细节打磨

## 完成情况

基于 C06 `1f45a23`，在独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支完成四处打磨。本地提交 `373d30fcc1fd9cebe05f5b69294edb5ce469a323`：`style: polish redesigned switches, reply bubble, chevron and option cards`。版本仍为 0.4.13，未 push、未发布。用户已确认 C06 整体效果，本次四处细节仍待日常目视确认。

| 细节         | 结果                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 关闭的开关   | 轨道 `#d6d8de`，轨道和白色圆钮均以 `#68717e` 描边；开启态保留主题色，禁用态另降不透明度                                                                   |
| 上一句话气泡 | 正文与「看全文」并排、底边对齐，短句减少空白；保留 12px / 14px 内边距、130px 摘要高度上限及内部滚动，隐藏全文入口时不占位                                 |
| 会话胶囊     | 12px 描边 SVG 下拉箭头，路径 `M6 9l6 6 6-6`，`stroke=currentColor`、`aria-hidden=true`；仅新版显示，经典沿用原字符                                        |
| 信封选项     | 未选中为 1px 浅边框白底，选中为 2px 主题边框及 4% 浅色底；透明的原生 radio 覆盖整张卡片，保留键盘、屏幕阅读器、焦点环及原 data 钩子；禁用选项降低不透明度 |

产品改动集中在 `web/redesign.css` 与 `web/panel-style.js`；同步 `docs/usage.md`、文字契约及专项 UI 回归。不改 Host、原生窗口实现、设置协议、作答结算、角色、动画、C05 表情映射或上游资源。`web/style.css` 保持原字节，经典面板在相同浏览器条件下与 C06 基线 PNG 字节一致。

## 验证（命令与关键输出）

| 检查                       | 结果 / 证据                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`        | 通过；`D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/typecheck.log`                                                                                                                                                                         |
| 提交后 `npm run build`     | 通过，commit=`373d30f`、dirty=false，productDigest=`2d2fa15c148c6ba7797b4a876e763e4dba55526222688c8b6ca549458c91b4d9`；`build.log`                                                                                                          |
| `npm test`                 | 单工作进程下通过：251 passed / 11 skipped，另 12 项 Node 测试通过；`npm-test.log`。默认并行的两次运行均只有既有 1000 条原子写入测试超出默认 5 秒；保留 `npm-test-initial-timeout.log` 与 `npm-test-default-retry.log`，未更改测试断言或超时 |
| `npm run test:inbox-ui`    | 完整链通过（exit=0）：43 项 Node UI 测试与 C07 专项、新版、信封三个场景脚本；`inbox-ui.log`                                                                                                                                                 |
| `npm run test:desktop`     | 通过（exit=0）。Windows 物理显示 scaleFactor 与 Renderer DPR 均为 1.25；真实点击、双向聊天、原生选项提交、字号、多屏、隐藏/恢复、角色、陪伴、诊断、回执重启及生命周期均通过。`desktop.log` 与 `*-native.json`                               |
| 新增 `tests/polish-ui.mjs` | 对比度 ≥3:1；三档字号 1 / 1.25 / 1.5 下摘要与全文入口不遮挡、长摘要实际可滚动、按钮隐藏后不预留宽度；SVG 结构；方向键切换后提交真实选项值；卡片边缘点击；提交一次及禁用锁定                                                                 |
| 经典截图                   | chat / menu / requests 三张均与 C06 基线 PNG 字节一致，`polish-results.json` 记录 `identical`                                                                                                                                               |

| 非文字颜色对                    | 对比度 |
| ------------------------------- | ------ |
| `#68717e` 描边 / 白色           | 4.94:1 |
| `#68717e` 描边 / `#d6d8de` 轨道 | 3.47:1 |

前后截图用同一虚构会话、固定时间、1200×900 viewport 和 125% 栅格比例。前图通过只读 Git 引用加载 C06 `1f45a23` 的样式及面板模块；截图时只固定面板坐标，排除角色呼吸造成的子像素位移。未读取或测试日常 profile，没有模型调用。证据均保存在 WhaleDot `.dsh-dev/c07-evidence/`，不提交到产品仓库。

| 细节     | 修改前                                                                                   | 修改后                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 关闭开关 | [before-switches.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/before-switches.png) | [after-switches.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/after-switches.png)                                                                                   |
| 回复气泡 | [before-reply.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/before-reply.png)       | [after-reply.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/after-reply.png)                                                                                         |
| 下拉箭头 | [before-chevron.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/before-chevron.png)   | [after-chevron.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/after-chevron.png)                                                                                     |
| 选项卡片 | [before-options.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/before-options.png)   | [after-options.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/after-options.png)、[选中态](D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/after-options-selected.png) |

经典对照为同目录的 `before-classic-chat/menu/requests.png` 与 `after-classic-chat/menu/requests.png`。

## 偏离与待确认（含对 DSH API 的假设与出处）

没有新增 DSH API 或设置项，没有新的 API 假设。沿既有 DOM、原生 radio 和回执链路工作；配置与线协议不变。接口背景见 `D:/dsh_plugins/WhaleDot/docs/dsh-api-notes.md`，本次没有扩展其契约。

选项采用「透明原生 radio 覆盖整卡」的视觉隐藏方式，未用 display:none，也未另做键盘或提交逻辑；保留原生焦点及 disabled。未增加可选的自绘勾号，选中由 2px 主题边框和浅底色表达。正文与全文按钮在同一横向布局内末端对齐，保留独立摘要滚动区与至少 32px 的按钮触达区域。

## 需要用户目视确认的项目

请完全退出日常 Harness，再从开始菜单重开，确认新版下四处细节：关闭开关是否更轻；短回复是否紧凑；下拉箭头是否清楚；选项卡片的选中、焦点和提交中状态是否自然。经典风格可作为对照。本次浏览器截图与原生自动化不记作用户日常目视确认。

## 已知问题 / 下一步建议

日常目视确认仍待用户完成。默认并行的单元运行在既有 1000 条磁盘写入测试处对本机负载敏感；用以下临时环境变量限制到一个工作进程后，全套通过，原测试断言及默认 5 秒超时保持不变，没有修改产品测试配置：

```powershell
$env:VITEST_MAX_FORKS='1'; $env:VITEST_MIN_FORKS='1'
$env:VITEST_MAX_THREADS='1'; $env:VITEST_MIN_THREADS='1'
npm test
```

这些变量仅用于本次测试终端。证据身份和检查结果见 `D:/dsh_plugins/WhaleDot/.dsh-dev/c07-evidence/manifest.json`。没有手动启动额外 DSH 宿主；原生脚本已清理自己的窗口及临时目录。本次未扩大到其他布局或功能修复。
