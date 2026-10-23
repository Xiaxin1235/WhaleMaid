<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# C01 本地扩展验收记录

## 完成情况

2026-10-23，基于 v0.4.13，在 `whaledot-local` 分支实施；版本保持 0.4.13，未 push 或发布。AGPL 与角色权利声明保留，未修改角色素材。两个提交分别为 `3fcf7d3 feat: prefer the opening paragraph in reply bubbles` 和 `feat: answer questions inline from the inbox`。

首段预览按 Unicode 计数，默认开启、可恢复旧预览；单选及 custom 沿原公开提问提交。严格校验当前代次、完整问题身份和选项，不处理审批、多选或计划评审。补充中文使用说明、两种语言设置、通知和文字契约。DSH 接口查证仅记录在独立 MIT 仓库 WhaleDot 的 `docs/dsh-api-notes.md` 第 20 节，未复制 AGPL 实现。

## 验证（命令与关键输出）

| 检查                                  | 结果                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                              | 成功，未改锁文件；Node 24.18.0                                                                                                   |
| `npm run typecheck` / `npm run build` | 通过                                                                                                                             |
| `npm test`                            | Vitest 229 passed、11 skipped；Node release/client 11 passed、locale 1 passed                                                    |
| `npm run test:inbox-ui`               | 完整通过：收件箱、11 个回复/字号、1 个多屏、15 个交互/拖动、15 个陪伴用例                                                        |
| 新原生 IPC 用例                       | 实际 Electron 44.7.0 中表单 → main → bridge 的答案、恶意双选拒绝、关联回执及撤下条目通过                                         |
| `npm run test:desktop` 全套           | 两次未通过，均在后续既有 `verifyNativeTextScale → nativeClick` 的 OS cursor/DIP 断言终止；不能报告原生全套通过                   |
| 真实宿主链接安装                      | Desktop CLI 0.2.1-rc.2 / Cordis 4.0.5，测试 profile 移除 npm 包后安装 `link:D:/dsh_plugins/dsh-coopanion`，加载成功              |
| 真实 WhaleDot not-scorable            | 原生信封选 Try again → 一条 retry，resolvedSource=inbox；任务 WAITING_APPROVAL v10 → READY v11，未启动新 Run                     |
| Harness 与原生同题                    | Harness 已选 Try again 且可提交；原生先提交后，Harness 卡片撤下、原生条目撤下，只有一个 retry 决策；毫秒级同时提交由集成用例验证 |
| 普通真实模型 ask                      | DeepSeek-V4.1-Flash 实际调用 ask_user_question，“挥手/点头”在原生显示并选挥手，原工具拿到答案、模型完成                          |
| 真实气泡与全文                        | 将普通会话设为关注后，第二回合气泡仅“我挥挥小手，把你的选择收到啦。”，全文入口存在，阅读器保留 220 个字符完整正文                |
| 设置关闭                              | 纯函数、Host 和浏览器验证恢复原路径；未再发付费模型回合重复设置关闭测试                                                          |

宿主使用 WhaleDot `scripts/dev-host.ps1 -UseUiKey`：DSH_HOME 指向 `.dsh-dev`，DSH_PET_TEST_DATA_DIR 指向 `.dsh-dev/pet-data`；调试仅用于隔离鲸鱼，未打开 dsh:// 或日常桌面应用。运行证据位于 `D:/dsh_plugins/WhaleDot/.dsh-dev/c01-evidence/`（native-before-submit、native-after-submit、model-question、model-bubble、full-reply、whaledot-answer、session-audit）。本地生成目录不随源码发布。

## 偏离与待确认

公开 API 的 live waterfall 采用第一次结算加独立下游取消信号；实际服务给 agent-scoped waterfall 传入新请求副本，调用方信号不被修改。continued 使用公开 answer()，需要 exact live root。custom 没有独立 allowOther 开关，保持官方单选 custom 覆盖 selected 语义。审批仍在 Harness。

首次普通模型回复到达时，桌宠关注的是旧通知会话，因此只产生后台回复提醒，没有开场白气泡；等待脚本超时。这符合既有关注保护。随后显式关注普通会话，并发起一个单独的第二回合，得到短首段气泡；没有重发原提交。

原生全套的坐标失败：屏幕 125% 缩放，测试的 DIP 点约 (1042,375)、physical point 约 (1303,469)，回读 cursor 约 (1303,468)，不符合测试预计 DIP 的断言。未扩大本任务去更改显示缩放或窗口置顶代码。

## 需要用户目视确认的项目

用户已确认“能看到选项和说明”。对于短气泡及提交后的结算效果，用户反馈“没看到桌宠，但听到声音”，所以这两项未获得目视确认。原生 DOM 和渲染截图只证明渲染结果，不能代替屏幕上持续可见。

## 已知问题 / 下一步建议

已有原生窗口遮挡／可见性问题仍存在，不纳入本次 C01 修改。它影响用户目视验收；不得以自动截图、进程存活或声音声称问题解决。多选、计划评审及无法确认的冷会话保留 Harness 入口。测试结束关闭本次测试宿主与鲸鱼，日常 profile 不改动。
