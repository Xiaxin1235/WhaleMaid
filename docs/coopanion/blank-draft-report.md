# 桌宠列表隐藏空白草稿会话

日期：2026-10-23。由 Claude 直接实现（用户指定改在鲸鱼插件，WhaleDot 不动）。产品仓库 `D:/dsh_plugins/dsh-coopanion`，分支 `whaledot-local`，提交 `3e9ec2d fix: hide blank Harness drafts from the conversation lists`。本地提交，未推送。

## 问题与原因

C08F 截图里，桌宠会话列表第二张卡片叫“companion”，显示 WhaleDot 内部路径 `.dsh-dev/whaledot-p04/companion`。存档核对：它是 `agentPreset: standard`、没有任何事件的空白会话。复现：Web UI 打开时停在上次使用的工作区“大肥鱼”的“新会话”页，Harness 为该工作区准备一个空白草稿会话；桌宠从 `sessionController.list` 读取历史时连同空白会话一起列出。

DSH 没有删除会话的公开接口；归档不影响桌宠列表，且下次打开又会生成新的草稿，因此不在 WhaleDot 侧处理。

## 改动

| 位置                                   | 内容                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model.ts`                         | 每个会话记录是否已开始（收到任一 `turn/start` 或 `user/message`，含历史恢复）；快照下发 `blank`。当前/旧的大肥鱼会话、带待处理提问或审批的会话不算空白。选中规则不变 |
| `web/pet.js`、`desktop/tray-state.cjs` | 会话列表与托盘列表跳过空白草稿，除非它正是当前选中的会话；气泡、信封、阅读器的来源名称不受影响                                                                       |
| 测试                                   | model：草稿、已开始、历史恢复、新建的大肥鱼会话、焦点不移动；tray：隐藏与焦点例外；UI 夹具：列表不出现草稿卡片（先确认去掉修复时该断言失败）                         |
| 文档                                   | `docs/session-chat-contract.md` 新增“空白草稿会话”一节                                                                                                               |

## 验证

| 命令                    | 结果                                              |
| ----------------------- | ------------------------------------------------- |
| `npm run typecheck`     | 通过                                              |
| `npm run build`         | 通过                                              |
| `npm test`              | 256 passed、11 skipped；Node 检查 fail 0          |
| `npm run test:inbox-ui` | exit 0，含新增断言的 12 组 companion UI 全部 PASS |

真实宿主：WhaleDot 隔离环境（profile `whaledot-p02`，`DSH_PET_TEST_DATA_DIR` 独立目录，`DSH_PET_TEST_DEBUG_PORT=9498`）。经 CDP 在真实桌宠窗口双击并打开“换一段”列表：6 张卡片依次为“大肥鱼”、两个工作会话、三个“大肥鱼（旧对话）”，空白草稿 `session-35be0cd0…` 不再出现。截图 `.dsh-dev/blank-draft-evidence/pet-list.png`。结束后 3182、9498 无监听，测试鲸鱼进程无残留。未在日常 profile 测试。

## 未覆盖

- `npm run test:desktop` 未运行（本次只改列表过滤，不涉及原生窗口行为）。
- 用户目视确认未做。
