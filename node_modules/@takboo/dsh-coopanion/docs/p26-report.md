# P26 舞台接口与桌宠暂离

Coopanion fork 0.6.0 本地候选。实现位于 `whaledot-local`，供 WhaleMaid 1.6 按 [舞台协议](stage-protocol.md)接入。

## 查证和取舍

| 查证项 | 结论与出处 |
| --- | --- |
| 角色渲染 | `createWhaleBody` 将 `createWhaleFigure` 交给上游 body kit。桌宠与角色设置预览通过 `loadBody` 各自建立一个沙箱角色实例。舞台复用 `createWhaleFigure`、原始贴图、模型及表情参数，直接驱动绘制。普通 Chromium 实测通过。见 [figure.js](../web/upstream/whale/figure.js)、[body-host.js](../web/upstream/body-host.js) 和 [pet.js](../web/pet.js)。 |
| 投递与授权 | 原桌宠由 [figure-server.ts](../src/figure-server.ts) 的回环服务投递，远程 Harness 页面无法使用该地址。DSH 0.2.1-rc.3 和 0.2.2-rc.1 的 Connection 类型支持精确 GET、HEAD 和 POST 路由，载体在请求分发前校验 Host、Origin 与认证。[舞台路由](../src/stage-host.ts) 再校验 owner。见 [DSH Connection](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/README.md)。 |
| iframe 与客户端组件 | 可选客户端组件能共享页面与模块加载，少一次 iframe 文档加载，但与嵌入方处于同一页面权限域。选用透明 iframe，CSP 保持不透明源，只有受限消息跨边界。预先合成单文档可避免沙箱内的认证子资源问题。首帧后最多每秒绘制 30 帧，隐藏和减少动态效果时停止持续绘制。见 [舞台渲染](../web/stage/index.js)、[构建](../scripts/build.mjs) 和 [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)。 |
| 桌宠显示控制 | `desiredVisible` 仍由显示、隐藏等原有命令维护。暂离是独立的内存状态，第一条响应流触发小跳与隐藏，最后一条断开时按当前显示意愿恢复。DSH HTTP bridge 的响应连接关闭会中止请求。见 [宿主控制](../src/controls.ts)、[桌面窗口](../desktop/main.cjs) 和 [舞台路由](../src/stage-host.ts)。 |

## 截图与动作

| 动作 | 实现 | 本机截图 |
| --- | --- | --- |
| 行走 | 原地步态，双腿交替抬落，位置及镜像由舞台变换控制 | `artifacts/p26-stage/walk.png` |
| 坐姿工作 | 现有坐姿下身、双手小幅交替动作、低头及眨眼 | `artifacts/p26-stage/sit-work.png` |
| 睡姿 | 现有闭眼表情、放松坐姿和缓慢呼吸 | `artifacts/p26-stage/sleep.png` |

三个 PNG 为 Chromium 实际渲染的透明截图，保存在本机验收目录。角色贴图、缩略图和默认桌宠行为沿用现有版本。

## 验证记录

Windows x64，Node 24.18.0，npm 11.16.0。修改前在 `cdcf9dc` 完成元数据、构建、类型、单元与浏览器回归。修改后 `verify:metadata`、`build`、`typecheck` 与 `git diff --check` 通过。`npm test` 中 Vitest 350 项通过、11 项沿用原有跳过规则，另有 12 项 Node 测试通过。`test:ui`、`test:inbox-ui`、`test:notification-ui`、`test:n0`、`test:keyboard-native` 和 `test:desktop` 通过。

舞台浏览器检查涵盖来源与版本校验、参数边界、点击与悬停、30 帧／秒预算、隐藏时停绘和减少动态效果。宿主单测检查连接计数、断线与重启清零。

安装候选来自 `62df82c5798e2e8b8754a5411006d47544833048`。`artifacts/p26-verified-package/takboo-dsh-coopanion-0.6.0.tgz` 通过归档校验，含 680 个条目。SHA-256 为 `de331a3445414cf381a99353841500e594bfeb58922501fe45a62647311efec7`，构建绑定见同目录 `verification.json`。

此前安装验证发现 Harness 默认配置的 gzip 会缓冲普通文本长响应。舞台暂离改用未压缩的事件流，浏览器测试同时检查首条回执与响应头。

| DSH 版本 | 同包安装结果 | `artifacts/p26-verified-package/` 中的记录 |
| --- | --- | --- |
| 0.2.1-rc.3 | 通过，使用官方安装命令和隔离 profile | `install-0.2.1-rc.3.json`、`stage-installed-0.2.1-rc.3.json` |
| 0.2.2-rc.1 | 通过，使用官方安装命令和隔离 profile | `install-0.2.2-rc.1.json`、`stage-installed-0.2.2-rc.1.json` |

两版都检查了未认证请求被拒绝、认证 iframe 首帧、首次暂离实际播放一次小跳、关闭最后一个标签页后恢复，以及手动隐藏在离开和返回时保持。完整安装回归也通过了设置持久化、桌宠原生窗口和干净退出检查。

## 验收边界

舞台固定使用内置默认大肥鱼，需要浏览器 WebGL。失败通过 `render-failed` 回报，嵌入方负责回退。舞台文档约 1.72 MB。原生暂离按连接存续，反向代理需要允许流式响应以及向 Harness 传播连接关闭。自定义角色若无小跳动作则只暂时隐藏。
