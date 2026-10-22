# P03 WhaleDot 面板骨架（M0 收尾）

## 前置
F01 已完成。`docs/dsh-api-notes.md` 第 7 项（Web UI 半区）与第 8 项（配置与持久化）是本任务依据。笔记第 7 项留了一个缺口——“布局/侧栏面板注册服务未查证”——本任务先补齐它。

## 目标
在 DSH Web UI 中出现一个 “WhaleDot” 面板（client 半区），由 host 半区提供只读数据。这个面板是后续**唯一可以确认目标、授予/扩大/撤销授权**的界面（安全原则 4），所以**它和 host 之间的通道从第一天起就必须是经过认证的**。

## 第一部分：补充查证（写进 `docs/dsh-api-notes.md` 新增第 10、11 节）

**10. 面板注册**：client 半区如何在侧栏贡献入口、在中栏贡献页面。参考本机 task-board 0.4.3（`src/client/native-panel.tsx`、`plugin-card-seat.ts`，它说“向 shell 的官方侧栏面板列表贡献一行、向布局的中栏座位贡献一页”）与 coopanion 0.4.13 的 client 入口；以 `.dsh-ref/0.2.1-rc.2` 中 `dsh-client-ui-layout`、`dsh-client-ui-sidebar`、`dsh-client-ui-slots`、`dsh-client-modules` 的 README/声明为准。

**11. client ↔ host 的认证通道**——这一项决定安全性，务必查清：
- 笔记第 7 项已确认：`webServer.register` 的自定义 HTTP 路由**由插件自行负责访问控制**。
- 用户的 web profile 把宿主绑定在 `0.0.0.0:3080`（局域网可达，见用户 `~/.dsh/profiles/web/cordis.patch.yml` 的 remote-web-ui 区块，只读查看不要修改）。所以一个不做鉴权的 `/api/whaledot/*` 路由，**局域网内任何人都能调用**；等到 P06/P07 有了“授予权限”的写接口，这就是越权入口。
- 查清楚 DSH Web UI 自己的 client 与 host 之间用的是什么已认证通道：dsh-coopanion 文档说它的方法“使用对应 `/api/coopanion/<endpoint>` 的公开 Connection 载体”，并且 inject 了 `connection` 服务；查 `.dsh-ref` 里 connection / typert / gateway 相关包的 README 与声明，弄清楚插件如何注册一个**只有已认证的 DSH Web UI 客户端才能调用**的方法，以及 host 端如何拿到调用方身份（peer）。
- 结论写成：推荐通道、注册方式、调用方身份如何获得、未认证请求会怎样被拒绝、出处。

## 第二部分：实现

### 1. host 方法 `packages/host/src/panel-api/*`
- **优先使用第 11 项查到的已认证通道**注册方法；只有查不到时才退回 `webServer.register`，而且必须复用 DSH 自身的认证（不允许自造 token 或“只信 127.0.0.1”——局域网绑定下这不够）。两者都做不到就**停下并在回报中说明**，不要交付无鉴权的接口。
- 本任务只实现只读方法：
  - `status`：插件版本、启动时间、数据目录、依赖服务可用性（gateway / commands / userQuestions / approval / permissionPresets / tools）、是否检测到 dsh-coopanion（`ctx.get('coopanion')` 之类的**只读探测**，查证写法；不调用它的任何方法）。
  - `goals`：先返回空数组（P06 接存储后填充），结构用 core 的 `ProjectGoal`。
- 请求与响应都用 zod 校验；错误统一 `{ error: { code, message } }`。
- 处理逻辑抽成纯函数，便于不依赖真实宿主测试。

### 2. client 半区 `packages/host/src/client/*`
- `package.json` 按笔记第 7 项增加 `exports["./client"]` 与 `dsh.client`；按第 10 项在侧栏注册 “WhaleDot” 入口，打开中栏面板。
- 面板三块：
  1. **状态卡**：插件版本、依赖服务可用性（✓/✗ + 说明）、“鲸鱼桌宠：已检测到 dsh-coopanion / 未安装（附链接 https://github.com/takboo/dsh-coopanion ）”。
  2. **目标列表**：空状态文案“还没有目标。之后可以在这里描述一个长期目标，WhaleDot 会在你确认的范围内推进。”（创建按钮禁用，P07 实现）。
  3. **全局开关占位**：“暂停所有自主执行”（禁用，标注“P06 后可用”）。
- 样式用宿主主题变量，不引入 UI 库。

### 3. 语言设置（简体中文 / English）
- **查证**（写进笔记第 12 节）：DSH 自己的界面语言从哪里来——`@deepseek-ai/dsh-client-locale`（用户 profile 里有 `preference: zh` 配置）及 client 端如何读取当前 locale、如何监听切换（参考 task-board `client/locales.ts`、coopanion `src/client/locale-sync.ts` 的用法，以 `.dsh-ref` 为准）。
- **设置项**：插件 `Config` 新增 `language: 'auto' | 'zh-CN' | 'en'`，默认 `'auto'`（跟随 DSH 界面语言；DSH 语言不是这两者之一时回退 `en`）。按笔记第 8 节把它标为可在线编辑的字段（`.volatile()` 或查证到的等价方式），让用户能在 DSH 设置页修改；面板状态卡下方也放一个语言下拉框，修改走同一份配置（经第 11 项的认证通道写入，这是本任务唯一的写操作，只允许改这个字段）。切换后面板**无需刷新**即生效。
- **文案目录放在 core**：`packages/core/src/i18n/`，导出 `Locale = 'zh-CN' | 'en'`、`resolveLocale(setting, hostLocale)`、以及按 key 取文案的 `t(locale, key, params?)`。目录是纯数据 + 纯函数，host（后续发给用户的通知、提问、决策选项）和 client（面板）共用同一份。用测试保证两种语言的 key 集合完全一致，缺 key 时测试失败。
- 范围约定（写进 `docs/core-domain.md`）：语言设置影响 ① 面板文案 ② WhaleDot 发给用户的通知/提问/选项文字 ③ 将来让模型生成给用户看的摘要时要求的输出语言。它**不影响** `ActionIntent`、日志、存储字段与错误 code（这些保持英文标识符）。

### 4. 测试
- i18n：两种语言 key 集合一致；`resolveLocale` 的 auto/显式/回退分支。
- host 方法的纯函数单测；**一条测试证明未认证调用被拒绝**（在通道层能模拟的范围内；做不到就在回报中说明原因和替代验证方式）。
- client 数据格式化函数单测。

## 手工验收（在 `.dsh-dev` 测试 profile 中，写进回报，附截图路径）
1. 侧栏出现 WhaleDot，打开后状态卡显示正确的服务可用性。
2. 装了 dsh-coopanion 时显示“已检测到”；在另一个没装它的测试 profile 中显示“未安装”。
3. 在**未登录、不带 DSH 认证**的情况下，用 `curl` 直接请求面板方法对应的地址，应被拒绝（贴出命令与响应）。
4. 禁用 whaledot 插件后重启，侧栏入口消失，DSH 无报错（“卸载即还原”）。
5. 语言：`auto` 下把 DSH 界面语言在中英之间切换，面板跟随；设为 `en` 后 DSH 是中文时面板仍为英文；重启后设置保留。

## 不做
- 除语言设置外不做任何写操作（创建目标、授权、暂停）——P06/P07 实现。

## 完成标准
笔记第 10、11、12 节完成；测试通过；手工验收 1–4 通过；提交 `feat(host): authenticated WhaleDot panel skeleton`。
