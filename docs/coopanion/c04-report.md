# C04 信封已处理条目的重启恢复修复

## 完成情况

2026-10-23，基于 C03 `399ad8f`，在独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支实施；最终提交和验证结果见下表。版本保持 0.4.13，未 push、未发布。日常 profile 已由用户链接本仓库，本次没有在日常 profile 测试，也没有替换其安装或修改其数据。

异常／暂停的“去处理”、源会话查看及关闭对应当前异常提示，会记录本机呈现回执；continued 提问打开源会话或关闭含该请求的提示后也会记住。仍在等待的 open 提问和审批不写入这种回执，原有“稍后”逻辑保留。关闭整个收件箱不代表逐条处理，回复保持既有已读规则。

| 项目         | 实现                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| 异常身份     | 完整 sessionId + issue + 结束类别 + turn + 持久事件 seq；不依赖文案和 Renderer 修订         |
| 超时提问身份 | 完整 sessionId + continued + 原 native callId                                               |
| 本机存储     | Electron userData 下 `inbox-receipts-v1.json`，schema 1，仅身份与查看时间                   |
| 保留范围     | 最多 1000 条，30 天过期；加载、读取键及写入时清理                                           |
| 写入与恢复   | 串行写入，同目录临时文件原子 rename；退出等待已接收写入；损坏从空开始，写入失败保留原有效档 |
| 信任边界     | main 仅接收可信主 frame，且键必须符合当前可查看的异常或 continued 请求                      |
| 新事件       | 同一会话的新回合/序号或新 callId 正常提醒                                                   |
| 事实状态     | 不改任务结果、未读回复、审批结果、提问投影或 Host 托盘事实，不发送回答或批准操作            |

实现、测试、中文 usage 与提醒/恢复契约同步；没有新增设置、动画、素材或 DSH API。AGPL 实现留在 companion 仓库，WhaleDot 只保存本报告、测试宿主辅助参数和本地证据。

## 验证（命令与关键输出）

| 检查                    | 结果                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| companion 提交          | `75a6b1f65dcbcc43b33fcfff79d138a382ee5765`：`fix: remember dismissed inbox items across restarts`                                                              |
| `npm run typecheck`     | 通过                                                                                                                                                           |
| `npm run build`         | 最终提交后构建通过，commit=`75a6b1f`、dirty=false                                                                                                              |
| `npm test`              | Vitest 244 passed、11 skipped；Node release/client 11 passed、locale 1 passed                                                                                  |
| `npm run test:inbox-ui` | 全套通过；新增“查看 continued 后移除、同会话新 callId 正常出现”断言                                                                                            |
| 专用原生重启测试        | `node tests/inbox-restart-native.mjs` 通过：真实 main/preload/Renderer IPC、落盘、完整 Electron 进程重启、open/approval 保留、新异常出现、关闭当前异常提示落盘 |
| `npm run test:desktop`  | **125% 缩放下全套通过**：全屏焦点/可见性、多屏/OS 输入、字号、陪伴、NPC、诊断、C04 重启、生命周期、崩溃恢复、聊天通知及角色持久化                              |
| 存储单元测试            | 1002 次串行原子写后保留 1000 条；重建 Store 读取一致；30 天到期；坏 JSON/无效键恢复；临时文件清理                                                              |
| 恢复集成测试            | PetModel 与 NotificationBroker 从六类历史恢复，已查看项被投影隐藏，原 pending 请求仍存在；新异常不被旧回执覆盖                                                 |

前三次原生全套在既有 OS 光标断言处失败，诊断样例为目标 `(396,366)` DIP、回读 `(400,392)`；原始失败日志均保留。用户回复“现在可以测试”并暂停输入后，全套通过。没有改动光标转换或放宽断言，仅给原断言补充坐标信息；先前失败不记为通过。测试结束已通知用户恢复输入。

正式原生诊断产物记录已测构建 `43e83f7`；最终 amend 只纳入上述测试断言的失败坐标信息，产品源码未变。最终构建与已测诊断的 productDigest 均为 `55039e88810e8fc740fef2078ff7e67726c8cf81d03728de0ae53f5c2ca7b297`，原始证据不改写提交身份；manifest 另列最终源码摘要。

按当前**权威状态**分组的重启规则与受控测试结果：

| 类别             | C03 查看后再恢复 | C04 查看后再恢复           | 证据                                                            |
| ---------------- | ---------------- | -------------------------- | --------------------------------------------------------------- |
| 回复             | 不重新未读       | 不重新未读                 | 真实宿主、恢复测试                                              |
| 异常             | 重新出现         | 不出现                     | 真实宿主完整重启、原生进程重启                                  |
| 暂停/blocked     | 重新出现         | 不出现                     | 真实宿主完整重启、原生进程重启                                  |
| continued 提问   | 保留入口         | 已查看的同一 callId 不出现 | 真实宿主完整重启、原生进程重启；Host 投影仍为 continued         |
| 仍为 open 的提问 | 保留入口         | 保留入口                   | Broker restore + 真实原生进程重启；完整宿主中的状态修复见下一节 |
| 仍未结审批       | 保留入口         | 保留入口                   | Broker restore + 真实原生进程重启；完整宿主中的状态修复见下一节 |

真实宿主使用 `scripts/dev-host.ps1 -Profile c04 -UseUiKey -TestHome D:/dsh_plugins/WhaleDot/.dsh-dev/c04-host-v9`，独立 DSH_HOME、独立 pet-data、Web 界面、测试 profile 链接本地插件。为避免旧夹具影响历史恢复，辅助脚本新增可选 TestHome 参数，只允许 `.dsh-dev` 的子目录，默认路径与默认行为保持。

最终夹具通过官方 `sessionController.create`、`session.append`、`sessions.flush` 生成六类虚构会话，不调用模型；正常构建加载于真实 Desktop 0.2.1-rc.2 服务。测试通过 CDP 操作隔离桌宠的真实 DOM 和 preload，不把浏览器 mock 当作原生证据。

修复前完整宿主重启的正式记录为 `before-dismiss-v9.json` 与 `before-restart-v9.json`：六类最初均有入口；查看后回复/异常/暂停移除，三种请求保留；完整重启后回复仍已读，其余来源入口重新出现。修复后 `after-dismiss.json`、`after-restart.json` 记录已查看的当前异常及 continued 来源不再出现；`receipts.json` 记录真实磁盘回执，`after-restart-host-state.json` 证明两个 continued 仍在 Host 投影中，并未被回答或结算。`inbox-restart-native.json` 则记录仍 open/approval 的两个入口跨原生进程重启保留。

证据目录：`D:/dsh_plugins/WhaleDot/.dsh-dev/c04-evidence/`。正式证据以最终 manifest 列表为准，早期夹具失败记录不作为通过依据。

## 偏离与待确认（含对 DSH API 的假设与出处）

完整宿主测试中，Harness 对夹具的未完成回合进行了自己的恢复修复：原 open 工具调用转为 continued，原审批所属回合转为 interrupted。后续用户“去处理”看到的是这些新状态，C04 按实际状态记录回执。因此不能把那两个来源重启后不出现，宣称为“仍 open 或仍审批的请求被隐藏”；仍待处理的保留规则由独立 Broker restore 和真实 Electron 重启测试验证。真实模型长时间等待跨 Harness 完整退出的场景未用付费模型重复制造，日常体验请用户确认。

早期手工夹具缺少消息 id/source、完整 request header、step 和工具广告生命周期，触发宿主日志校验失败；已补齐并在新的独立目录重建。最终 v9 的六份日志全部经 `sessionQuery.observeSession` 读取验证，见 `restored-sessions.json`。共享 `.dsh-dev/sessions` 下本次创建的 32 个早期夹具目录及其派生缓存已移至本任务证据隔离区保留原字节，未改其他会话；见 `fixture-quarantine.json`。

新增本机回执没有改变 NotificationBroker.restore 的请求事实，仅在 Renderer 的注意力投影和信封过滤中应用。读取 Harness 历史不产生回答；continued 的答复仍走 C01 已核验的原公开请求，审批仍由 Harness 处理。

API 出处：WhaleDot `docs/dsh-api-notes.md` 第 20 节；`.dsh-ref/0.2.1-rc.2/@deepseek-ai/dsh-session/README.md` 的 create/append/flush；同版本 `dsh-api-session-controller` 和 `dsh-session-query` 类型声明。测试夹具另核对本机 Desktop asar 中公开 userQuestions 投影与日志格式实现，未臆造接口。产品没有导入测试夹具，日常启动不会制造这些会话。

## 需要用户目视确认的项目

用户只需**完全退出 Harness 与旧桌宠，再从开始菜单重新打开 Harness**。日常 profile 已使用 link，无需重新安装，不要从设置了测试 DSH_HOME 的终端打开桌面应用。

| 操作                                       | 预期                                                |
| ------------------------------------------ | --------------------------------------------------- |
| 点掉一个异常/暂停项，退出重开              | 该轮不再出现                                        |
| 查看一个标记“仍可回答”的超时提问，退出重开 | 同一提问不再回到信封；原 Harness 会话仍可查看和回答 |
| 在同一会话产生新的异常或新问题             | 新条目正常提醒                                      |
| 只查看仍在等待回答的问题或审批，或点“稍后” | 未结入口保留，“稍后”仍按原逻辑提醒                  |

本次没有请求用户目视确认 C04 条目；上表是日常实机待确认项，原生 DOM 和文件证据分别记录。

## 已知问题 / 下一步建议

已有旧窗口内的查看记录没有历史存档可迁移；升级后仍出现的旧异常需要再查看一次，此后按新规则保留。回执到期、超过容量被淘汰或存档损坏时旧条目可能重新出现，Harness 的原始内容不会丢失。关闭整个信封面板只收起界面，不批量标记条目。

测试宿主与测试鲸鱼均已停止，3182/3183/9494 测试端口关闭，原测试 profile 中本次添加的夹具 overlay 已移除，其余设置保留；见 `cleanup.json`。独立 C04 目录和证据保留供复核，日常 profile 未用于测试。
