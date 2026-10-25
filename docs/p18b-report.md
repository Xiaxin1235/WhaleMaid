# P18B：WhaleMaid 中英文文档与项目改名

## 完成情况

P18B 开始于干净的 `master`，提交 `f16f4e1`，包含 P18 `56e10ef`，没有 `origin`。执行中用户明确要求仓库名、包名和界面一起改为 **WhaleMaid**，并确认远端尚未创建，P19 直接使用新名字。因此本次额外完成必要的包标识和显示名调整；没有创建远端、添加 remote 或推送。

| 文件或范围                                             | 变化                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`、`README.en.md`                            | 中英文首页、语言切换、1.0.0 文档版本、通用安装入口、相同能力与限制、独立桌宠关系和 MIT 许可。                                            |
| `docs/install.md`、`docs/install.en.md`                | 面向新用户的前提、获取源码、固定副本、安装、更新、卸载与回退；说明远端地址待 P19 创建及未演练步骤。                                      |
| `docs/usage.md`、`docs/usage.en.md`                    | 中文增加语言切换、版本和安装链接，并按用户要求替换项目展示名；英文逐节翻译，11 个章节及 companion 配置键集合一致。                       |
| `docs/README.md`、`CONTRIBUTING.md`、`docs/dev-dsh.md` | 增加双语入口，把旧安装记录归为“作者本机记录”，补英文开发说明，更新现行开发说明中的包名。                                                 |
| workspace、运行时、模板、构建入口和测试                | 根包 `whalemaid`、插件 `dsh-whalemaid`、领域包 `@whalemaid/core`；面板、设置入口、任务标题与文字使用 WhaleMaid。改名独立提交 `27568de`。 |

版本号仍为 `0.0.0`，由 P19 处理正式发布；文档按要求使用目标版本 1.0.0。三个 LICENSE 和 `docs/日常安装与自查.md` 保留原字节；既有历史报告没有批量改名。

为读取已有目标、记忆和授权，沿用 `whaledot` 数据目录、配置及服务标识、伙伴预设和机器协议标记。当前和历史的 `[WhaleMaid]` / `[WhaleDot]` 自动任务标题都不作为普通伙伴会话读取。执行提示的旧机器前缀保留，继续供已独立安装的桌宠识别并排除自动任务内容。新安装文档说明先卸载旧包再安装新包，避免同时加载两份。

## 安装演练

证据保存在未提交的 `.dsh-dev/p18b-rehearsal/`。全部安装、加载与卸载使用独立 `DSH_HOME`、临时 profile `p18b` 和 CLI Web 宿主；没有安装或卸载日常 profile 的插件，没有从测试终端启动桌面 GUI，没有调用模型。

| 阶段                     | 命令或操作                                                                                                            | 结果与证据                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 改名前基线               | 从本仓库 `f16f4e1` 用 `git clone --no-hardlinks` 克隆到 `source/`                                                     | 工作区干净；`clone.log`。                                                                                                                                                               |
| Corepack                 | `corepack enable --install-directory <演练目录>/shims`，将该目录加入本次进程 PATH                                     | Corepack 0.35.0；项目 pnpm 11.22.0。未改全局 shim；`corepack-enable.log`、`pnpm-version.log`。                                                                                          |
| 冻结依赖、构建、固定副本 | `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm --filter dsh-whaledot deploy --legacy --prod <克隆外固定副本>`  | 全部成功；`install.log`、`build.log`、`deploy.log`。                                                                                                                                    |
| 旧包安装与移除           | CLI `plugin --profile p18b add link:<固定副本>` / `remove dsh-whaledot`                                               | bundles 加入后移除旧包，原内置 bundles 保留；`plugin-add.log`、`plugin-remove-before-rename.log`。                                                                                      |
| 新包干净克隆             | 从已提交的 `27568de` 克隆到 `renamed/source/`，未使用未提交工作区作为构建源                                           | 干净；`renamed-clone.log`。                                                                                                                                                             |
| 新包安装流程             | `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm --filter dsh-whalemaid deploy --legacy --prod <克隆外固定副本>` | 全部成功；`renamed-install.log`、`renamed-build.log`、`renamed-deploy.log`。                                                                                                            |
| 新包 CLI 安装            | `plugin --profile p18b add link:<新固定副本>`                                                                         | bundles 为内置 base、Web app 和 `dsh-whalemaid`；`renamed-plugin-add.log`。                                                                                                             |
| 宿主加载                 | CLI `--profile p18b --no-open --host 127.0.0.1 --port 0`，Playwright 打开实际 Web 面板                                | 侧栏与面板标题均为 WhaleMaid；存储可用，6 项依赖可用，伙伴已就绪；沿用旧数据目录。中英文界面截图 `renamed-panel-loaded.png`、`renamed-panel-en.png`，结构摘要 `runtime-evidence.json`。 |
| 新包卸载                 | 停止测试宿主，CLI `plugin --profile p18b remove dsh-whalemaid`                                                        | 新旧插件均不在 bundles，两个内置 bundles 保留，数据目录仍在；`renamed-plugin-remove.log`。                                                                                              |
| 清理                     | 关闭测试 Chromium、停止自己启动的宿主                                                                                 | 演练监听端口已释放；保留日志与数据供追溯。                                                                                                                                              |

临时命名 profile 初始只含 base，没有 Web/完整伙伴环境；演练按既有本机记录方式在临时 profile 增加内置 `@deepseek-ai/dsh-web-app`，不安装桌宠。初次 `--help` 在这个 base profile 上实际激活了宿主而未返回，出现伙伴预设等待服务；已停止该进程，然后改用明确的 Web 启动参数。新包最终在完整临时 Web 环境通过。

最初一次 `web --help` 查询读取了默认 web profile 的兼容信息并返回帮助；没有执行该 profile 的安装、卸载或启动命令。其余 CLI 帮助查询也转入隔离 `DSH_HOME`。此项读取单独记录，不算日常安装验收。

CLI 的 pnpm 给出 `link:` peerDependencies 提示，构建工具链另有既有弃用提示；最终真实加载通过，未用版本豁免或改依赖版本绕过。

### 未演练的步骤

远端仓库尚未创建，因此没有执行 GitHub 克隆认证或 Release 源码下载；演练用本地已提交树的干净克隆。默认位置的 `corepack enable`、日常配置备份与安装、开始菜单启动、实际拉取更新、旧固定副本及配置回退、macOS / Linux 均未演练。两种安装说明均明确列出这些边界；没有把 CLI Web 验收写成桌面版日常安装成功。

## 翻译核对与中文原文问题

英文按钮和菜单名从 host 实际引用的 `packages/core/src/i18n/` 查证，包括 `Create goal`、`Execute next task`、`Start autopilot`、`Notification center`、`Open notification session`、`Dafeiyu’s memories`、`Restore to list`、`Today’s brief`、`Trusted command execution` 等。桌宠的“和我聊天”不属于该 locale，采用英文说明并保留中文原名。已核对真实中英文面板。

| 原文问题或变化                                               | 本次处理                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 日历日说明括注特定时区 `America/Los_Angeles`                 | 保留中文，英文明确它是参考机器时区，没有暗示所有用户必须使用该时区。            |
| 归档部分仍称部分桌宠兼容修复未完成，未区分上游与本地后续版本 | 按要求原样翻译，未顺手修改中文；显示效果继续依所安装的独立桌宠版本。            |
| Web 空白伙伴会话可能切成 Standard 的 P17 限制                | 保留限制及首次从桌宠发起的操作说明，未声称已修复。                              |
| 原任务称远端“目前私有”，用户随后确认尚未创建并要求改名       | 按最新确认写成 P19 计划创建 `WhaleMaid`，不声称当前地址已可克隆或已有 Release。 |

除允许的入口、版本和项目展示名外，中文使用说明主体逐字保持；没有把规划中的功能写成已实现功能。

## 检查结果

| 检查                            | 结果                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 改名构建、类型检查              | 通过。                                                                                                                                                                                     |
| 全量测试                        | `pnpm test --maxWorkers=2`：48 个文件、1182 项全部通过；包含新旧自动任务标题的兼容用例。                                                                                                   |
| 首次全量失败及核对              | 默认并发时，“changed-file limit still commits evidence and blocks the task”的异步轮询超时；定向复测通过，随后限制为 2 workers 的全量通过。没有修改该用例超时或执行逻辑。首次失败日志保留。 |
| 附加基线定向检查                | 旧克隆的 pnpm 依赖状态检查阻止了启动，不是一个已运行的测试结论；不计为基线通过或失败。                                                                                                     |
| 双语结构                        | 使用说明 11 节对 11 节；companion 配置键集合相同；中文主体仅替换项目展示名。                                                                                                               |
| `pnpm lint`（含许可与链接检查） | 通过；许可边界检查 303 个跟踪文件、3 个 manifest、0 个媒体文件；108 份文档、132 个相对目标、0 个失效链接。未宣称已做额外的独立 AGPL 仓库全量对照。                                         |
| `pnpm format:check`             | 通过。                                                                                                                                                                                     |
| `git diff --check`              | 工作区与暂存区均通过。                                                                                                                                                                     |

按 P18B 完成后停下等待审查；P19 不在本次执行范围。
