# DSH 隔离开发联调

本指南使用仓库内 `.dsh-dev/` 作为独立 `DSH_HOME`，在其中新建测试 profile。
不要在用户现有的 `desktop` / `web` profile 安装开发包，不要复制用户配置或凭据。
`.dsh-dev/` 已被 Git、ESLint 和 Prettier 忽略。

## 本机查证结果

| 项目                                       | 已确认结果                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| 环境                                       | Node 24.18.0、pnpm 11.22.0、npm 安装的 DSH CLI 0.1.7-rc.2                        |
| 插件依赖                                   | CLI 实际安装 `@deepseek-ai/cordis@4.0.4`，host 的 peer/dev 版本与之相同          |
| `dsh --help`                               | 支持 `--profile`、`--from-default-profile`、`--dump-config`                      |
| `dsh plugin --help`                        | 返回 `required option '--profile <name>' not specified`，退出码 1                |
| `dsh plugin --profile whaledot-dev --help` | 在隔离 home 初始化 profile，透传 pnpm 帮助，退出码 0                             |
| bundle                                     | 包声明 `dsh.bundle.patch`，补丁通过 `insert` 登记 `whaledot`                     |
| 日志                                       | Cordis 的 `Context.logger` 为可调用的 `LoggerService`；支持命名 logger 的 `info` |

查证的本机文件（均只读）：

- `%APPDATA%/npm/node_modules/@deepseek-ai/dsh/lib/bin.js`、`lib/plugin-*.js`、`lib/profile-boot-*.js`。
- 上述 CLI 的 `node_modules/@deepseek-ai/dsh-plugin-manager/lib/types/operations.js`：相对 `link:` 按调用目录解析，安装后将 bundle 加入该 profile。
- 同处 `@deepseek-ai/dsh-home-paths/lib/index.js`：支持 `DSH_HOME` 覆盖默认用户目录。
- 同处 `@deepseek-ai/cordis/package.json`、`lib/types/context.d.ts`、`lib/types/logger.d.ts`。
- `%USERPROFILE%/.dsh/plugins/dsh-llm-deepseek-vision/package.json`。
- `%USERPROFILE%/.dsh/profiles/desktop/node_modules/@linxin666/dsh-client-ui-task-board/package.json` 及 `cordis.patch.yml`：仅参考包形态与补丁格式，未复制实现。

## 构建并创建测试 profile

以下为 PowerShell 命令。在专用开发终端中，从仓库根目录执行；关闭终端即结束环境变量覆盖。
`whaledot-web-dev` 必须是该隔离 home 中尚不存在的新名字，创建命令只执行一次。

```powershell
Set-Location 'D:\dsh_plugins\WhaleDot'
pnpm install
pnpm -r build
$env:DSH_HOME = Join-Path (Get-Location) '.dsh-dev'
dsh --version
dsh --help
dsh --profile whaledot-web-dev --from-default-profile web --dump-config
```

此命令从 DSH **内置 web 模板**建立新 profile，仅输出配置，不启动 Host。
它不读取或克隆用户已有 web profile；实际位置为 `.dsh-dev/profiles/whaledot-web-dev/`。
`DSH_HOME` 覆盖必须在该终端内所有 `dsh` 命令执行期间保持生效。

## 链接 WhaleDot

```powershell
dsh plugin --profile whaledot-web-dev --help
dsh plugin --profile whaledot-web-dev add link:./packages/host
dsh --profile whaledot-web-dev --dump-config
dsh --profile whaledot-web-dev
```

使用 `add link:` 让 DSH 安装器登记依赖及 bundle；单独 `pnpm link` 不会登记 bundle。
根 workspace 的依赖先由 `pnpm install` 安装，`@whaledot/core` 保持 workspace 链接；不要将含
`workspace:*` 的 host 原始目录用 `file:` 安装到 workspace 外。
配置输出应包含 `id: whaledot`、`name: dsh-whaledot`。Host 加载后应出现命名空间
`whaledot` 下的 `plugin loaded` 日志。当前没有面板、工具或自主任务。
停止 Host 使用 `Ctrl+C`；修改代码后重新 `pnpm -r build`，再启动同一 profile。
启动前停掉另一个占用相同 Web 端口的测试 Host。

## 同一 profile 安装可选鲸鱼桌宠

先核对宿主兼容性。上游 `@takboo/dsh-coopanion@0.4.13` 当前只声明 DSH
`0.2.0-rc.2`、`0.2.1-alpha.1`、`0.2.1-rc.1`、`0.2.1-rc.2`；本机 npm CLI
`0.1.7-rc.2` 不在此列表中。安装步骤须在使用兼容 DSH 的独立测试环境中执行，
本任务没有升级宿主或豁免版本检查。Desktop 应使用其自带 CLI；本机 Web 联调可使用兼容的 npm CLI。
依据：[上游安装指南](https://github.com/takboo/dsh-coopanion/blob/main/docs/usage.md)及
[包兼容性声明](https://github.com/takboo/dsh-coopanion/blob/main/package.json)。

在兼容环境中，沿用前面的独立 `DSH_HOME` 和新测试 profile，先停止测试 Host，再执行：

```powershell
dsh plugin --profile whaledot-web-dev add @takboo/dsh-coopanion@0.4.13
dsh --profile whaledot-web-dev --dump-config
dsh --profile whaledot-web-dev
```

精确版本沿用上游安装建议；若上游更新，重新核对其兼容性声明。
测试 profile 的 bundle 列表应同时包含 `dsh-whaledot` 和 `@takboo/dsh-coopanion`。
本机需要图形桌面，首次启动桌宠可能下载 Electron 运行时。在 DSH 的桌宠设置中查看状态。
这里的 Electron 由独立桌宠插件提供，WhaleDot 不包含该运行时或其角色代码、素材。

当前 WhaleDot 只有加载日志。此阶段联调只能检查两个插件共同装配、加载日志及桌宠自身运行，
不能验收 WhaleDot 会话驱动、通知或小信封联动；这些留到后续里程碑。

## 本次验证边界

实际运行了帮助命令、新建 web 测试 profile、`add link:./packages/host` 及配置装配检查，
位置均在仓库内的 `.dsh-dev/`。单测使用真实 Cordis Context 检查加载日志，另以故障上下文检查异常捕获。
没有启动真实 DSH Host 或发送模型请求；未安装桌宠，未验证双插件运行。

测试状态保留在被忽略的 `.dsh-dev/`，不提交用户状态。需要全新测试时，换一个未使用的测试 profile 名称。
若要结束当前终端的独立 home 设置，关闭该开发终端即可。
