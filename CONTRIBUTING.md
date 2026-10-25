# 参与开发

先阅读 [架构与开发路线](docs/架构与开发路线.md)，按当前里程碑实现，保持改动范围明确。

## 提交规范

提交信息采用 Conventional Commits，英文祈使句，例如 `chore: scaffold WhaleMaid monorepo`、
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
`@takboo/dsh-coopanion` 是独立 AGPL-3.0 项目，其代码与角色素材不属于 WhaleMaid。
可阅读允许参考的项目以理解公开 API，但不要整段复制；借鉴实现时在文件头注明来源及许可证。
新增依赖应小而必要，并检查许可证。WhaleMaid 自有代码采用 MIT。

`pnpm lint` 包含 `pnpm check:license` 和 `pnpm check:links`。前者扫描 Git 跟踪文件的依赖、模块引用、包许可及鲸鱼协作报告的长代码块；后者离线检查 Markdown/HTML 的相对路径和文档锚点，不检查外部网站是否在线。构建后的本地包还需核对清单，不能仅靠 files 字段推断发行内容。

完整许可对照需要独立鲸鱼仓库的只读参考，可运行：

```sh
pnpm check:license --reference D:/dsh_plugins/dsh-coopanion
```

对照会计算本仓库跟踪文件与参考已提交树的 SHA-256，并检查去空白后的 16 行相同片段及内嵌 SVG/data URI；参考默认固定为运行开始时的 HEAD，可用 --revision 指定提交，不混入并发未提交改动，也不把参考源代码写入本仓库。不提供参考时，基础检查仍运行，但不会宣称已做完整比对。检查只能发现这些范围内的重合，不能证明所有改写内容的来源或第三方角色权利。详见 [P18 报告](docs/p18-report.md)。

## Contributing in English

Use the pnpm version specified in `package.json`. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` before submitting. Keep changes focused and use an isolated DSH profile for integration work. `pnpm lint` includes the license-boundary and local documentation-link checks; `pnpm check:license --reference <independent-coopanion-repository>` adds a read-only comparison with that repository. WhaleMaid is MIT-licensed; do not copy AGPL code or third-party character assets into it. See the [English README](README.en.md) for project entry points.
