# P14G：高权限模式剩余漏判修正

2026-10-24。开始时 master 干净，HEAD 为 `ab6bf44`，已包含 P14F 提交 `5c18e29`。本次只修改 trusted-command 纯函数及对应测试、使用说明和本报告；没有改授权、scope hash、审批、审计、confirmed、host 或鲸鱼插件。

## 修正

| 范围       | 实现                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| forfiles   | 递归识别 /c 或 -c 的字面命令及常用 /m、/p、/d、/s 选项，沿用 8 层上限；缺少内容或未知拆法 ask/unparsed-command。内层删除保留 dynamic-execution、delete。                                                                      |
| 系统配置   | rundll32、regsvr32、shutdown、Restart/Stop-Computer、注册/注销计划任务、mshta 直接 deny；schtasks 的 create/change/delete/run 和 wmic 的 call/create/set/delete 修改类参数 deny。schtasks /query 及普通 WMI 查询保持 allow。  |
| 进程控制   | taskkill、Stop-Process、kill、spps、tskill 返回 process-control/ask；没有“本任务自己启动的进程”豁免，结束自己的子进程也会询问，这是预期行为。                                                                                 |
| 版本库     | checkout .、强制 checkout、checkout -- 路径、强制或丢弃改动的 switch、restore --worktree（含与 --staged 并用）归 repository-delete；普通切换分支和仅恢复暂存区不变。                                                          |
| 依赖       | npm/pnpm/yarn 的 uninstall/remove/rm/un 子命令归 package-install；不读取 npm run 脚本内容。                                                                                                                                   |
| 路径与类别 | 修正单个 * 错误跨目录的保护交集，保留 ** 递归匹配；只在可能命中保护规则时 deny。$_ 保持 unresolved-command-path/ask。del/erase 的 /s 标为 recursive-delete。schtasks、taskkill 的已知选项不再冒充歧义路径，返回真实危险类别。 |

## 12 条命令的测试输出对照

下表由 `trusted-command-gaps.test.ts` 对同一组输入的真实 checkAction 输出生成，没有执行这些命令。原始数据为 `.dsh-dev/p14g-evidence/before.json` 与 `after.json`。

为明确测试“没有命中保护时 ask”的条件，前后都固定使用合成策略：cwd/allowedPaths 为 C:/proj、protectedPaths 为 C:/proj/secrets、protectedNames 为 .env 和 *.key。**这只用于构造纯函数用例，不修改真实授权或默认保护。** 修正前 _.tmp/_.log 被 * 跨目录误匹配到 secrets 子树，修正后不再误 deny。

| 命令                                          | 修正前 decision / reason                                  | 修正后 decision / reason                                  |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `forfiles /c "cmd /c del @file"`              | allow / Ordinary command under trusted authorization      | ask / dynamic-execution, delete                           |
| `rundll32 x.dll,Entry`                        | allow / Ordinary command under trusted authorization      | deny / system-configuration                               |
| `regsvr32 x.dll`                              | allow / Ordinary command under trusted authorization      | deny / system-configuration                               |
| `shutdown /s /t 0`                            | allow / Ordinary command under trusted authorization      | deny / system-configuration                               |
| `Stop-Process -Name explorer -Force`          | allow / Ordinary command under trusted authorization      | ask / process-control                                     |
| `git checkout .`                              | allow / Ordinary command under trusted authorization      | ask / repository-delete                                   |
| `git switch -f main`                          | allow / Ordinary command under trusted authorization      | ask / repository-delete                                   |
| `schtasks /create /tn x /tr calc`             | ask / ambiguous-command-path                              | deny / system-configuration                               |
| `taskkill /f /im explorer.exe`                | ask / ambiguous-command-path                              | ask / process-control                                     |
| `npm uninstall lodash`                        | allow / Ordinary command under trusted authorization      | ask / package-install                                     |
| `del /q /s *.tmp`                             | deny / Command text targets a protected or ambiguous path | ask / delete, recursive-delete                            |
| `Get-ChildItem *.log \| % { Remove-Item $_ }` | deny / Command text targets a protected or ambiguous path | ask / dynamic-invocation, unresolved-command-path, delete |

## 反例实际结果

同样来自 after.json，策略与上表一致。pnpm install 仍需审批，其余只读或安全分支保持 allow。

| 命令                                       | 实际 decision / reason                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `schtasks /query`                          | allow / Ordinary command under trusted authorization |
| `git switch main`                          | allow / Ordinary command under trusted authorization |
| `git checkout main`                        | allow / Ordinary command under trusted authorization |
| `git checkout -b feat`                     | allow / Ordinary command under trusted authorization |
| `npm ls`                                   | allow / Ordinary command under trusted authorization |
| `pnpm install --frozen-lockfile`           | ask / package-install                                |
| `forfiles /m *.txt /c "cmd /c echo @file"` | allow / Ordinary command under trusted authorization |

## 默认保护的实际结果与边界

默认 id_rsa* 与 _.tmp、_.log、*.txt 确实存在交集（例如 id_rsa.tmp）。按提示词“可能命中保护名称仍 deny”的原则，以下默认策略结果仍为 deny；不能将前面的合成策略结果说成默认授权下无条件 ask/allow。没有删减默认保护名称，也没有为通配删除设豁免。

| 命令（默认保护）                              | 实际 decision / reason                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `del /q /s *.tmp`                             | deny / Command text targets a protected or ambiguous path |
| `Get-ChildItem *.log \| % { Remove-Item $_ }` | deny / Command text targets a protected or ambiguous path |
| `forfiles /m *.txt /c "cmd /c echo @file"`    | deny / Command text targets a protected or ambiguous path |

补充回归覆盖受保护的 _.key/.env_、受保护目录内通配路径、递归 **、受保护的同层文件，以及不会触及受保护子目录的单层通配符。通配判断不枚举磁盘，所以不能根据“当前恰好没有密钥文件”取消潜在交集保护。

## 别名核对与兼容

本机 PowerShell 7.6.5 的只读 Get-Alias 结果确认 kill、spps 均为 Stop-Process，记录在 process-aliases.json；没有实际结束进程。

P14F 的 21 条审查输入和 26 条反例在同样默认策略下，与修正前 JSON 逐项完全一致（decision、reason、ruleId 均相同）。现有用例没有修改。scope.ts 和授权模型与 5c18e29 源码逐字一致，confirmed 判定与 scope hash 实现未变；对照元数据见 unchanged.json。

## 已知限制与范围

forfiles 的实际匹配集合、@file 等运行时替换及替换后的完整命令无法由静态文本确定；Git 裸参数可能有分支名/路径歧义，分类器不查询真实仓库；npm run 和其他脚本内部仍不可见。本次不扩展这些行为。新增边界已同步到 docs/usage.md，原有独立 worktree、检查点/回滚、危险命令单次审批的风险说明保留。

没有启动宿主或桌宠，不把纯函数测试称为真实审批验收；没有修改用户 profile 或 Windows 权限。此修正按提示词不需要真实宿主验收。完成后只做本地提交并停下等审查，不推送。

## 最终检查

| 检查                                   | 结果                                |
| -------------------------------------- | ----------------------------------- |
| build / typecheck                      | 通过                                |
| test                                   | core 848 + host 226，共 1074 项通过 |
| lint / format:check / git diff --check | 通过                                |
| P14F 21 条审查 + 26 条反例             | decision、reason、ruleId 逐项不变   |

检查日志为 `.dsh-dev/p14g-evidence/final-*.log`；12 条前后对照和反例表由测试输出的 JSON 生成，未手填判定。未启动自己的宿主或鲸鱼进程；结束时 3182/9498 无监听。
