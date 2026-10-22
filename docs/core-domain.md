# P01 core 领域层约定

`@whaledot/core` 提供模型校验、任务迁移、依赖图和范围判定，不做 IO，不接 DSH，不调模型。
时间、ID 和 SHA-256 实现均由调用方注入。schema 校验不代表用户授权；Host 必须只从可信 UI 授权记录恢复 scope。

## 模型与错误

| 文件            | 导出                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `infra.ts`      | `Clock`、`IdGen`、`ScopeHasher`、`Result`；测试用固定时钟、隔离序列 ID   |
| `model/ids.ts`  | 所有实体及会话 ID 的 Zod 品牌类型与 schema                               |
| `model/*.ts`    | 11 个实体的 schema 与推导类型；12 种 `ActionIntent`                      |
| `task-state.ts` | `TASK_TRANSITIONS`、`transition`                                         |
| `goal-graph.ts` | DAG 校验、READY 候选、并发选择、提议去重                                 |
| `scope.ts`      | 路径边界、命令分类、动作门禁、规范化内容及注入哈希                       |
| `goal-draft.ts` | P07 草案与完整确认表单 schema、提示词、JSON 解析、确认值转记录与提议去重 |

品牌 ID 经对应 schema 解析取得，不能在 TypeScript 中混用不同实体的 ID。
实体 schema 拒绝未知字段；可选时间字段与草案目标的 `scopeId` 使用缺省字段表示。
`Run` / `Attempt` 保留架构中的 `run_id` / `attempt_id`，尚无结果时默认 `UNKNOWN`。
目标状态首批为 `draft / active / paused / succeeded / cancelled`；检查点类别为
`baseline / progress / verified / rollback`，后续里程碑可按实际需要扩充。
通知优先级采用 `low / normal / high`。`StateTransition` 当前只描述任务迁移。

非法迁移、版本冲突等预期拒绝返回 `Result`。P01 明确要求这一接口，因此架构概述中
“非法迁移抛错”在这里细化为 `invalid-transition`；仅无效注入依赖、版本溢出等程序不变式违反抛错。

## 状态机与选择

```ts
transition(
  task,
  'READY',
  {
    expectedVersion: task.version,
    source: 'host',
    reason: 'Dependencies satisfied',
  },
  { clock, idGen },
)
```

成功返回新任务及迁移记录，版本递增，原任务不变；拒绝不消耗时钟或 ID。
显式迁移表为每条边注明理由，`SUCCEEDED / CANCELLED` 为终态，`UNKNOWN` 只能转入
`VERIFYING / FAILED / BLOCKED`。外部状态的实际核对、审批证据、重试预算和验收由后续 Host 完成；
`reason` 文字不构成核对证据。暂停任务恢复到 READY 前，Host 必须确认没有未结执行，否则先进入 UNKNOWN。

`validateDag` 返回环、悬空依赖、重复 ID 或跨目标依赖错误；环错误中的 `taskIds` 为未能拓扑移除的节点，
可能包含环的后继。无效图不产生可调度候选。
`readyTasks` 只返回依赖均 SUCCEEDED 的 PENDING 任务，调用方通过迁移将其提升为 READY。
`selectNextTask` 只选择当前目标的 READY 任务，返回 `{ task, reason }`；无候选时 `task: null`。
无效 DAG 的原因单独返回 `invalid-graph`，Host 应据此发出阻塞通知；正常空队列仍为 `no-ready-task`。
按 `createdAt` 升序选择，同时间保持输入顺序。

**`runningTasks` 必须由 Host 按项目根目录汇集，包含同项目所有目标的在途任务。**
Task 自身没有项目路径，core 不猜测其他目标所属项目。RUNNING、VERIFYING、WAITING_APPROVAL、
UNKNOWN、PAUSED 的写任务均占据写槽，直到 Host 核对并释放；analyze/research 可并行。
P01 将写并发上限固定为 1，即使传入更大限制也不开放并行写。
其余日预算、时长及修复次数等执行限制的消费与判定留给后续调度器。

`taskKey` 使用目标 ID、NFKC/空白/大小写规范化标题和 kind 的 JSON 数组，不依赖随机哈希。
合并提议时保留现有记录，重新计算提议 key，丢弃重复 key 或复用 ID，不接受模型自行声明的 key 作为去重依据。
`mergeProposedTasks(goalId, existing, proposed)` 返回 `{ tasks, rejected }`，按输入顺序逐条校验：
异目标或跨目标依赖为 `foreign-goal`，重复为 `duplicate`，缺失依赖为 `dangling-dependency`，成环为 `cycle`。
依赖必须已存在或已被接受，前向引用不等待后续提议；拒绝的条目不占用 key/ID，不阻断其余提议。
调用前应确认 existing 为合法 DAG；在此前提下，返回 tasks 始终为合法 DAG。
新增提议统一为 PENDING、planner 创建、零尝试和零版本，不能由模型自行声明已执行成功。

## 授权边界与 Host 责任

| 情况                                              | core 处理                                               |
| ------------------------------------------------- | ------------------------------------------------------- |
| 已撤销授权、明确禁止动作、非法输入、跨目标控制    | deny                                                    |
| 未列入 allowedActions                             | deny；扩大授权仅可在 UI 中重新确认                      |
| read/write 路径                                   | 规范化盘符绝对路径，protected 优先，按目录边界匹配      |
| 设备路径、UNC、ADS、设备名、尾部点/空格、越过盘根 | deny                                                    |
| read-only                                         | 禁止写文件、非只读命令、非只读 Git、网络写操作、回滚    |
| 已确认的低风险命令和获准 cwd                      | allow；命令必须逐字符匹配 verifyCommands                |
| 推送、发布、安装、上传、未知/复合/动态命令        | ask，即使出现在 verifyCommands 中也不自动放行           |
| 硬重置、递归删除、注册表/系统配置修改             | deny                                                    |
| expand-scope                                      | 始终 ask，只有用户可在 UI 确认；禁止项与撤销仍优先 deny |
| Git、会话回复、回滚                               | 缺少工作区、会话或检查点归属证据时 ask                  |
| 网络                                              | HTTP(S) 请求需确认目的地；其他协议 deny                 |

命令分类器只识别已知危险语法并使用窄的低风险白名单，不是 shell 解析器，不能证明任意脚本安全。
未识别形式一律 ask，不因模型描述或确认列表而变成安全。
`run-command.cmdline` 是待审批和匹配的数据，后续适配器必须映射为用户确认的可执行文件与参数数组，
使用 `execFile`，不能直接拼接 shell 执行。审批不能越过 DSH 的拒绝或扩大当前 scope。

字符串检查无法发现真实符号链接、junction、挂载点或短文件名别名。
**Host 必须先对允许根、保护根和目标执行真实路径解析，再传给 core；不存在的写入目标需解析最近存在的父目录。**
命令内部访问的文件、脚本行为、网络副作用还必须受 Host/DSH 门禁约束；获准 cwd 不代表命令只能访问该目录。
网络、会话或 Git 的 ask 也不是已通过归属校验的执行许可。

scope 哈希对 schema 默认值、路径别名、集合去重排序、递归键排序后生成 JSON，排除 hash 字段自身，
命令文本不折叠空白。调用方注入 SHA-256，返回 64 位小写十六进制。
该摘要用于内容一致性比较，不是签名或授权来源证明；core 不调用 `node:crypto`。
摘要与数据存在同一数据库，只能发现意外损坏或不一致，不是防篡改安全边界；拥有本机数据库
写权限的人可以同时改数据并重算摘要，这类本机攻击者超出 WhaleDot 的防护范围。

P07 为 protectedPaths 增加唯一的文件名前缀模式：末尾 `.env*`，表示该位置以 `.env` 开头的
文件或目录；不支持任意 glob，allowedPaths 仍只接受普通绝对路径。Host 对模式去掉末尾星号后
解析真实路径或最近存在父目录，再保留星号交给 core；默认 `.git` 与 `.env*` 都须显示在确认表单。

## 验证

`pnpm --filter @whaledot/core test` 默认开启 V8 覆盖率，逐文件强制
`task-state.ts`、`scope.ts` 行覆盖至少 90%。根 `pnpm test` 同样执行这一门槛。
报告输出到被忽略的 `coverage/`，含文本、JSON 摘要和 HTML。

## 语言范围（P03）

`i18n/` 导出 `Locale = 'zh-CN' | 'en'`、`LanguageSetting`、`resolveLocale(setting, hostLocale)` 和
`t(locale, key, params?)`；两份字典具有完全相同的 key 集合，由类型约束及运行测试共同检查。
默认 auto 跟随 DSH，未知宿主语言回退 en；显式选择覆盖宿主语言。
语言设置影响面板文案、WhaleDot 发给用户的通知/提问/选项文字，以及将来要求模型输出的用户可见摘要语言。
它不影响 `ActionIntent`、日志、存储字段名和错误 code；这些继续使用英文标识符。
本轮只交付面板文案，后续通知与摘要消费者必须复用此目录；当前不声称已经实现通知或模型摘要生成。
