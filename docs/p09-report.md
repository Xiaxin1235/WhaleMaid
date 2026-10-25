# P09：独立验收、范围守卫与决策

日期：2026-10-22。依据 `00-通用上下文.md`、`P09-独立验收与决策.md` 与架构路线实施；本轮没有连续调度、鲸鱼通知投递或合并回用户分支。

## 完成内容

| 范围             | 结果                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第零部分独立提交 | `e6e6f42 fix(core,host): enforce path scope on read-only shell commands`；只读 shell 路径解析、保护名称、realpath 与运行结束缓存清理，提交时 518 项测试通过 |
| core             | vitest/jest/pytest/mocha 摘要解析；独立 judge/decide；回归、分母缩小、删测试、skip/only、验收配置及相关 scripts 篡改识别；进展和修复预算                    |
| host 执行器      | 精确确认命令、Windows cmd 传输引号、环境白名单、整树超时、2 MiB 日志上限及哈希；外部 detached 基线 worktree 与缓存、清理；全局验收队列，与模型执行互斥      |
| 编排与证据       | CAS 迁移、失败摘要进入下次提示词；先保留 failed 引用，再在专属 whaledot 分支回滚；UNKNOWN 核对只读会话，不激活或重发                                        |
| 决策与持久化     | 迁移 v3 新增 verification 表；Notification/Suggestion 落库、24 小时过期、任务版本绑定、单次处理；人工接受有明确 user 来源和“未经自动验收”说明               |
| 面板             | 命令基线/当前状态、可识别计数、耗时、受限日志尾部、判定与进展；验收/核对、人工决策与 diff 预览；中英文文案                                                  |

第零部分之后还补齐了实际 cwd 下的 `../file` 解析，以及 workspace-write 中未识别语法的精确命令授权回退；危险命令分类不能被确认字符串覆盖。只读预设仍不执行不明脚本。门禁的目录列表只披露名称，不运行内容读取；受保护内容始终拒绝。

## 验证

| 检查                                     | 结果                      |
| ---------------------------------------- | ------------------------- |
| `pnpm test`                              | 574 项通过，23 个测试文件 |
| `pnpm build`                             | 通过，包含浏览器 bundle   |
| `pnpm typecheck`                         | 通过，包含测试源码        |
| `pnpm lint`                              | 通过，零 warning          |
| `pnpm format:check` / `git diff --check` | 通过                      |

测试使用真实临时 Git 仓库与 Node 脚本，覆盖摘要夹具、每项判定与决策规则、环境净化（FAKE_API_KEY 不进入子进程）、日志截断及不可覆盖、带空格引号参数、整树超时、基线缓存与临时 worktree 清理、分支/目录回滚边界、失败引用、篡改不执行命令、普通失败修复摘要、停滞暂停、授权撤销、UNKNOWN 核对、原始回合与工具请求区分、会话读取失败保持 UNKNOWN、过期/版本变化/重复决策与人工接受来源。

### 真实宿主和浏览器

使用 Desktop 自带 DSH `0.2.1-rc.2`、Cordis `4.0.5`，`DSH_HOME=.dsh-dev`、profile `whaledot-p02`、127.0.0.1:3182；使用隔离 UI 已保存的模型配置，没有读取或打印模型 Key。新测试目标通过真实 Connection 的 owner 认证接口确认，没有构造 owner 对象写生产数据。原始宿主日志包含本地登录 token，只留在忽略目录。

| 手工用例               | 真实观察                                                                                                                                                                                      | 忽略目录 `.dsh-dev/p09-evidence/` 中的证据                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. P08 留存分析任务    | `task_e868587c…` 的冷会话最终文本非空；无该次运行改动，PASS / report-only → SUCCEEDED。即使同目标之后产生了新检查点，也按这次运行的提交核对差异                                               | p08-report-only.png/.txt；P08 goal-detail                     |
| 2. 修好失败测试        | 新目标使用 P08 仓库的独立副本；真实模型只把期望值 2 改为 1。独立 `pnpm test`：基线 failed（1764 ms）、当前 passed（796 ms），PASS / improved → SUCCEEDED                                      | fix-verification.json；final-panel.png/.txt；final-audit.json |
| 3. skip 篡改           | 真实模型改为 `test.skip(`；FAIL / acceptance-tampering → WAITING_APPROVAL，未执行验收命令、未自动重试；通知与 5 个建议已落库且未投递                                                          | tamper-verification.json；tampering.png/.txt                  |
| 4. 回归回滚            | 通过基线上的测试被模型改坏；基线 passed、当前 failed，FAIL / regressed。保留 `refs/whaledot/failed/run_fd60d055-6d42-479d-a71a-9f5bca479e33`，回滚到 base，任务 READY / attempts=1            | regression-verification.json；final-audit.json                |
| 5. 超时                | 确认命令为 `node -e "setInterval(()=>{},1000)"`；基线 30367 ms、当前 30307 ms 后整树终止，二者均 timeout，UNKNOWN → 任务 UNKNOWN                                                              | timeout-verification.json                                     |
| 6. 快速双击重试        | 浏览器双击同一通知的“重试”，仅一条 WAITING_APPROVAL → READY，source=user、attempts 保持 0。另以并发服务调用单测验证只成功一次                                                                 | decision-double-click.json；tampering.png/.txt                |
| 7. 真实 shell 路径拒绝 | 模型确实提交了 `type D:/dsh_plugins/WhaleDot/.dsh-dev/p09-public-marker.txt` 与 `Get-Content .env`，均被 path-outside-scope 拒绝。另一次复合 Git 命令也被拒；不是只凭模型主动拒绝判断门禁通过 | security-tool-calls.json；main-audit.json；final-audit.json   |
| 附加：P08 重启核对     | `task_be76a285…` 从 UNKNOWN 核对冷会话，写 reconciled 检查点后按空报告进入 WAITING_APPROVAL；该目标 Run 数前后均为 3，原会话界面仍 1 turn / 1 step                                            | p08-reconcile.json；reconciled-session.txt                    |

回归失败引用为 `83c5c5339b63518beea73e7d606c058048539ae1`；回滚后 HEAD 与 base 均为 `9501d6db273449681d9fd7a203b89acfedd68ebe`。原 P08 夹具仍为 master / `521a4ad6b8188c57f931ec96bfab7f23a16fe348` / 干净；三个新夹具的用户工作区也均保持 master、原 HEAD 和干净状态。

独立验收面板截图：`../.dsh-dev/p09-evidence/final-panel.png`（本地隔离证据，不随仓库分发）。

## 偏离与实现约定

- P08 写授权此前已撤销，且旧 edit 任务仍占用该项目写入槽。没有恢复旧授权、跳过写入槽或人工改写旧任务结果。用例 1、7 使用 P08 原记录/夹具；用例 2–5 新建独立副本和测试目标，经认证确认后真实运行。原 P08 edit 仍保留 VERIFYING，不能称它已通过 P09。
- 分析任务不运行可能写入文件的测试脚本；只验证该次提交无改动与实际最终报告非空，明确标注 report-only。编辑任务不使用模型总结作为成功证据。Node 内置测试输出不属于指定的四种摘要格式，因此显示状态与耗时，counts 留空。
- `view-diff` 只读预览，不消费通知；其余选择一次性消费通知和全部建议。仍检查预览时的任务版本、选项与有效期。人工重试记录 user 迁移，不增加自动修复计数。
- improved 将停滞计数清零；PASS / unchanged 加一；FAIL、UNKNOWN、未评分和证据不足保留计数，不清零。达到阈值暂停目标并留下 stalled 决策。
- 当前 verification 表保存最新判断；旧判断、命令结果及哈希继续留在 Evidence。再次显式核对时命令日志用独占创建及后缀保留旧文件，避免覆盖 UNKNOWN 的负面证据。基线缓存限于当前宿主进程，不自动安装依赖。
- 验收命令若修改工作区，后置干净状态检查会得到 UNKNOWN；不会把这种改动并入成功结果。回滚必须满足专属目录、非原工作区、whaledot 分支、当前提交及干净状态，并重新检查活动写授权。

## 已知问题与边界

新建四个测试目标在演练后均暂停，保留 READY / UNKNOWN、检查点、通知和失败引用；没有执行自动修复的新回合。语言恢复 auto，全局暂停值保持 false；本轮专用宿主已停止。P08 重启任务的待决通知保留待审，未人工接受空报告。P09 仅落库/面板展示，不投递鲸鱼通知、不做 P10 自动连续推进、不合并或推送。
