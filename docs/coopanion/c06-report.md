# C06 桌宠界面改版验收

## 完成情况

2026-10-23，基于 C05 `965df44` 在独立 AGPL 仓库 `D:/dsh_plugins/dsh-coopanion` 的 `whaledot-local` 分支实现，当前提交 `1f45a230f886dcbe6d3e377c53ff03dab651c86c`。版本仍为 0.4.13，本地提交并构建，未 push、未发布。**实现和自动验证完成；用户日常目视确认待完成。**

| 项目         | 实现                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 三个面板     | 依据 ChatNew / MenuNew / InboxNew 的宽度、留白、白底圆角、围裙花边横幅、真实角色头像及配色实现；经典样式仍使用原 `web/style.css` |
| 风格设置     | 右键 → 换装扮 → 界面风格：新版 / 经典，默认新版；沿既有 preference → settings.mutate → configure 持久化                          |
| 聊天         | 会话胶囊、上一句话气泡、快捷按钮、圆形发送钮；保留每会话草稿、失败重试身份、Ctrl / ⌘ + Enter，输入最多约五行                     |
| 菜单         | 说句话优先、换装扮描边；自主陪伴用支持方向键的三段单选；四个纵向开关、陪伴状态、一起活动、恢复邀请及 AGPL 源码入口保留           |
| 信封         | 待办在前、两类计数胶囊、默认展开的选项卡片及说明、处理链接与“就这样”；审批仍回 Harness；回复为分隔列表，可继续聊或看全文         |
| 尾巴与滚动   | 面板固定在打开时的锚点，尾巴单独跟随角色中心，避免呼吸导致按钮移动；上方空间不足且下方可放时朝上；长信封在面板内部滚动           |
| 字体与对比度 | 本地 Nunito WOFF2（400–800），附完整 OFL 与来源；中文用系统字体；主题文字和实心按钮派生较深的同色系颜色                          |
| 边界         | 未修改 `web/upstream/`、C05 表情映射、角色动画、Harness 设置页面或版本号；产品代码未放入 WhaleDot MIT 仓库                       |

产品提交包含 `d8128b2`（界面与风格设置）、`9cfb748`（测试与用户文档）、`520b511`（字体与许可）以及后续交互/排版修复，最终以 `1f45a23` 为准。同步了 `docs/usage.md` 与 `docs/text-readability-contract.md`。

## 验证（命令与关键输出）

| 验证                    | 结果与证据                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | 通过，`D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/typecheck.log`                                                                                                                                                                                                   |
| 提交后 `npm run build`  | 通过；`dist/build-info.json`：commit=`1f45a23...`，dirty=false，productDigest=`d4b36160c5ed26446e40f06c7b903f5bee25ea82a537fb3f89d7a3ab71b8b9e2`                                                                                                                      |
| `npm test`              | 最终提交通过：251 passed / 11 skipped，另 12 项 Node 测试通过；日志 `D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/npm-test.log`                                                                                                                                      |
| `npm run test:inbox-ui` | 最终提交通过：43 项 Node UI 测试及新版/信封两个场景脚本。日志 `D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/inbox-ui.log`                                                                                                                                            |
| 新版专项                | 三面板 × 三种真实角色配色 × CSS 字号 0.85 / 1 / 1.3：边界、按钮触达和文字无横向溢出；主题下主文字、灰字、按钮白字对比度 ≥ 4.5；Nunito 四字重实际加载；320px 窄视口可操作                                                                                              |
| 风格与交互              | 新版/经典反复切换保留草稿与待办；风格 preference 动作、陪伴方向键、四个开关沿原链路；完整信封脚本继续验证选项、其他文字、一次提交、回执、未读与精确会话身份                                                                                                           |
| 尾巴                    | 单元几何断言与真实浏览器拖动：角色在上方时面板移到下方、尾巴朝上；角色回落后尾巴朝下；位置夹在圆角内                                                                                                                                                                  |
| 真实 Host + Electron    | 最终提交使用 `scripts/dev-host.ps1 -Profile c06 -UseUiKey -TestHome .../.dsh-dev/c06-home`，独立 pet-data。实际 DPR=1.25；新版/经典写入隔离 profile 的 cordis.patch.yml，原生重启后均恢复。最终证据 `host-style-final.json`；此前还执行了完整 Host 停止重启及再次检查 |
| `npm run test:desktop`  | 最终提交通过（exit=0，Windows 实际 125%）：真实鼠标/CDP 点击、原生字号、全屏焦点/隐藏/恢复、多屏、角色、双向聊天、一次选项提交、陪伴、诊断、信封回执重启及生命周期。证据 `D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/desktop.log` 及 `*-native.json`               |
| 清理                    | 已通过公开控制接口停止隔离桌宠，并核对 `--profile c06` 后停止自己启动的宿主；3185 / 9496 已无监听                                                                                                                                                                     |

中间验证发现并修复了面板跟随呼吸移动的问题。旧的 13px 输入框、旧标题/计数文案断言已按新设计更新，保留点击、发送、草稿和一次结算的行为断言。一次与长界面回归并发的 npm test 在既有 1000 条原子写回执测试处超出 5 秒；未改超时或回执实现，随后独立运行通过。

截图均来自隔离浏览器、125% 栅格比例、真实角色包缩略图与配色，采用虚构会话和选项，无模型调用。PNG 不提交进产品仓库。

| 截图         | 路径                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| 默认蓝色聊天 | [chat-blue.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/chat-blue.png)         |
| 默认蓝色菜单 | [menu-blue.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/menu-blue.png)         |
| 默认蓝色信封 | [inbox-blue.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/inbox-blue.png)       |
| Claude 聊天  | [chat-claude.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/chat-claude.png)     |
| 朝上尾巴     | [chat-tail-top.png](D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/chat-tail-top.png) |

## 偏离与待确认（含对 DSH API 的假设与出处）

| 与稿件差别                                              | 原因                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 关闭按钮为 32px，非稿件 30px；会话胶囊等按钮也至少 32px | 满足同一需求中的最小触达尺寸                                                              |
| 角色身份显示本地化的当前角色名，头像为现有缩略图        | 未使用设计稿占位鲸鱼或固定头像；换装与导入角色仍适用                                      |
| 主题动作颜色适当加深                                    | 部分橙色等原配色搭白字不足 4.5:1；保留原 accent 生成横幅/边线，按钮与文字使用同色系可读值 |
| 保留“其他”输入、稍后提醒与完整状态反馈；长条目滚动      | 不删除 C01/C04/C05 已有能力，避免超长内容盖住角色或挤掉操作                               |
| CSS 0.85 / 1 / 1.3 用于布局测试                         | 既有持久字号档位仍为 1 / 1.25 / 1.5，未改变设置协议                                       |

没有新增 DSH 私有 API。风格设置沿用 `src/index.ts` 既有 `settings.mutate('dsh-coopanion', [{op:'set', path:[field], value}])`；字段纳入 Config volatile 枚举及 Host 动作白名单。出处为 `D:/dsh_plugins/WhaleDot/docs/dsh-api-notes.md` 第 237–240 行所指向的 dsh-settings README / 类型声明，并有真实 Host 保存与原生重启证据。独立验证使用既有、已认证的 `coopanion/control` 路由，未引入新的身份或授权方式。

Nunito 取自 Google Fonts 官方分发；完整许可证和下载来源在产品 `web/fonts/OFL.txt`、`web/fonts/SOURCE.txt`，登记于 `THIRD_PARTY_NOTICES.md`。许可原文：[Google Fonts / Nunito OFL](https://github.com/google/fonts/blob/main/ofl/nunito/OFL.txt)。运行时不请求外部字体。

## 需要用户目视确认的项目

请用户完全退出日常 Harness，再从开始菜单重开，确认以下现象。未自动操作日常 profile；当前不能将浏览器截图或隔离 CDP 检查记作日常目视确认。

| 项目     | 待确认现象                                                  |
| -------- | ----------------------------------------------------------- |
| 三个面板 | 双击聊天、右键菜单、信封的整体样式，顶部花边与真实头像      |
| 尾巴     | 在角色上/下方时都指向她，呼吸时按钮不晃动                   |
| 角色配色 | 换 Claude 等装扮后，横幅、按钮与边线跟随配色                |
| 经典     | 右键 → 换装扮 → 界面风格 → 经典可恢复原外观，重启后保持选择 |

## 已知问题 / 下一步建议

上述日常目视确认仍待用户完成；浏览器、真实 Host 与原生全套均已通过。经典模式保留原有外观，包括原版较淡的文字颜色；新增对比度承诺适用于新版。

测试身份见 `D:/dsh_plugins/WhaleDot/.dsh-dev/c06-evidence/manifest.json`。单元/完整界面回归在产品实现提交 `1224e05` 上通过；最终 `1f45a23` 仅把原生测试的英文标题预期从句号改为感叹号，产品摘要相同。最终提交已重新构建，并通过原生全套与真实 Host 风格检查。原生首轮的旧字号和旧英文标题断言失败记录分别保留在 `desktop-initial-font-assertion.log` 与 `desktop-initial-title-assertion.log`，没有删除行为断言或放宽窗口/鼠标检查。
