# P14F：高权限命令识别审查修正

2026-10-24。开始时 master 干净，HEAD 为 `10afd20`，包含 P14 提交 `353851b`。本次只修改 core 的文字识别、对应风险文案和测试，以及本报告和使用说明；没有改授权字段、scope hash、审批、审计、host 或鲸鱼插件。

## 实现

| 范围      | 修正                                                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 解析      | 保留字面参数和引号信息，识别调用运算符、变量、表达式及无法静态确定的路径；未知拆法 ask，错误引号、无法确定的转义和不完整语法 ask。不会执行命令或展开变量。                                                                                            |
| 包装器    | npx/bunx、包管理器 exec/dlx、cmd、Start-Process、env/call/start 递归使用相同规则，最多 8 层。支持明确的字面 FilePath/ArgumentList、字符串参数列表和常见选项；未知选项、动态列表或目标 ask。递归后的系统配置保持 deny，保护路径也不放宽。              |
| 动态执行  | PowerShell Command/EncodedCommand 所有前缀，目录外 File 脚本，其他 shell、Node/Python/Perl/Ruby/Deno 的执行模式、Invoke-Command/Expression、Add-Type，以及 .NET 静态方法。能识别方法用途时给出 delete/write-outside-check，其他为 dynamic-execution。 |
| 删除      | 包装器内的 rimraf/del-cli/trash/trash-cli/shx rm、robocopy /MIR 或 /PURGE、Clear-Content/Clear-Item 及实际别名。危险类别与动态执行、越界等原因一起保留。                                                                                              |
| 系统配置  | format/diskpart/fsutil/bcdedit/cipher /w/vssadmin/wbadmin/takeown/icacls 修改参数直接 deny；原有系统配置规则仍 deny。                                                                                                                                 |
| confirmed | 只改 classifyCommand 的 trusted 分支。已比对 `353851b`，confirmed 分支及 checkAction 后续实现逐字一致；原有 confirmed 用例照常运行。未改授权数据或哈希规范化。                                                                                        |

## 21 条审查命令的实际前后结果

下表由同一组 `reviewCommands` 的真实 checkAction 测试输出生成，scope=trusted、cwd=C:/proj；仅判断字符串，没有执行这些命令。基线保存于 `.dsh-dev/p14f-evidence/before.json`，修正后为 `after.json`，对应测试为 `trusted-command-review.test.ts`。提示词里的省略号实例化为 Remove-Item a.txt 和 1 + 1，前后使用完全相同的 21 个输入。

基线：allow 18、ask 3、deny 0；修正后：allow 0、ask 19、deny 2。

| 命令                                             | 修正前 decision / reason                             | 修正后 decision / reason                            |
| ------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| `npx rimraf dist`                                | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `pnpm exec rimraf dist`                          | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `pwsh -c "Remove-Item a.txt"`                    | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `powershell -Comm "Remove-Item a.txt"`           | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `cmd /k del a.txt`                               | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `bash -c "rm a.txt"`                             | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `sh -c "rm a.txt"`                               | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `wsl rm a.txt`                                   | allow / Ordinary command under trusted authorization | ask / dynamic-execution, delete                     |
| `node -p "1 + 1"`                                | allow / Ordinary command under trusted authorization | ask / dynamic-execution                             |
| `[System.IO.File]::Delete('a.txt')`              | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `[IO.Directory]::Delete('out', 1)`               | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `$x = "Remove-Item"; & $x a.txt`                 | allow / Ordinary command under trusted authorization | ask / unresolved-command-path, dynamic-invocation   |
| `. Remove-Item a.txt`                            | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `diskpart /s script.txt`                         | allow / Ordinary command under trusted authorization | deny / system-configuration                         |
| `Clear-Content a.txt`                            | allow / Ordinary command under trusted authorization | ask / delete                                        |
| `Get-Content ~/secret.txt`                       | allow / Ordinary command under trusted authorization | ask / unresolved-command-path                       |
| `type %USERPROFILE%\secret.txt`                  | allow / Ordinary command under trusted authorization | ask / unresolved-command-path                       |
| `Get-Content $env:USERPROFILE\secret.txt`        | allow / Ordinary command under trusted authorization | ask / unresolved-command-path                       |
| `format D: /q`                                   | ask / ambiguous-command-path                         | deny / ambiguous-command-path, system-configuration |
| `robocopy empty out /MIR`                        | ask / ambiguous-command-path                         | ask / delete                                        |
| `Start-Process cmd -ArgumentList "/c del a.txt"` | ask / ambiguous-command-path                         | ask / dynamic-execution, delete                     |

## 普通命令配对结果

以下结果同样从 `after.json` 自动生成，不依据程序名手填。包装器套普通脚本、转义引号、8/9 层边界等另由 wrappers 测试逐项验证。

| 命令                                         | 实际结果 |
| -------------------------------------------- | -------- |
| `npx tsc -p .`                               | allow    |
| `pnpm exec vitest run`                       | allow    |
| `pwsh -File scripts\build.ps1`               | allow    |
| `cmd /c echo ok`                             | allow    |
| `node scripts/gen.mjs`                       | allow    |
| `python tools/gen.py`                        | allow    |
| `robocopy src out`                           | allow    |
| `Set-Content out\a.txt x`                    | allow    |
| `node scripts/gen.mjs > out/result.txt 2>&1` | allow    |
| `cmd /c "echo ok 2>&1"`                      | allow    |
| `npx --package=typescript tsc -p .`          | allow    |
| `pnpm exec shx cp a.txt out/a.txt`           | allow    |
| `pwsh -File "scripts/my build.ps1"`          | allow    |
| `& "node" scripts/gen.mjs`                   | allow    |
| `. scripts/build.ps1`                        | allow    |
| `rni a.txt b.txt`                            | allow    |
| `Rename-Item a.txt b.txt`                    | allow    |
| `Get-Content out/a.txt`                      | allow    |
| `Out-File out/a.txt`                         | allow    |
| `echo x > out/a.txt`                         | allow    |
| `icacls out /verify`                         | allow    |
| `cipher /c out/a.txt`                        | allow    |
| `node --version`                             | allow    |
| `deno run scripts/gen.ts`                    | allow    |
| `perl tools/gen.pl`                          | allow    |
| `ruby tools/gen.rb`                          | allow    |

## PowerShell 别名核对与规则取舍

本机 PowerShell 7.6.5 / Core，使用只读 Get-Alias 获取；原始结果在 `powershell-aliases.json`，没有执行删除命令。

| 实际命令      | 实际别名                      |
| ------------- | ----------------------------- |
| Clear-Content | clc                           |
| Clear-Item    | cli                           |
| Remove-Item   | del, erase, rd, ri, rm, rmdir |
| Rename-Item   | ren, rni                      |

`rni` 和 `ren` 是 Rename-Item，不是 Remove-Item，因此没有把它们误标成 delete；目录内重命名有 allow 反例。Clear-Content/Clear-Item 的 clc/cli 则纳入 delete。

提示词的“cmd /c、/k 属于动态执行”与明确要求“cmd /c 后跟安全命令递归后 allow”存在重叠。本次按具体反例处理：完全拆清且安全时 allow；有危险或拆不清时 ask，并保留 dynamic-execution 及实际危险类别。因此原 trusted 测试里的 cmd /c echo ok 改为 allow，confirmed 模式没有改变。

## 验证与边界

全套检查结果见下节，日志存放 `.dsh-dev/p14f-evidence/`。覆盖 21 个审查输入的 decision 和关键 reason、每个包装器的危险/普通配对、PowerShell 参数所有前缀、引号与转义、递归上限、多原因、保护路径以及既有系统规则。源码对照结果保存在 `confirmed-branch-comparison.json`。

没有启动 DSH 宿主或桌宠，没有做真实审批流程复测；这是提示词允许的纯函数识别验收，不替代 P14 的真实执行证据。没有修改日常 profile 或 Windows 文件权限。

仍看不到脚本文件/可执行程序的内部行为、运行时下载或生成的代码、自定义别名/函数或 PATH 替换后的真实目标。编码内容不解码，识别为动态执行待审批，未必能给出内部 delete 类别。该解析器没有实现完整 PowerShell/cmd/POSIX 语法；已知无法拆清的形式会 ask，仍不能承诺穷尽所有语法和运行时行为。这些限制已同步到 `docs/usage.md` 和中英文风险文案。风险兜底、授权和单次审批流程不变。

桌宠信封里只显示 whaledot-danger 标识的展示问题保持原状，应由独立 C 任务处理。本次提交后停止，等待审查，不推送。

## 最终检查

| 检查                                   | 实际结果                            |
| -------------------------------------- | ----------------------------------- |
| build / typecheck                      | 通过                                |
| test                                   | core 788 + host 226，共 1014 项通过 |
| lint / format:check / git diff --check | 通过                                |
| 21 条审查输入                          | 19 ask、2 deny、0 allow             |
| 普通反例结果表                         | 26 条均 allow                       |

日志为 `.dsh-dev/p14f-evidence/final-*.log`；危险矩阵和普通反例来自测试生成的 JSON，未手工填写判定结果。没有启动自己的宿主或鲸鱼进程；结束时 3182/9498 均无监听。
