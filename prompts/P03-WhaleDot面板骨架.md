# P03 WhaleDot 面板骨架（M0 收尾）

## 前置
P02 已完成，`docs/dsh-api-notes.md` 第 7 项（Web UI 半区）与第 8 项（配置与持久化）已有结论。**本任务所有 client 半区与路由写法以该笔记为准**；笔记里标“未找到”的部分先停下，在回报中说明，不要猜。

## 目标
在 DSH Web UI 中出现一个 “WhaleDot” 面板（client 半区），由 host 半区提供只读数据。这个面板是后续**唯一可以确认目标、授予/扩大/撤销授权**的界面（安全原则 4），本任务先搭骨架。

## 要做的事

### 1. host 路由 `packages/host/src/panel-api/*`
- 按笔记中的 DSH 机制注册路由（如 `ctx.webServer.register`），命名空间 `/api/whaledot/*`。
- 本任务只实现只读接口：
  - `GET status`：插件版本、启动时间、数据目录、依赖服务可用性（gateway / commands / userQuestions / tools 门禁）、是否检测到 dsh-coopanion 服务（`ctx.get('coopanion')` 之类的**只读探测**，查证写法；不调用它的任何方法）。
  - `GET goals`：先返回空数组（P06 接存储后填充），响应结构用 core 中的 `ProjectGoal` 类型。
- 所有响应用 zod 校验后再发出；错误统一 `{ error: { code, message } }`。
- 路由只接受来自 DSH Web UI 自身的请求（沿用 DSH 的鉴权/同源机制，查证并在笔记补充；不要自己开新端口）。

### 2. client 半区 `packages/host/src/client/*`
- 按笔记与 task-board/dsh-pet 的写法，在 DSH 侧栏注册一个 “WhaleDot” 入口，打开中栏面板。
- 面板三块：
  1. **状态卡**：插件版本、依赖服务可用性（✓/✗ + 说明）、“鲸鱼桌宠：已检测到 dsh-coopanion / 未安装（附安装说明链接 https://github.com/takboo/dsh-coopanion ）”。
  2. **目标列表**：空状态文案“还没有目标。之后可以在这里描述一个长期目标，WhaleDot 会在你确认的范围内推进。”（创建按钮先禁用，P07 实现）。
  3. **全局开关占位**：“暂停所有自主执行”开关（先只做 UI，禁用并标注“P06 后可用”）。
- 中文/英文文案走 DSH 的 locale 机制（参考 task-board `client/locales.ts`），默认中文。
- 样式遵循宿主主题变量，不引入 UI 库。

### 3. 测试
- 路由处理函数单测（不依赖真实 webServer：把 handler 抽成纯函数）。
- client 半区至少对数据格式化函数做单测。

## 手工验收（写进回报，附截图路径）
1. 测试 profile 启动 DSH Web UI，侧栏出现 WhaleDot，打开后状态卡显示正确的服务可用性。
2. 安装与未安装 dsh-coopanion 两种情况下，状态卡显示对应文案。
3. 禁用 whaledot 插件后重启，侧栏入口消失，DSH 无报错（“卸载即还原”）。

## 不做
- 不做任何写操作（创建目标、授权、暂停）——P06/P07 实现。

## 完成标准
测试通过；手工验收 1–3 通过；提交 `feat(host): WhaleDot panel skeleton in DSH Web UI`。
