# P06 存储、授权范围与全局暂停验收回报

执行日期：2026-10-22（America/Los_Angeles）。依据 `00-通用上下文.md`、P06、产品规划及
`docs/架构与开发路线.md`；工程取舍以架构为准。

## 完成情况

| 模块          | 实现                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第零部分      | 独立提交 `efabf7a`：`fix(host): file-based debug logs for signals and host events`；atomic-write 改为 `^0.2.1-rc.2`                                             |
| debug-log     | RunSignal 窄字段 JSONL、独立 host.log；开关仅控制信号；1 MiB 轮换 `.1`，每类最多两份；不记录 raw/消息/参数/结果                                                 |
| store         | node:sqlite、WAL、外键、5000 ms busy timeout；独占锁与死 PID 接管；有序事务迁移、一致备份及保留五份；全部十二张表（含 schema_migrations）                       |
| 仓储          | GoalRepo、ScopeRepo、TaskRepo、TransitionRepo、RunRepo；core schema 逐行验证，坏行跳过、日志与去重计数                                                          |
| 状态迁移      | core.transition → 版本 CAS → 审计插入，同一事务；新任务仅能以 PENDING/v0 写入，无直接状态更新仓储方法                                                           |
| scope-service | 已认证 live owner grant/revoke；SHA-256；新 id/supersedes、旧版 superseded；替换与目标 scopeId 绑定原子提交；撤销后 Cordis 事件；每次查 active scope 都重验摘要 |
| 全局暂停      | kv_settings 的 autopilot.paused，默认 false，持久化完成后响应；损坏/不可用保守暂停                                                                              |
| 面板          | goals 读真实仓储；status 增加 store/paused；strict set-paused/revoke-scope；存储状态、坏行计数与可用暂停控件；core 中英目录                                     |
| API 笔记      | 第 8 节补 logger 实际 exporter/buffer 去向；第 13 节记录 DSH 存储服务调查、事务存储和新增插件事件                                                               |

未创建目标或执行自主任务；grant 仅提供服务和测试，尚无公开面板创建入口。其余业务表仅建表，
P04/P05 的通知与建议仓储不在本次实现范围内。

## 自动验证

| 命令                | 结果 / 关键输出                                                  |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm -r build`     | core、host、浏览器 bundle 通过                                   |
| `pnpm -r test`      | core `327 passed`，host `56 passed`，合计 383 项 / 15 个测试文件 |
| `pnpm lint`         | 通过，`eslint . --max-warnings 0`                                |
| `pnpm typecheck`    | 通过，包含测试文件                                               |
| `pnpm format:check` | 通过，`All matched files use Prettier code style!`               |
| `git diff --check`  | 通过                                                             |

新增测试覆盖：连续启动迁移幂等、迁移失败的 DDL/数据回滚及降级、备份保留五份、备份包含
尚在 WAL 的已提交数据；活 PID 只读、死 PID 接管、两个真实子进程争用（新锁/旧锁各一次）；
CAS stale-version、SQL 更新零行、审计插入中途抛错回滚；JSON/schema/索引损坏跳过计数；
关闭再打开后的数据与暂停保留；owner 限制、grant/hash、不可变授权版本替换及失败回滚、
真实 Cordis 撤销事件、所有合法 ActionIntent 在撤销后 deny、篡改摘要/内容后无授权。

真实 DSH Connection + loopback HTTP 测试同时覆盖 status、set-paused、revoke-scope：
未认证 401 且业务未执行、宿主签名 Cookie 的 owner 请求、额外字段拒绝、跨源 Origin 403。
superseded scope 对所有合法动作 deny，isPathAllowed 同样拒绝非 active。

## 第零部分人工流程复验与真实浏览器验收

使用 `scripts/dev-host.ps1 -UseUiKey` 启动已有隔离 profile `whaledot-p02`，端口 3182；
仅使用该测试 UI 已存的 Key，没有读取/输出 Key，也没有改用户 profile。
目标为 Desktop 自带 CLI 0.2.1-rc.2 / Cordis 4.0.5；真实 Electron 宿主已加载新 SQLite 存储。

| 验收             | 实际观察                                                                                            | 证据（相对仓库）                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 加载日志         | `plugin loaded` 写入 host.log；各次启动均有记录，无 WhaleDot 降级记录                               | `.dsh-dev/p06-evidence/host.log`；运行文件 `.dsh-dev/whaledot/debug/host.log` |
| 一次真实工具轮次 | 新建测试会话，只提交一次“读取 README 前五行，只回标题，不修改、不联网”；UI Completed，回复 WhaleDot | `.dsh-dev/p06-evidence/read-turn-completed.png`                               |
| 信号落盘         | 同一 session 的 turn-start → tool-call(read) → tool-result → turn-end(completed)，仅四条窄字段 JSON | `.dsh-dev/p06-evidence/signals.jsonl`                                         |
| 存储面板         | Available、Corrupt records: 0，空目标文案保持，创建目标禁用                                         | `.dsh-dev/p06-evidence/panel-paused.png`                                      |
| 暂停控件         | 复选框可操作；选中立即生效，浏览器刷新仍选中                                                        | 同上                                                                          |
| 宿主重启         | 停止本轮宿主，再用同一脚本/profile 启动；存储仍 Available，暂停仍选中                               | `.dsh-dev/p06-evidence/panel-paused-after-restart.png`                        |

会话 id：`session-4cd318c6-67a2-4594-b89b-310e36feaab3`；真实发送一次，无重试。
复验后将测试暂停值恢复为原来的 false，并停止本轮启动的测试宿主。
另一次启动核对该 false 值及控件可见状态，截图为 `.dsh-dev/p06-evidence/panel-final.png`，
核对后同样停止测试宿主。
原始启动输出可能含 DSH 登录 token，留在忽略的 `.dsh-dev/`，不粘贴、不提交。
截图与原始信号同样只保留在忽略目录，报告保留定位信息。

## 偏离与待确认

| 项目                   | 结论                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 产品规划的独立桌宠 F01 | 与架构冲突，遵照架构：WhaleDot 不实现桌宠、不复制或导入 AGPL 代码/素材，仅探测公开服务                          |
| DSH 存储选型           | 本机只有 storage/storage-domain/storage-json；README 明确无跨表事务与自动迁移，不符合 P06，因此保留 node:sqlite |
| 授权摘要               | 沿用 P01 摘要包含生命周期字段的约定；合法撤销/替代时重算摘要，原授权字段不变；无须改变 core 原有摘要契约        |
| 新 API 假设            | 无未查证 DSH API；scope-revoked 是 WhaleDot 自定义 Cordis 事件，emit/on 出处见 API 笔记第 13 节                 |

## 已知问题 / 下一步建议

- 进程若恰在死锁回收期间崩溃，可能遗留 `whaledot.lock.reclaim`；系统保守只读。停止相关
  宿主、人工确认没有写者后才能清理该标记。格式不明的锁、PID 存活但无法确认归属也不自动抢锁。
- 只读实例不会在原写者退出后自动升级为写者，需要重启插件/宿主；这避免后台擅自接管。
- 目标录入及授权确认界面继续由 P07 实现，运行会话撤销中止与调度器暂停检查分别接 P08/P10。
