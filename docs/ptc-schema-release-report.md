# PTC 工具参数修复与 1.2.3 发布核验

已发布 [WhaleMaid 完整版 1.2.3](https://github.com/Xiaxin1235/WhaleMaid/releases/tag/v1.2.3)，继续内置 Coopanion 0.5.7。修复提交为 `0de01bd2b69daa0cc25cba443fce8e566b82ad54`，发行源码为 `8ff6f3a713d7f380fb03e9a74c36091d2ae8227e`，由 [PR #2](https://github.com/Xiaxin1235/WhaleMaid/pull/2) 合入。

## 问题与改动

Zod 4.6.7 为生成的参数 schema 添加了不可枚举的 `~standard` 属性，其值包含函数。DSH 的 PTC 提示词装配会先做无损 JSON 快照，因此在发送消息前抛出 `tool "codex" parameters must be lossless JSON before schema projection`；native 模式不经过同一快照检查。1.2.2 也存在此问题。Codex 的设置开关限制执行，但不会取消工具注册，因此关闭开关不能消除这次装配错误。

Codex 的一处和伴生工具的四处 Zod 转换均通过 JSON 序列化、反序列化移除隐藏元数据。字段、长度约束、默认值、运行时参数解析及审批要求保留。没有使用递归过滤关键字的方法，因为直接对每层对象过滤会误删 `properties` 中的字段名。

## 验证

| 检查               | 结果                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 回归复现与修复     | 原始 schema 在真实 DSH 工具运行时复现报错；新增四项回归修复后通过                                                                                                                     |
| 本地全量           | 53 个测试文件、1,309 项通过；build、typecheck、lint、format:check、test:package、git diff --check 通过                                                                                |
| 已安装桌面版 rc.3  | 使用桌面版实际的 dsh-tools 0.2.1-rc.3 与 Zod 4.6.7，原始参数复现报错；修复后 17 个工具的 native/PTC 提示词装配通过                                                                    |
| 三平台全量与完整包 | [正式标签工作流 42152773196](https://github.com/Xiaxin1235/WhaleMaid/actions/runs/42152773196) 全部通过；Windows、macOS、Linux 各安装 rc.2、rc.3，共六组                              |
| 安装验收内容       | 一个完整 bundle、真实宿主面板、原生桌宠及卸载均通过，逐项报告见 [verification-matrix.json](https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.3/verification-matrix.json) |
| 公开下载           | 匿名下载版本包与 latest 固定别名，两者均与六组验收使用的规范归档一致；归档内确认五处修复及 Coopanion 0.5.7                                                                            |
| 自有市场索引       | 最新版本为 1.2.3，完整包 Git 提交固定为 `9fcfb86f90135c5bb8a6a7ac0a382c22e1cac8b8`                                                                                                    |

归档 SHA-256：`44fd9343ff5c43c49bfcc1a675788c581732f507d31c95e2a64e8d72dd1d1106`。

以上没有调用真实模型或执行真实 Codex 任务；PTC 的直接验证范围是请求前的工具参数检查和提示词装配，没有把它写成真实模型消息验收。未修改日常 profile。

## 市场更新入口

现有社区条目仍使用 [最新完整包](https://github.com/Xiaxin1235/WhaleMaid/releases/latest/download/dsh-whalemaid-full.tgz)，无需重新投稿；自有索引也已自动加入 1.2.3。完整包自带配套桌宠，不要另装 Coopanion。

社区市场当前不能为无 npm 身份的 GitHub 完整包自动提示更新。该适配已单独提交为 [dsh-market PR #1119](https://github.com/dsh-market/dsh-market/pull/1119)，需要上游合并并发布后才会对市场用户生效，不能把发布完整包等同于更新按钮已经上线。适配保持完整归档来源，核对已发布标签下的包名和版本；不使用尚未发布的主分支版本，不切换到同名 npm 包或源码子目录。其测试与本机原有符号链接权限失败的对照记录在该 PR 中。
