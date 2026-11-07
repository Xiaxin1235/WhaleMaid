# P23 支持 DSH 0.2.2-rc.1

## 兼容范围与查证

WhaleMaid 1.3.1 使用 `>=0.2.1-rc.2 <0.3.0-0`。Coopanion 0.5.8 同样开放此范围，并继续支持其单独安装矩阵中已有的三个早期版本：0.2.0-rc.2、0.2.1-alpha.1、0.2.1-rc.1。两边的宿主检查使用 `semver.satisfies` 的 `includePrerelease: true`。DSH 0.2.2-rc.1 npm CLI 要求 Node.js ≥24.9。

比对 npm 的官方发布包 0.2.1-rc.2、0.2.1-rc.3 和 0.2.2-rc.1。类型路径以下均相对于各包的 `lib/types`。包摘要清单见本地 `.dsh-dev/p23-api-audit/result.json`。

| 接口或包                                                                                                                                                                                                                                                    | 观察与处理                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [api-session-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-session-controller/v/0.2.2-rc.1) 与 [session-query](https://www.npmjs.com/package/@deepseek-ai/dsh-session-query/v/0.2.2-rc.1)                                                  | 前者的 `index.d.ts` 移除 `inspect`，创建、续接、查询列表、重命名与发送入口仍在。改用后者 `observeSession` 的只读观察，关闭投影并释放观察句柄。统一处理 `SESSION_QUERY_SESSION_NOT_FOUND`，读取或格式失败继续传播。兼容层见 [dsh-session-inspection](../packages/host/src/dsh-session-inspection.ts)，通知会话、独立验收、伙伴历史、归档和会话身份都经此入口。桌宠已有 `sessionQuery` 读取路径。 |
| [agent](https://www.npmjs.com/package/@deepseek-ai/dsh-agent/v/0.2.2-rc.1)、session、session-projection、session-persistence                                                                                                                                | 新版会话创建事件在 Session 入表后触发，事件派发期间不接受日志写入。桌宠 `session/created` 监听只读恢复，WhaleMaid 在 Agent 创建后或首步挂载工具及权限。持久化补充位置元数据，原有读写接口可用。                                                                                                                                                                                                 |
| [permission-presets](https://www.npmjs.com/package/@deepseek-ai/dsh-permission-presets/v/0.2.2-rc.1)、user-questions、user-approval、tools、llm                                                                                                             | 新版用投影管理权限、提问和审批状态，工具注册和执行拆分，Native 与 PTC 由独立 executor 挂载。双 SDK 的 schema 回归各自调用原生实现。现有 `current`、`set`、提问 waterfall、审批、工具注册及门禁仍能通过类型检查。Codex 及大肥鱼工具继续提交纯 JSON schema。                                                                                                                                      |
| [client-ui-layout](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-layout/v/0.2.2-rc.1)、client-ui-settings、client-ui-sidebar、client-ui-workspace、client-ui-approval、client-ui-session、client-ui-primitives、client-locale、client-connection | 侧栏支持窄屏抽屉，设置增加图标插槽，连接增加可选资源解析，语言允许额外词典。现有 `shell.overlay`、`settings.section`、主面板与侧栏入口、owner RPC 和桌宠审批/会话投影入口仍在。                                                                                                                                                                                                                 |
| atomic-write、home-paths、agent-default-model、config-editor、settings、client-ui-renderer、client-ui-slots、client-store、credentials、plugin-market-index、base、web-app                                                                                  | 发布包声明比对未发现接入变化。既有 `settings.update` 和 `configEditor` 设置写入路径沿用。                                                                                                                                                                                                                                                                                                       |
| goal、session-title                                                                                                                                                                                                                                         | 投影或元数据声明更新，桌宠现有目标投影、会话标题入口仍保留。                                                                                                                                                                                                                                                                                                                                    |
| [app-boot](https://www.npmjs.com/package/@deepseek-ai/dsh-app-boot/v/0.2.2-rc.1)、[plugin-manager](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-manager/v/0.2.2-rc.1)                                                                              | 插件管理增加详情、版本列表和更新能力。两个目标版本的兼容门禁仍将 `engines.dsh` 交给包含预览版的 semver 匹配。完整安装继续走官方 `plugin add`。                                                                                                                                                                                                                                                  |

也核对了 rc.4、rc.5、0.2.2-alpha.2 和 alpha.3 的会话控制、读取、设置、问题服务和布局声明。rc.4/rc.5 保留 `inspect`。两个 alpha 已采用新版读取接口，兼容层覆盖该变化。这些中间版为接口核对范围，完整包验收范围以测试表为准。

## 打包、市场与巡检

- 低版 SDK 保留固定 0.2.1-rc.2。另一个 CI 作业用 [SDK 切换脚本](../scripts/use-dsh-rc1-sdk.mjs)选择 0.2.2-rc.1 及 Cordis 4.1.0，再跑构建、类型和全量测试。
- [发布安装矩阵](../.github/workflows/release.yml)覆盖 0.2.1-rc.2、rc.3、0.2.2-rc.1 的 Windows、Ubuntu 和 macOS ARM。市场索引的历史记录仍指向原始已发布产物。真正发布 1.3.1 时，[生成脚本](../scripts/publish-market.mjs)从规范包读取新的 `engines.dsh`，再写入新版条目。
- 在 Actions → **DSH compatibility canary** → **Run workflow** 手动运行。定时和手动任务都读取 npm 的 `latest`、`next`，去重并跳过发布矩阵已有版本，再从同一个 master 提交打包，于 Windows 和 Ubuntu 安装验证。失败按 DSH 版本建一个 issue，附失败步骤和运行链接。已有同名未关闭 issue 时跳过。仅报告任务持有 `issues: write`，其他任务用 `contents: read`。
- `WELCOME_RELEASE` 保持 1.3.0。本次补丁不会重新触发已看过的欢迎公告。

## 验证

| 检查                     | 结果                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| WhaleMaid 基线 `bd09b56` | 冻结安装及构建通过。第一次全量 1375/1376，已有的文件数上限用例等待超时；单独复跑通过。                                            |
| WhaleMaid 0.2.1-rc.2 SDK | 构建、类型检查、56 个文件共 1379 项测试通过。                                                                                     |
| WhaleMaid 0.2.2-rc.1 SDK | 隔离工作树构建、类型检查、56 个文件共 1379 项测试通过。生产依赖范围保持原样，由 pnpm override 固定本次运行时依赖。                |
| WhaleMaid 质量和包检查   | lint、格式、差异检查通过。包、宿主范围、巡检版本选择共 3 项 Node 测试通过。                                                       |
| Coopanion 0.5.8          | 元数据、构建、类型检查通过。Vitest 337 项通过、11 项按原配置跳过，另有 12 项 Node 测试通过。669 文件的本地包通过校验。            |
| Windows 完整安装         | 同一归档在官方 npm CLI 0.2.1-rc.3 和 0.2.2-rc.1 通过。两边验证欢迎页、主面板、原生桌宠和卸载，隔离 profile 均未写入版本豁免文件。 |

本地打包使用 Coopanion 的 `npm pack` 与 `npm run verify:package -- <包路径> --write-report`，再将包和同目录的 `verification.json` 交给 `pnpm pack:release --local-companion <包路径>`。该入口校验组件版本、提交和 SHA-256，产物放在 `.dsh-dev/local-release/`，CI 发行入口仍使用已发布的组件。安装时分别设置 `DSH_TEST_RUNTIME`、`DSH_TEST_VERSION` 和 `DSH_TEST_ARCHIVE`，执行 [完整安装脚本](../scripts/test-complete-install.mjs)。

安装与隔离联调归档以代码候选 `d9aca51c735470978a759d019232924e17e94c1e` 构建，SHA-256 为 `d90a7c015da632a9ff7d5e497136283018329440dbe9522e5988fc8f528cf04d`。后续提交仅补充双 SDK 检查配置与报告，产物源码未变。日志和安装截图见 `.dsh-dev/p23-evidence/`。

### rc.1 隔离实测

在 `whaledot-p02`（端口 3182）安装同一候选归档，通过已认证面板 RPC 确认临时 Git 项目的授权和自主推进。实际 DSH 调度器执行分析、编辑两步。编辑任务的独立验收运行了 `node verify.mjs`，退出码 1，结论为 `INSUFFICIENT_EVIDENCE`。真实桌宠显示接受选项，面板选接受后任务变为 `SUCCEEDED`，账本仅一条成功选择，桌宠提问撤回。新版会话观察读取了相同会话，也识别了缺失会话。

通过面板打开大肥鱼，在 Harness 输入并收到一条回复。主动性卡片、今日简报、通知中心和设置的「帮助与反馈」可见。联调使用本地固定回复的 DSH Adapter，没有外部模型调用，外部供应商额度及生成质量不在本次验证内。证据位于 `.dsh-dev/p23-evidence/integration/`，包括桌宠、面板结算、伙伴对话和帮助入口截图。

三平台矩阵和巡检已配置，GitHub Actions 执行留给正式发布。npm 查询时 `latest` 和 `next` 都是矩阵已覆盖的 0.2.2-rc.1，本地巡检版本筛选返回空列表。

## 发布顺序

1. 作者先发布 Coopanion 0.5.8，核对归档和 `verification.json`。
2. 核对 [market/companion.json](../market/companion.json) 的 0.5.8 URL、发布提交和产物验证信息。当前填的是本地 fork 提交 `ad7da28589eb269517e24ba5a9f6ff3e5af671d6`。
3. 在 WhaleMaid 的发布提交打 `v1.3.1`，由发布流程完成三平台安装矩阵，再发布完整包和市场索引。
