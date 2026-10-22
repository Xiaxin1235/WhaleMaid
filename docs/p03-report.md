# P03 WhaleDot 面板骨架验收回报

执行日期：2026-10-21（America/Los_Angeles）。目标宿主：本机 Desktop 0.2.1-rc.2 / Cordis 4.0.5。

已交付认证面板、两个只读方法和唯一语言写方法、core 双语目录、原生设置页，以及 API 笔记第 10–12 节。
所有测试使用仓库专用 `.dsh-dev`，新建 `whaledot-p03`（3183，无桌宠）与 `whaledot-p03-pet`（3184，有桌宠）profile。
没有向用户 profile 安装插件或修改其 LAN 配置，没有提交模型请求、创建目标、授予权限或执行自主任务。

## 实现与认证边界

| 项目     | 结果                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 面板注册 | `sidebar.panellist` + `main`，共同使用 whaledot；使用 shell 的选择、布局、卸载机制                                                             |
| status   | version、startedAt、dataDir、6 项依赖可用性；只读 `ctx.get('coopanion')` 检测桌宠                                                              |
| goals    | 按 core `ProjectGoal` schema 返回空数组                                                                                                        |
| language | strict `{language: auto                                                                                                                        | zh-CN | en}`，只更新本插件 Loader 条目的 language，保留 revision 冲突检查 |
| 通道     | Connection exact Fetch routes `/api/whaledot/{status,goals,language}`；复用宿主认证及 owner 限制；方法端从 `admit(request)` 获取真实 live peer |
| 错误     | `{error:{code,message}}`，Connection result 另有协议要求的 `ok` 与 `details:{}`；认证层保留原生 HTTP 401/403                                   |
| 面板     | 状态、空目标列表、创建按钮禁用、全局暂停禁用并标 P06 后可用；宿主主题变量，无额外 UI 库                                                        |
| 语言     | core 纯字典/纯函数；auto 跟随 DSH，显式值覆盖；原生设置页和面板共用持久化 Config                                                               |
| 配置同步 | 本面板写成功即更新，宿主 locale 切换通过订阅即时生效，其他客户端/设置页的配置修改由每 2 秒的只读刷新同步                                       |

实际联调发现 `connection.rpc.handle()` 虽在声明中公开，但在本版 Loader 插件上下文因内部 webServer 注入检查失败。
最终采用同版 coopanion 使用的 `connection.fetch.register()`；它仍是宿主认证通道，没有退回裸 webServer 路由。
查证依据、peer 语义、token/Cookie 交换与出处详见 [API 笔记](dsh-api-notes.md)。
临时诊断仅编辑忽略的 lib 产物，最终 build 已清除诊断字符串。

## 自动检查

| 检查                      | 结果                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`              | 通过（core、host、浏览器工厂 bundle）                                                                                         |
| `pnpm test`               | 350 项通过 / 11 个测试文件；包含字典 key 一致性、locale 分支、方法校验、越权拒绝、语言窄写、client 格式化                     |
| 真实 Connection HTTP 单测 | 使用实际 DSH Connection 实现与实际 loopback HTTP：无 Cookie → 401 且未进入业务；宿主签名 Cookie → 正常结果；跨源 Origin → 403 |
| `pnpm typecheck`          | 通过，包含测试文件                                                                                                            |
| `pnpm lint`               | 通过                                                                                                                          |
| P03 涉及文件格式检查      | 通过                                                                                                                          |
| 全仓 `pnpm format:check`  | 未通过：并行工作留下的 `docs/p02-report.md`、`packages/core/src/goal-graph.test.ts` 尚未格式化；未改动或纳入 P03 提交         |

身份负例还覆盖 missing peer、已销毁 peer、非 owner、试图在 payload 伪造 peer。语言接口拒绝额外字段（如 dataDir/paused），无创建目标或暂停写方法。
测试中的身份和凭据存储均为隔离夹具，既不读取用户凭据，也不保存测试 Cookie/token 到提交内容。

## 真实浏览器验收

所有截图均在 `D:\dsh_plugins\WhaleDot\.dsh-dev\p03-evidence\`；以下列文件名。

| 验收项            | 实际观察                                                                                                                        | 截图/记录                                              | 状态                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| 1. 侧栏/中栏/状态 | Edge 中出现 WhaleDot，点击打开中栏，version 0.0.0、6 项依赖均 ✓，dataDir 可见                                                   | `panel-auto-zh-no-pet.jpg`                             | 通过                 |
| 2a. 没有桌宠      | whaledot-p03 显示“未安装”和 GitHub 链接                                                                                         | `panel-auto-zh-no-pet.jpg`                             | 通过                 |
| 2b. 有桌宠        | whaledot-p03-pet 链接真实 @takboo/dsh-coopanion 0.4.13，显示 dsh-coopanion detected；该测试配置 autoStart false，只检查安装探测 | `panel-pet-detected.jpg`                               | 通过                 |
| 3. 无认证请求     | 对 status、goals、language 的 curl POST 均收到 HTTP 401 unauthorized                                                            | `unauthenticated-curl.txt`                             | 通过                 |
| 4. 禁用后重启     | 设置 whaledot disabled true，停止并重启同 profile，Edge 刷新后 WhaleDot 按钮数为 0，会话 UI 正常                                | `plugin-disabled-after-restart.jpg`                    | 通过（插件卸载边界） |
| 5a. auto 跟随     | auto 下在 DSH 通用设置中 English → 中文 → English，面板同步切换，无页面刷新                                                     | `panel-auto-zh-no-pet.jpg`（中文状态）；过程由 AX 核对 | 通过                 |
| 5b. 显式覆盖      | DSH 中文，面板选择 en 后保持英文                                                                                                | `panel-explicit-en-host-zh.jpg`                        | 通过                 |
| 5c. 设置页同源    | DSH 设置中 WhaleDot 页面把 en 改 auto，面板同步回中文；之后设置页改回 en                                                        | `native-settings-language.jpg`                         | 通过                 |
| 5d. 重启保留      | 停止再启动宿主，DSH 中文但面板仍英文、下拉为 English；profile patch 中 language en                                              | `panel-en-after-restart.jpg`                           | 通过                 |
| 禁用占位          | 创建目标按钮和暂停复选框不可操作，暂停标 Available after P06                                                                    | `panel-disabled-placeholders.jpg`                      | 通过                 |

禁用验收时宿主页面和会话导航正常，没有新增 WhaleDot 异常。隔离 home 原有的 DeepSeek 账户探测仍可出现 403 或 202/parse-json 错误，
因此这里不宣称“宿主所有后台日志完全无错误”；这些与 WhaleDot 是否启用无关，不影响面板验收。

未认证验证命令（不带 Cookie、Authorization 或启动 token）：

```powershell
curl.exe -s -i -X POST http://127.0.0.1:3183/api/whaledot/status `
  -H 'Content-Type: application/json' `
  --data '{"type":"client-request","rpcId":"p03-anon","method":"whaledot/status","payload":{}}'
```

响应为 `HTTP/1.1 401 Unauthorized`，body 为 `unauthorized`；goals 和 language 地址结果相同。
原始启动日志可能含宿主签入 token，全部留在忽略目录，不提交也不在报告中粘贴。
验收后恢复无桌宠测试 profile 的启用配置并停止本轮启动的两个测试 Host；未停止用户的 3182/P02 宿主。
