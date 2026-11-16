# Coopanion 舞台协议 `stage/1`

从 Coopanion 0.6.0 起，已认证的 Harness owner 可在同源面板嵌入透明的角色舞台。角色用 Coopanion 内置的默认大肥鱼配色渲染。宿主面板负责场景、布局、交互回退和业务数据。

## 嵌入

```html
<iframe src="/api/coopanion/stage/1" sandbox="allow-scripts"
        title="大肥鱼" tabindex="-1"></iframe>
```

使用当前 Harness 页面的源和既有登录凭据。舞台以一份 HTML 投递渲染器与原有角色资源，远程浏览器也通过当前 Harness 地址取用。舞台本身禁止网络连接、表单、额外脚本和跨源嵌入。iframe 保持不透明的安全源，画布背景透明。

父页在设置 `src` 或挂载 iframe 前监听 `message`。只接收 `event.source === iframe.contentWindow`、`event.origin === 'null'` 且 `event.data.protocol === 'stage/1'` 的舞台事件。向舞台发消息时，因目标为不透明源，使用 `iframe.contentWindow.postMessage(message, '*')`。消息只放本协议的显示字段。舞台校验发送窗口就是父页，并核对其源与当前 Harness 地址相同。

iframe 的矩形区域由浏览器接收指针事件。若宅邸还需要点击画布，请把场景交互层分开，或让 iframe 只覆盖角色周围。舞台坐标相对 iframe 本身，单位为 CSS 像素。

## 指令

每条指令是带 `protocol: 'stage/1'` 和 `type` 的对象。未知字段忽略，坐标和数字字段均须是有限数值。

| `type` | 字段 | 行为 |
| --- | --- | --- |
| `hello` | 无 | 请求版本和动作列表。已就绪的舞台回复 `ready`，正在加载的舞台在首帧后回复。 |
| `place` | `x`、`y` 各为 −32768 至 32768，`scale` 为 0.1 至 3，`facing` 为 `left` 或 `right`，可选 `durationMs` 为 0 至 5000 | 将角色脚底中心移动到该位置。缺省时长为 0。超出舞台的部分裁切。 |
| `motion` | `name` | 应用姿势，或在当前姿势上显示表情。再次发送姿势会清除该表情。 |
| `light` | `name` 为 `day`、`evening`、`night` 或 `lamp` | 调整角色整体色调。 |
| `pause` / `resume` | 无 | 暂停或继续舞台。父页隐藏标签区时应发送 `pause`。浏览器文档隐藏也自动停绘，恢复后从原处继续。 |

姿势为 `idle`、`walk`、`sit-work` 和 `sleep`。`walk` 循环迈步，跨房间位移由 `place` 控制。`sit-work` 使用坐姿和双手工作循环。`sleep` 使用闭眼睡姿和缓慢呼吸。系统开启减少动态效果时显示静止姿势，移动立即到达。

表情为 `neutral`、`happy`、`wink`、`love`、`shy`、`surprised`、`angry`、`sad`、`sleepy`、`thinking`、`smug`、`pout`、`worried`、`determined`、`flustered`、`scared`、`excited`、`cry`、`confused`。客户端以 `ready.actions` 为准。

## 事件与版本

| `type` | 其他字段 | 说明 |
| --- | --- | --- |
| `ready` | `actions: string[]` | 首帧渲染后，或收到就绪后的 `hello` 时发出。每个事件都带 `protocol: 'stage/1'`。 |
| `click` / `hover` | 无 | 角色被点击或指针进入其可交互范围。 |
| `error` | `code` | `unsupported-version` 表示版本不匹配，`invalid-command` 表示命令无效，`render-failed` 表示无法加载或绘制角色。 |

新主版本会使用新的路由与协议标识。客户端确认版本、检查动作列表，再开始发送指令。遇到 401、403、404、503、渲染错误或 20 秒内无 `ready` 时可显示本地回退。其他窗口的消息不回复。

## 桌宠暂时离开

父页用 `fetch` 向同源 `POST /api/coopanion/stage/1/away` 发送无正文的请求。响应为 `text/event-stream`，第一条事件为 `data: stage/1`，以空行结束。每条仍打开的响应流代表一个客户端。读取首个事件后保持响应流，后续每 15 秒的 `:` 注释可忽略。离开宅邸、面板卸载或用户关闭此功能时调用对应 `AbortController.abort()`。一个客户端只建立一条流。

第一个客户端进入时，当前可见的桌宠播放一次小跳后隐藏。最后一条流中止、页面关闭或连接断开后，桌宠按用户的当前显示意愿恢复。用户手动隐藏的桌宠仍保持隐藏。宿主重启清除所有旧租约。父页可在舞台 `ready` 后建立租约，渲染失败时关闭租约并显示回退。
