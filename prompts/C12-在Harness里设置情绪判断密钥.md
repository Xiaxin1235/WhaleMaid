# C12 鲸鱼插件：在 Harness 设置页里直接填写情绪判断的 API Key

**前置**：`whaledot-local` 分支工作区干净，最新提交至少包含 `7edfc3c feat: optional OpenAI Decisions reaction for reply mood`。若工作区不干净，先停下说明。先跑一遍 `npm test` 与 `npm run test:inbox-ui`，确认基线通过。

**执行环境**：本任务要写 `D:\dsh_plugins\dsh-coopanion`，报告和证据写在 `D:\dsh_plugins\WhaleDot`，还要能运行 Git、Chromium 和 Electron。会话必须在开始时就具备这些权限；发现做不到，立即停下说明，不要只写一半代码。宿主为 DSH Desktop **0.2.1-rc.3**。

## 背景

C02 的“回复情绪表情”现在只从**环境变量**读取 `OPENAI_API_KEY` / `OPENROUTER_API_KEY`（`src/reaction-decider.ts` 的 `key()`）。用户要先去 Windows 设置环境变量，再从开始菜单重启 Harness，太麻烦。用户希望**在 Harness 的 Settings → 桌宠里直接填写和修改密钥**。

DSH 自带凭据服务 `ctx.credentials`（包 `@deepseek-ai/dsh-credentials`，说明见 `node_modules/@deepseek-ai/dsh-credentials/README.zh.md`），默认组合已经包含本地存储：

- `credentialRef('OPENAI_API_KEY')` 这类引用就是环境变量名。
- `resolve(ref)` 按“启动环境变量 → 已存储的值”取当前值，每次调用都重新读，**改了密钥下一次请求就生效，无需重启**。
- `describe(ref)` 只返回 `{ configured, source?, writable }`，**从不返回值**。
- `set(ref, value)` / `unset(ref)` 用来存储或移除。如果启动环境里已经有同名变量，它会被报告为只读，`set` 会被拒绝。
- 值存在 DSH 的本地凭据文件里，与 DeepSeek 等模型的 API Key 同处；不写进插件设置或 `cordis.yml`。

本任务用这套服务替代“只读环境变量”。

## 先查证（写进回报，附 rc.3 类型定义出处）

1. 鲸鱼插件宿主端能否拿到 `ctx.credentials`？需要 `ctx.inject(['credentials'], …)` 还是 `ctx.get`？
2. `credentialRef` 是否需要作为运行时依赖从 `@deepseek-ai/dsh-credentials` 导入？如果需要：
   - 按现有 `peerDependencies` 的写法加入，版本范围与其他 `@deepseek-ai/*` 一致；
   - 同步 `npm-shrinkwrap.json`，让 `verify:metadata` 通过。
   
   若能避免新增依赖（例如它只是带品牌的字符串），说明理由。
3. 现有设置页（`src/client/Settings.tsx`）向宿主发请求所走的已认证通道，即 `connection` 的 dispatch 端点，是否只接受本机 owner？新端点必须走同一条通道，**不能**开放给未认证的调用方。
4. `describe` 返回的 `source` 有哪些取值，比如环境变量或本地存储，怎样映射成用户看得懂的说明。

## 实现

### 1. 宿主端读取密钥

- `ReactionDecider` 的 `key(provider)` 改为通过 `ctx.credentials.resolve(credentialRef(...))` 取值，每次判断前读取一次，不做缓存。
- 环境变量仍然有效：`resolve` 本身就先查启动环境。
- `credentials` 服务不可用时，回退到读取 `process.env`，并在状态里注明。
- `status()` 中的 `keyAvailable` 改用 `describe` 的结果，另外返回 `source` 和 `writable`。

### 2. 新增设置端点（走现有已认证通道）

- `reaction-key-status`：返回两个服务各自的 `{ configured, source, writable }`。**不返回值。**
- `reaction-key-set`：参数 `{ provider, value }`。
  - 去掉首尾空白后，长度 1–512，只允许可打印 ASCII，否则拒绝；
  - 调用 `credentials.set`；
  - 返回新的状态。
  - 被环境变量遮蔽时返回明确错误：“该密钥由系统环境变量提供，请先删除环境变量”。
- `reaction-key-clear`：调用 `credentials.unset`，返回新的状态。
- 请求体、响应、日志、诊断、错误信息中都**不得出现密钥值**。日志里最多写“已更新 OpenRouter 密钥”。

### 3. 设置页

在“回复情绪表情”区块内，按当前所选服务显示：

- **状态**：未设置 / 已设置（保存在 Harness）/ 已设置（来自系统环境变量，只读）。
- **密钥输入框**：
  - `type="password"`，`autocomplete="off"`，不回显已存储的值；
  - 占位文字写“输入新的密钥以替换”；
  - 保存成功后**立即清空输入框**。
- **按钮**：“保存密钥”“清除密钥”。来源为环境变量时两个按钮都禁用，并说明原因。
- **说明文字**：密钥保存在本机 Harness 的凭据存储中，与模型的 API Key 一样；插件设置和日志里不会出现。
- **中英文案**放 `src/client/locales.ts`。

桌宠菜单里的开关不变，不在桌宠窗口里放密钥输入框。

### 4. 文档

`docs/usage.md` 中“可选的回复情绪表情”一节改为：

- 推荐做法：在设置页填写密钥，保存后立即生效，无需重启；
- 环境变量方式仍然可用，但优先级更高，会让设置页变为只读；
- 怎样清除密钥。

## 测试

- **单元**（模拟 `credentials` 服务）：
  - `resolve` 取值与热更新：第二次判断使用新值；
  - 服务缺失时回退到 `process.env`；
  - `set` 遇到环境变量遮蔽时返回明确错误；
  - 空值、超长、含控制字符的值被拒绝；
  - 状态端点不含值；
  - 日志和错误信息中不出现测试密钥字符串，用一个独特的假值做全局断言。
- **设置页**：
  - 保存后输入框清空；
  - 来源为环境变量时按钮禁用；
  - 中英文案显示正常。
- `npm test`、`npm run test:inbox-ui`、`npm run test:desktop`、`npm run verify:metadata` 全部通过。

## 验收（WhaleDot 隔离环境）

环境要求：

- profile `whaledot-p02`，启动命令 `$env:DSH_PET_TEST_DEBUG_PORT='9498'; & .\scripts\dev-host.ps1 -UseUiKey`；
- 测试鲸鱼使用 `DSH_PET_TEST_DATA_DIR`；
- **启动终端里不要设置** `OPENAI_API_KEY` / `OPENROUTER_API_KEY`。

**密钥的处理**：

- 由**用户本人**在设置页输入真实密钥；
- 你只能使用明显的假值，例如 `test-not-a-real-key-123`，来验证保存、清除、状态和“不回显”；
- 不要索取、读取、打印或记录真实密钥。

**步骤**：

1. 打开设置页，所选服务的状态为“未设置”。用假值保存，状态变为“已设置（保存在 Harness）”，输入框已清空。检查隔离环境的凭据文件存在对应条目，只核对**条目名**，不打印值；确认插件设置和日志中没有假值。截图。
2. 清除密钥，状态回到“未设置”。
3. 用户本人填入真实密钥并保存，**不重启宿主**，让一条回复触发判断，鲸鱼做出表情。记录返回的表情和耗时。
4. 用户没有提供真实密钥时，第 3 步标为“待用户”，不要伪造结果。
5. 清理：
   - 清除测试中保存的密钥；
   - 停止测试宿主与测试鲸鱼，3182 / 9498 无监听；
   - 恢复隔离配置；
   - 不在日常 profile 测试。

报告写到 `D:\dsh_plugins\WhaleDot\docs\coopanion\c12-report.md`（prettier 格式），证据放 `D:\dsh_plugins\WhaleDot\.dsh-dev\c12-evidence\`。证据中不得出现任何真实或假的密钥值。报告不要提交进 coopanion 仓库。

## 提交

在 coopanion 本地提交 `feat: set reaction API keys from Harness settings`，不推送。完成后停下，等审查。

## 不做

- 不把密钥写进插件设置、`cordis.yml` 或浏览器存储。
- 不在桌宠窗口里放密钥输入框。
- 不改判断逻辑、发送范围和限额。
- 不改 WhaleDot。
