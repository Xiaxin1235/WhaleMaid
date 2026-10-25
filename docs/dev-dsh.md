# DSH 隔离开发联调

目标宿主为本机 **DSH Desktop 0.2.1-rc.2**，使用其自带 CLI；不要使用全局 npm CLI 0.1.7-rc.2。
所有测试使用仓库 `.dsh-dev/` 作为独立 `DSH_HOME`，不要复制用户配置、凭据或修改用户 profile。
`.dsh-dev/` 和 `.dsh-ref/` 均不入库，并已加入格式化和 lint 忽略列表。

## 提取只读参考

```powershell
Set-Location 'D:\dsh_plugins\WhaleDot'
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe" scripts/extract-dsh-ref.cjs
```

脚本从 Desktop 的 `resources/app.asar/dsh/node_modules/@deepseek-ai/` 复制包清单、README 和
`lib/types/` 下的 `.d.ts`，生成 `.dsh-ref/0.2.1-rc.2/INDEX.md`，不复制运行时实现。
**本机 asar 未附带 .d.ts**（即使 package.json 声明了 types 路径）；该情况不能当成类型已经查证。
本机提取到 306 个包，Cordis 为 4.0.5；host peer 使用 `^4.0.4`，dev 使用 4.0.5。

## 创建独立测试 profile 并链接

在专用 PowerShell 终端、仓库根目录执行。关闭终端即可结束环境变量覆盖。
`whaledot-p02` 应为隔离 home 下尚未使用的名字；创建命令仅执行一次。

```powershell
pnpm install
pnpm build
$env:DSH_HOME = Join-Path (Get-Location) '.dsh-dev'
$dshCli = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dshCli --version
& $dshCli --profile whaledot-p02 --from-default-profile web --dump-config
& $dshCli plugin --profile whaledot-p02 add link:./packages/host
& $dshCli --profile whaledot-p02 --dump-config
```

模板来自 Desktop 内置 web profile，不读取用户已有 web profile。保持该终端的 `DSH_HOME` 生效。
`add link:` 会登记 bundle；单独 `pnpm link` 不会。先构建 workspace 依赖，不要在外部 profile
用 `file:` 安装包含 `workspace:*` 的 host 原始目录。

隔离 home 没有用户凭据。真实模型联调前，在**同一终端**手工设置所选模型提供方的 API Key 环境变量，
不要将值写进命令记录、配置副本或提交。DeepSeek API Key 提供方的变量名为 `DEEPSEEK_API_KEY`，
依据 `.dsh-ref/0.2.1-rc.2/@deepseek-ai/dsh-llm-deepseek-api-key/README.md:28-35`。
其他提供方必须查对应包 README，不要假定共用此变量。无需将 Key 发给开发代理。

```powershell
& $dshCli --profile whaledot-p02
```

启动前停掉占用相同 Web 端口的测试 Host。使用 `Ctrl+C` 停止，修改代码后重新构建再启动。
配置中应包含 `id: whaledot`、`name: dsh-whalemaid`；WhaleMaid 不包含桌宠运行时或对外 WebSocket。

## 同一 profile 安装鲸鱼桌宠

本机 Desktop 0.2.1-rc.2 在 `@takboo/dsh-coopanion@0.4.13` 的兼容列表内。
停止测试 Host 后，在同一终端执行：

```powershell
& $dshCli plugin --profile whaledot-p02 add @takboo/dsh-coopanion@0.4.13
& $dshCli --profile whaledot-p02 --dump-config
& $dshCli --profile whaledot-p02
```

检查两个 bundle 同时启用、WhaleMaid 加载日志、Web UI 与鲸鱼动作。桌宠首次启动可能下载 Electron。
兼容性来源为该包的版本声明；后续变更需重新核对，不豁免兼容检查。
P02 的真实联调记录见 `docs/p02-report.md`（实现完成后生成）。
