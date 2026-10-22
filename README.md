# WhaleDot

WhaleDot is a Project Autopilot plugin for DeepSeek Harness (DSH).

WhaleDot 在用户授权范围内推进长期项目，计划提供目标与任务管理、独立验收、进度与决策通知。
状态：**早期开发中**。已具备仓库脚手架与 core 领域基元；完整自主推进闭环尚未实现。

推荐搭配 [`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion) 获得鲸鱼桌宠。
它是独立的 **AGPL-3.0** 项目；WhaleDot 为 **MIT**，不包含其代码或素材，也不直接依赖它。
后续协作仅通过 DSH 公开服务与事件进行。桌宠是可选增强。

## 结构与设计

| 路径            | 用途                                                           |
| --------------- | -------------------------------------------------------------- |
| `packages/core` | `@whaledot/core`，纯 TypeScript 模型、状态机、依赖图与范围策略 |
| `packages/host` | `dsh-whaledot`，Cordis 插件；预留 `src/client/` 面板目录       |
| `docs/`         | 架构与开发文档                                                 |
| `prompts/`      | 分阶段实现提示词                                               |

工程决策以[架构与开发路线](docs/架构与开发路线.md)为准；产品讨论稿见[项目规划](项目规划.txt)。
core 的 API 与 Host 责任见 [领域层约定](docs/core-domain.md)。WhaleDot 不实现桌宠窗口或 Electron 应用。

## 开发

使用 Node.js ≥22.19（推荐 Node 24）和 `package.json` 指定的 pnpm 11。

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format
pnpm format:check
```

`pnpm build` 按 workspace 依赖顺序构建；`pnpm test` 使用 Vitest projects 运行全部包。
每个包也可独立执行，例如 `pnpm --filter @whaledot/core build`、`pnpm --filter dsh-whaledot test`。
构建产物为各包的 `lib/index.js`、source map 与 `lib/types/index.d.ts`。

DSH 隔离联调步骤见 [docs/dev-dsh.md](docs/dev-dsh.md)。协作约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。
