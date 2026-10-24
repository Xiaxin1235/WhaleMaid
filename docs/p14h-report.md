# P14H：通配符只在字面指向保护项时拒绝

2026-10-24。开始时 master 干净，HEAD 为 `c419e5b`，包含 P14G 的 `67263a5`。按本次明确调整的产品规则，只修 trusted-command 的纯函数通配保护及对应测试、使用说明。未改默认名单、文件工具、confirmed、scope hash、授权、审批、审计、host 或鲸鱼插件；未枚举磁盘，未执行下表的命令文本。

## 实现

文件名只取通配路径最后一段，须与保护名同时满足 overlap 和同侧非空字面锚点：开头互为前缀或结尾互为后缀，忽略大小写。路径取首个通配段之前的字面目录 D：D 已在保护目录内、对应通配段有锚点且路径相交，或含递归 `**` 且 D 下有保护目录时拒绝。单个 * 不跨目录；删除等危险类别照常审批。

## 默认授权的实际前后输出

下表由 `trusted-command-globs.test.ts` 的 checkAction 实际输出生成。before.json 使用 `c419e5b` 的 trusted-command 实现采样，after.json 使用修正实现，同一组输入、同一默认授权。未手填 decision、reason 或表格结果。

默认 allowedPaths/cwd 为 `C:/proj`，protectedPaths 为 `C:\proj\secrets`；protectedNames 为 `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.pypirc`，没有缩减默认名单。

| 命令                                          | 修正前 decision / reason                                  | 修正后 decision / reason                                  |
| --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `npx prettier --write "src/*.ts"`             | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `npx eslint src/*.js`                         | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `git add *.md`                                | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-ChildItem *.log`                         | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `copy *.txt out`                              | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `forfiles /m *.txt /c "cmd /c echo @file"`    | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content *.key`                           | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content secret*.key`                     | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content .env*`                           | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content id_rsa*`                         | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content *.ts`                            | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content *.md`                            | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content *.log`                           | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content *.txt`                           | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content *`                               | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content SECRET*.KEY`                     | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content ID_RSA?`                         | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content .env?.txt`                       | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content .en?`                            | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content .en?x`                           | allow / Ordinary command under trusted authorization      | allow / Ordinary command under trusted authorization      |
| `Get-Content id_rsa*.txt`                     | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content ?d_rsa*`                         | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content src/*.key`                       | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content src/.env*`                       | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content secrets/*`                       | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content C:/proj/secrets/*.txt`           | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content secrets/sub/*.txt`               | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content secrets-other/*.txt`             | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content sec*/*`                          | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `Get-Content */*.txt`                         | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content sec?/*.txt`                      | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `Get-Content src/**/*.ts`                     | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `del /q /s *.tmp`                             | deny / Command text targets a protected or ambiguous path | ask / delete, recursive-delete                            |
| `Get-ChildItem *.log \| % { Remove-Item $_ }` | deny / Command text targets a protected or ambiguous path | ask / dynamic-invocation, unresolved-command-path, delete |
| `del *.tmp`                                   | deny / Command text targets a protected or ambiguous path | ask / delete                                              |

## 目录规则正反例的实际输出

以下仅替换 protectedPaths 为表中路径，保护名称仍为真实默认名单；不是对用户授权的修改。覆盖目录内与边界外、锚点命中与无锚点/无交集/不同父目录、递归子树与兄弟目录/非递归/不同盘，以及既有 .env* 保护路径。

| protectedPaths              | 命令                                | 修正前 decision / reason                                  | 修正后 decision / reason                                  |
| --------------------------- | ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `C:/proj/secrets`           | `Get-Content secrets/*`             | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/secrets`           | `Get-Content C:/proj/secrets/*.txt` | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/secrets`           | `Get-Content secrets/sub/*.txt`     | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/secrets`           | `Get-Content secrets-other/*.txt`   | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/secrets`           | `Get-Content sec*/*`                | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `c:/PROJ/SECRETS`           | `Get-Content SEC?ETS/*.txt`         | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/secrets`           | `Get-Content */*.txt`               | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/secrets`           | `Get-Content sec?/*.txt`            | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/other/secrets`     | `Get-Content src/sec*/*.txt`        | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/src/secrets`       | `Get-Content src/**/*.ts`           | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/secrets`           | `Get-Content src/**/*.ts`           | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/src/secrets`       | `Get-Content src/*/*.ts`            | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/src-other/secrets` | `Get-Content src/**/*.ts`           | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `D:/proj/src/secrets`       | `Get-Content src/**/*.ts`           | deny / Command text targets a protected or ambiguous path | allow / Ordinary command under trusted authorization      |
| `C:/proj/out.tmp`           | `Get-Content *.tmp`                 | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/.env*`             | `Get-Content .env*/file.txt`        | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |
| `C:/proj/.env*`             | `Get-Content .env.local/*.txt`      | deny / Command text targets a protected or ambiguous path | deny / Command text targets a protected or ambiguous path |

额外 10 条命名策略断言分别验证 `.env*` 对 `.env` 和 `.env.*`、`*.ts` 和 `*` 对 `id_rsa*`、前缀/后缀长短双方，以及有锚点但没有交集时放行。默认名单用例另覆盖大小写、问号、子目录文件名。以上均为新增回归，不替换旧矩阵。

## 改变结果的既有用例清单

仅以下原先因理论交集而拒绝的既有断言/采样结果改变。前两类既有测试共改 3 个断言输入；P14G 的合成策略矩阵及所有其他既有断言不变。P14G 旧报告保留历史，默认通配保护规则以本次修正为准。

| 既有位置                                              | 输入                                          | 前 → 后      | 改动                                                                                 |
| ----------------------------------------------------- | --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| trusted-command.test.ts / cwd and protected paths     | `Get-Content *`                               | deny → allow | 原 deny 断言移入普通命令 allow 用例                                                  |
| trusted-command-gaps.test.ts / wildcard protection    | `del *.tmp`                                   | deny → ask   | 默认策略 deny 断言改为 ask；保留 delete                                              |
| trusted-command-gaps.test.ts / wildcard protection    | `Get-ChildItem *.log \| % { Remove-Item $_ }` | deny → ask   | 默认策略 deny 断言改为 ask；保留 dynamic-invocation、unresolved-command-path、delete |
| trusted-command-gaps.test.ts / defaultProtection 采样 | `del /q /s *.tmp`                             | deny → ask   | 原 P14G 默认策略采样 deny，本次 ask；保留 delete、recursive-delete                   |
| trusted-command-gaps.test.ts / defaultProtection 采样 | `forfiles /m *.txt /c "cmd /c echo @file"`    | deny → allow | 原 P14G 默认策略采样 deny，本次 allow                                                |

## 完整结果兼容性

before/after JSON 逐项比较完整返回值（decision、reason、ruleId），结果一致：

| 矩阵               | 条数 | 结果         |
| ------------------ | ---- | ------------ |
| P14F 审查          | 21   | 逐项完全一致 |
| P14F 普通反例      | 26   | 逐项完全一致 |
| P14G 合成策略审查  | 12   | 逐项完全一致 |
| P14G 合成策略反例  | 7    | 逐项完全一致 |
| confirmed 同组命令 | 56   | 逐项完全一致 |

scope.ts、授权模型、命令解析器及默认名单源码未修改；confirmed 的既有全部用例照常运行。新增采样中的 confirmed 56 条也前后完全一致。原始数据与逐项比较计数保存于 `.dsh-dev/p14h-evidence/{before,after,unchanged}.json`。可用环境变量 P14H_PROBE_OUTPUT 指定采样路径，运行 `pnpm exec vitest run packages/core/src/trusted-command-globs.test.ts --coverage.enabled=false` 重现当前实现的输出。

## 验证与限制

| 检查                                   | 结果                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| `pnpm -r build`                        | 通过                                                   |
| `pnpm -r test --fileParallelism=false` | core 903 + host 226，共 1129 项通过；42 个测试文件通过 |
| `pnpm typecheck`                       | 通过                                                   |
| `pnpm lint`                            | 通过，无警告                                           |
| `pnpm format:check`                    | 通过                                                   |
| `git diff --check`                     | 通过                                                   |

默认并行的 `pnpm -r test` 两次均为 core 903 通过、host 225 通过 / 1 失败：既有 `real worktree reuse, checkpoint/hook suppression and exact original workspace preservation` 在 5 秒时限处超时，清理测试目录时报 EBUSY。没有改宿主源码、测试断言或时限；关闭测试文件并行后，同一完整测试集合全部通过。该并行运行问题仍保留，不宣称默认并行命令已通过。失败日志为 `.dsh-dev/p14h-evidence/{first,second}-test-failed.log`，最终串行结果及其余检查为 `final-*.log`。

带通配符的普通命令在运行时可能匹配到保护文件，WhaleDot 只拦截字面指向保护项的写法。已替换 usage.md 中过时的理论交集说明，保留原有高权限风险与兜底说明。按本任务不需要真实宿主验收，本次没有启动宿主或测试鲸鱼，没有修改用户 profile 或 Windows 权限；完成后仅本地提交，不推送，停下等审查。
