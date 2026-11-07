# P22 首次欢迎弹窗

## 接入

- Harness 的 `@deepseek-ai/dsh-client-ui-layout` 在 `lib/types/client/index.d.ts` 公开了根级 `shell.overlay`，`AppFrame` 在各主面板之外渲染该浮层。[WhaleMaid 客户端](../packages/host/src/client/index.ts)注册欢迎组件，连接就绪后即可显示。
- [面板 API](../packages/host/src/panel-api/index.ts)通过现有 owner 认证提供 `welcome-status` 和 `welcome-seen`。[WhaleStore](../packages/host/src/store/index.ts)把 `{ seenAt, version: 1 }` 写入数据目录的 `whaledot.db`，使用 `kv_settings` 的 `welcome` 键。旧数据库无需迁移，重复标记保留最早时间，展示只取决于该记录是否存在。
- [欢迎组件](../packages/host/src/client/welcome.ts)跟随插件语言。开始使用、关闭按钮、Esc 和遮罩均可关闭并标记首次欢迎。手动打开只展示介绍。自动弹窗每 2 秒核对一次状态，其他在线客户端关闭后会跟着收起。状态读取失败时静默跳过，写入失败则下次加载仍可显示。
- 原生对话框将焦点移入弹窗，Tab 在交互项之间循环，关闭后回到原先焦点。群号复制失败时可手动选中群号。

## 形象与打包

使用作者提供的原始 GIF，从中取比心帧作为静止图。素材位于 `packages/host/welcome/`。

| 文件                | 用途                             |         大小 |
| ------------------- | -------------------------------- | -----------: |
| `dafeiyu.gif`       | 当前欢迎动图                     | 444,919 字节 |
| `dafeiyu-still.png` | 减少动态效果及动图加载失败时显示 |  64,535 字节 |
| `dafeiyu.webp`      | 可选动图，存在时优先使用         |            — |

[客户端构建](../packages/host/build-client.mjs)将存在的文件内嵌到 `lib/client.js`，逐个检查 600 KB 上限。没有素材时不渲染图片。包检查核对客户端中素材的原始字节和随包的[署名](../packages/host/THIRD_PARTY_NOTICES.md)。

## 验证

| 项目           | 结果                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 基线 `4db47de` | 冻结安装、构建和 1372 项测试通过                                                  |
| P22            | 1374 项测试通过，覆盖持久化、幂等、只读和错误状态、写入失败、owner 认证和中英文键 |
| 检查           | 构建、类型、lint、格式、差异和打包检查                                            |

在 Windows 使用 DSH CLI `0.2.1-rc.3` 启动隔离 profile `whaledot-p02`（端口 3182），通过 Edge 实测。截图在本地 `.dsh-dev/p22-evidence/`。

| 截图                                | 验收                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `01-welcome-zh.png`                 | 新目录在 Harness 首页显示中文 GIF 欢迎页。两客户端同步收起，刷新和重启不重弹。面板可重开，Esc 关闭后焦点返回入口，首次时间保持原值 |
| `02-welcome-en.png`                 | 已有旧版数据升级后显示英文欢迎页，关闭后写入首次记录                                                                               |
| `03-welcome-375-reduced-motion.png` | 375px 深色窗口显示静止帧，内容无横向溢出                                                                                           |
| `04-welcome-no-art.png`             | 无素材仍可显示和点击遮罩关闭。模拟写入失败时界面照常关闭，刷新后再次出现                                                           |

实测还核对了群号复制成功与手动复制提示、Tab 循环及超限构建报错。动画验收使用随附的 GIF。在线同步由轮询完成，取决于客户端连通状态。
