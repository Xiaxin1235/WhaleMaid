# P23 WhaleMaid：支持 DSH 0.2.2-rc.1，并改为开放版本范围

**前置**：`master` 工作区干净，先跑一遍 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm test`，确认基线通过。当前发布版本是 1.3.0（标签 `v1.3.0`），完整安装包内置 Coopanion fork 0.5.7（见 `market/companion.json`）。

> **改名说明**：项目已从 WhaleDot 改名为 WhaleMaid（包名 `dsh-whalemaid`、`@whalemaid/core`）。以下内容**有意保持旧名**，不要改：本地目录 `D:\dsh_plugins\WhaleDot`、插件配置 ID 和数据目录 `whaledot`、大肥鱼预设 `whaledot-companion`、隔离 profile `whaledot-p02`。

## 背景

npm 上 `@deepseek-ai/dsh` 的 `latest` 已经是 `0.2.2-rc.1`，但：

- WhaleMaid 声明 `engines.dsh: "0.2.1-rc.2 || 0.2.1-rc.3"`（`packages/host/package.json`，`market/index.json` 中的 `engines`）；
- Coopanion fork 0.5.7 声明 `"0.2.0-rc.2 || 0.2.1-alpha.1 || 0.2.1-rc.1 || 0.2.1-rc.2 || 0.2.1-rc.3"`。

在 0.2.2-rc.1 上安装 1.3.0 完整包，DSH 会以版本不兼容为由**拒绝安装两者**。作者已做过冒烟验证：在测试 profile 中对两者执行 `dsh plugin allow-version … --accept-risk` 后，`scripts/test-complete-install.mjs` 在 Windows 上通过（安装、主面板、欢迎页、桌宠启动、卸载）。深层功能尚未验证，WhaleMaid 的 `@deepseek-ai/dsh-*` 开发依赖仍固定在 `0.2.1-rc.2`。

## 目标

WhaleMaid 和配套 Coopanion fork 正式支持 `0.2.2-rc.1`，同时**继续支持** `0.2.1-rc.2` 和 `0.2.1-rc.3`。

**以后不再为每个 DSH 小版本改兼容范围**：DSH 用 `semver.satisfies(runtime, range, { includePrerelease: true })` 检查 `engines.dsh`（见 `@deepseek-ai/dsh-app-boot` 的 `lib/index.js`，0.2.1-rc.3 与 0.2.2-rc.1 相同），所以两者的 `engines.dsh` 都改为开放范围 **`>=0.2.1-rc.2 <0.3.0-0`**：覆盖 0.2.x 的所有预览版和正式版，不包括 0.3.0 及其预览版。配合下面的“新版 DSH 巡检”，DSH 出新版时由自动任务提前发现问题，不再靠手工改范围。在本地准备好 WhaleMaid **1.3.1** 和 Coopanion **0.5.8** 的发布内容，但**不打标签、不推送、不发布**，发布由作者确认后再做。

开放范围会自然包含 `0.2.1-rc.4`、`0.2.1-rc.5` 和 `0.2.2-alpha.*`。不要求逐个实测它们，但查证时要确认这些版本没有已知的破坏性变化；若发现有，在报告中说明并提出处理办法（例如在范围里排除该版本）。

## 先查证（写进报告，附出处）

1. **接口变化**：对比 `0.2.1-rc.2`/`0.2.1-rc.3` 与 `0.2.2-rc.1` 中 WhaleMaid 用到的每个 `@deepseek-ai/dsh-*` 包（以 `packages/host/package.json` 的依赖列表为准）：类型声明、公开服务、RPC 与 slot 名称、`shell.overlay`、`settings.section`、`sessionController`、`userQuestions`、`permissionPresets`、`agents`、配置编辑（`settings.update`、`configEditor`）、插件管理和 `engines` 检查规则。列出有变化的接口及 WhaleMaid 中受影响的代码位置。只读官方发布包的类型、README 和变更记录，不臆造接口。
2. **Coopanion fork**：在 `../dsh-coopanion`（分支 `whaledot-local`）先 `git fetch`，确认 0.5.7 的源提交 `a1bf29dd8e1afa2390b4c06b621cfc1bc6c1a3b1` 在本地分支上；然后同样查它用到的 DSH 接口在 0.2.2-rc.1 中是否有变化（桌宠宿主连接、Electron 启动、审批与问题服务等）。
3. **依赖版本策略**：开发依赖固定在哪个 DSH 版本做类型检查最稳妥。建议：类型检查与单测针对最低支持版本（0.2.1-rc.2）和 0.2.2-rc.1 各跑一遍；如需兼容层，写在一处，注明各版本差异的出处。

## 实现

### WhaleMaid

- 修复查证中发现的不兼容；需要按版本分支处理时，用能力探测（服务或方法是否存在），不要按版本号字符串判断。
- `engines.dsh` 改为 `>=0.2.1-rc.2 <0.3.0-0`；`market/index.json` 由发布脚本生成的 `engines` 也要一致（检查 `scripts/publish-market.mjs`）。写一个单测，用 DSH 相同的 `includePrerelease: true` 规则断言：0.2.1-rc.2、0.2.1-rc.3、0.2.2-rc.1、0.2.2 满足，0.2.1-rc.1、0.3.0-alpha.1 不满足。同步检查 `market/` 下各文件、发布脚本和文档中写到支持版本的地方（README、安装说明中英文、`market/Xiaxin1235__WhaleMaid--packages-host.yml` 的描述）。
- CI 与发布流程：`.github/workflows/release.yml` 的安装矩阵加入 `0.2.2-rc.1`（Windows、Ubuntu、macOS 都要覆盖，macOS 沿用现有 ARM 任务的写法）；`ci.yml` 增加一次针对 0.2.2-rc.1 的类型检查和单测（或说明为什么不需要）。
- **新版 DSH 巡检**：新增一个 GitHub Actions 工作流（例如 `.github/workflows/dsh-canary.yml`），每天定时运行，也可手动触发：
  - 读取 npm 上 `@deepseek-ai/dsh` 的 `latest` 和 `next` 标签版本；如果某个版本已在本仓库的发布安装矩阵中测过，则跳过；
  - 对新版本，用当前 `master` 打出的完整包跑 `scripts/test-complete-install.mjs`（Windows 和 Ubuntu 即可）；
  - 失败时用 `gh issue create` 开一个 issue（标题带 DSH 版本号，已有同名未关闭 issue 时不重复开），正文附失败步骤和日志链接；成功时不打扰。
  - 只用 `GITHUB_TOKEN`，权限最小化（`contents: read`、`issues: write`）。
- 版本号改为 1.3.1（三个 `package.json`），README 与安装说明中的下载链接同步到 1.3.1；`market/companion.json` 指向 Coopanion 0.5.8 的发布地址和源提交（发布前先填本地提交号，并在报告中标明发布后需核对）。
- `CHANGELOG.md` 新增 `## 1.3.1`，英文条目加 `### 中文` 小节，沿用 1.3.0 的写法。
- 欢迎页：这是兼容性更新，**不要**改 `packages/core/src/welcome.ts` 中的 `WELCOME_RELEASE`（不打扰用户），在报告里写明。

### Coopanion fork（`../dsh-coopanion`，分支 `whaledot-local`）

- 修复查证中发现的不兼容，`engines.dsh` 改为同样的 `>=0.2.1-rc.2 <0.3.0-0`（如果该仓库还需支持更早的 0.2.0/0.2.1 预览版，说明理由并相应放宽下界），版本改为 0.5.8，更新该仓库的变更记录。
- 这是 AGPL 仓库：只在该仓库内修改，不把它的代码或素材带进 WhaleMaid；WhaleMaid 侧只改 `market/companion.json` 的引用。
- 跑该仓库自己的构建、测试和打包检查。
- 只在本地提交，**不推送、不打标签**。

## 不要做

- 不放弃对 0.2.1-rc.2 / rc.3 的支持。
- 不用 `--accept-risk` 或 `allow-version` 代替真正的兼容范围；它们只能用于本地对照实验。
- 不把范围放宽到 `<0.3.0-0` 之外，也不写 `*`：大版本变化必须人工确认。
- 不在日常 profile 测试，不在设了 DSH_HOME 的终端里启动桌面版 Harness。
- 不推送、不打标签、不发布 GitHub Release、不改 GitHub 上的市场索引。

## 测试

- WhaleMaid：在 0.2.1-rc.2 与 0.2.2-rc.1 两套 DSH 依赖下分别跑 `pnpm build`、`pnpm typecheck`、`pnpm test`；另外跑 `pnpm lint`、`pnpm format:check`、`pnpm test:package`。**`pnpm lint` 必须跑**（上次发布因为只改了测试脚本、漏跑 lint，导致发布检查失败）。
- 完整安装测试：用本地打出的 1.3.1 完整包（内含本地构建的 Coopanion 0.5.8），在 Windows 上对 `0.2.1-rc.3` 和 `0.2.2-rc.1` 各跑一遍 `scripts/test-complete-install.mjs`（`DSH_TEST_VERSION`、`DSH_TEST_RUNTIME`、`DSH_TEST_ARCHIVE`），**不使用** `allow-version`。打包时如需本地 Coopanion 包，按 `scripts/pack-release.mjs` 现有方式提供，并在报告里写明做法。
- 隔离实测（0.2.2-rc.1，隔离 profile `whaledot-p02` 或新建的测试 home）：建一个临时 Git 项目和目标，走通“确认授权 → 自动推进一轮 → 独立验收 → 决策提问出现在桌宠 → 在面板处理”；打开大肥鱼对话发一条消息；检查主动性卡片、每日简报、通知中心、设置里的“帮助与反馈”。如果没有可用模型额度，写明哪些步骤未能验证。

## 提交与报告

- WhaleMaid 与 Coopanion fork 各自本地提交，提交信息末尾保留：

  ```
  Co-Authored-By: <你的模型署名>
  ```

- 在 `prompts/README.md` 的任务表中补一行 P23。
- 在 `CONTRIBUTING.md` 的发布部分补一句：兼容范围为开放的 0.2.x，DSH 新版由巡检工作流验证，出现巡检 issue 时先修复再发补丁版；升到 0.3 时再人工评估并调整范围。
- **不要推送，不要打标签。**
- 报告写到 `docs/p23-report.md`：接口差异清单与处理方式、最终支持的版本范围及依据、两套依赖下的测试结果（数量）、完整安装测试结果、隔离实测记录、巡检工作流的说明（如何手动触发、失败时会怎样）、发布时作者需要做的步骤（Coopanion 0.5.8 先发布 → 核对 `market/companion.json` → WhaleMaid 打 `v1.3.1`）、已知限制。
