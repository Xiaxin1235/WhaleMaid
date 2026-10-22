# P03 Desktop：桌面鲸鱼窗口（M0 收尾）

## 目标
`apps/desktop` 用 Electron 实现独立的桌面桌宠：透明置顶窗口，按 Host 推送的真实 Agent 状态播放动画。完成后 M0 验收：“桌面角色正确响应任务状态”。

## 技术约束
- Electron（最新稳定版）+ Vite + TypeScript；渲染层原生 DOM/Canvas 或 Preact，**不要上 React 全家桶**（保持轻量）。
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；渲染进程只通过 preload 暴露的最小 API（`window.whaledot.*`）通信；设置严格 CSP。
- 主进程负责 WebSocket 连接 Host（读取 `~/.dsh/whaledot/connection.json`），渲染进程不接触 token。
- 协议类型与校验全部来自 `@whaledot/protocol`。

## 要做的事

### 1. 窗口（主进程）
- PetWindow：`transparent`、`frame: false`、`alwaysOnTop`（level `'screen-saver'` 需评估是否压住全屏游戏——默认用 `'floating'`，设置项可调）、`skipTaskbar`、`resizable: false`、`hasShadow: false`。
- **鼠标穿透**：默认 `setIgnoreMouseEvents(true, { forward: true })`；渲染进程按 sprite 当前帧的 alpha 做命中测试（鼠标在不透明像素上时通知主进程关闭穿透，离开时恢复）。
- 拖动：自己实现指针拖动（不要 `-webkit-app-region: drag`，它会吞掉点击）；松手时**屏幕边缘吸附**（距工作区边缘 < 24px 吸附）；位置/缩放持久化到 `app.getPath('userData')/settings.json`；多显示器、DPI 变化、显示器拔出后位置回到主屏可见区域。
- 缩放：滚轮 + Ctrl 调整 0.5x–2x。
- 托盘：显示/隐藏、置顶开关、低资源模式（降低帧率到 8fps 并在无状态变化 60s 后暂停动画）、“重新连接 DSH”、退出。
- 单实例锁（`requestSingleInstanceLock`）。

### 2. 角色包
- 加载 **dsh-pet manifest v2** 角色包：先读懂 `%USERPROFILE%\.dsh\profiles\desktop\node_modules\@linxin666\dsh-pet\contracts\pet-manifest-v2.schema.json` 和 `assets/whale-refined/pet.json`，用 zod 实现等价校验（只实现 sprite2d 渲染器；其他 renderer 拒绝并给出友好错误）。
- 角色包来源：① 内置 `packs/placeholder-whale`；② 用户目录 `~/.dsh/whaledot/packs/<id>/`；③ 托盘菜单“导入角色包…”选择文件夹（校验后复制到②）。
- **内置占位角色**：在 `packs/placeholder-whale/` 用代码生成一张简单的卡通鲸鱼 spritesheet（可写一个 `scripts/gen-placeholder.ts` 用 SVG→PNG 或 canvas 生成），9 条轨道齐全，附 `LICENSE`（CC0）。**不要复制 dsh-pet 自带的任何图片进仓库**。
- 状态 → 轨道映射写成表（`idle→idle`、`thinking→waiting`、`reading→running`、`executing→running`、`waiting-approval→waving`、`done→jumping`、`failed→failed`、`paused→idle` …），manifest 缺失某轨道时回退到 `idle`。

### 3. 连接与状态
- 主进程 `HostClient`：读 connection.json → 连接 → 发送 `hello` → 接收 snapshot/增量；断线指数退避重连（1s→30s），connection.json 变化时（DSH 重启）立刻重连。
- 未连接时鲸鱼显示 `idle` + 小角标“未连接 DSH”，悬停气泡解释原因（文件不存在 / token 错误 / 协议版本不兼容）。
- 多会话：显示最近活跃的会话状态；同时有 `waiting-approval` 的会话优先。

### 4. 交互（M0 只做最小集）
- 单击鲸鱼：弹出一个小气泡显示当前会话标题 + 状态文字；“打开 DSH 工作台”按钮（用 `shell.openExternal('http://127.0.0.1:3080')`，端口可在设置里改）。
- 全局快捷键 `Ctrl+Alt+W` 显示/隐藏鲸鱼（可配置；注册失败时托盘提示）。

### 5. 测试
- 纯逻辑单测：manifest 校验、状态→轨道映射、吸附算法、屏幕越界修正、重连退避。
- 提供 `pnpm --filter @whaledot/desktop dev` 与 `package`（electron-builder 或 electron-forge 二选一，产出 Windows 便携版即可）。

## 手工验收（写进回报，附截图或 GIF 路径）
1. 启动 DSH（带 whaledot 插件）和 Desktop，鲸鱼出现在右下角，透明背景，可以点穿空白区域操作下面的窗口。
2. 在 DSH 发起一个会调用工具的任务：鲸鱼依次进入 思考 → 执行 → 完成 动画，8 秒后回到待机。
3. 关闭 DSH：鲸鱼显示“未连接”；重启 DSH：自动重连。
4. 导入 `%USERPROFILE%\.dsh\profiles\desktop\node_modules\@linxin666\dsh-pet\assets\whale-refined` 文件夹作为角色包，能正常显示（仅本机验证，不提交该素材）。

## 不做
- 通知、智能选项（P04/P05）。

## 完成标准
单测通过；手工验收 1–4 通过；提交 `feat(desktop): transparent desktop pet driven by DSH activity`。
