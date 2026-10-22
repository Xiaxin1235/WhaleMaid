# 参与开发

先阅读 [架构与开发路线](docs/架构与开发路线.md)，按当前里程碑实现，保持改动范围明确。

## 提交规范

提交信息采用 Conventional Commits，英文祈使句，例如 `chore: scaffold WhaleDot monorepo`、
`feat(core): add task transitions` 或 `fix(host): handle initialization errors`。
一次提交围绕一个可审查的任务；不要提交生成的 `lib/`、依赖目录、数据库、密钥或本地 DSH 状态。

## 代码与测试

- 使用 TypeScript strict、ESM；相对运行时导入使用 `.js` 扩展名；公共函数附简短 JSDoc。
- 领域逻辑放 `core`，不做 IO；时间和 ID 由注入的 `Clock` / `IdGen` 提供。
- DSH API 先查官方类型、README 或参考插件，注明出处，不臆造接口。
- 新增行为配 Vitest 单测，修复缺陷补相应用例；未知结果不得记为成功。
- 提交前执行 `pnpm -r build`、`pnpm -r test`、`pnpm lint`、`pnpm typecheck` 和 `pnpm format:check`。
- DSH 联调仅使用[独立测试环境](docs/dev-dsh.md)，不改用户的 desktop/web profile。

## 第三方内容

不要提交第三方代码或素材；不要复制 AGPL 代码。
`@takboo/dsh-coopanion` 是独立 AGPL-3.0 项目，其代码与角色素材不属于 WhaleDot。
可阅读允许参考的项目以理解公开 API，但不要整段复制；借鉴实现时在文件头注明来源及许可证。
新增依赖应小而必要，并检查许可证。WhaleDot 自有代码采用 MIT。
