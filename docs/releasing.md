# 完整版发布与市场更新

用户只安装 **WhaleMaid 完整版**，自动下载固定版本的配套 Coopanion，并由同一个 bundle 启用两部分。源码开发时两个仓库保持独立；发行构建会把自有 MIT core 放入 host 包，并在生成的安装包中加入 AGPL 桌宠依赖及配置，不复制桌宠实现或媒体。

## 后续更新

1. 如果桌宠也有改动，先按 [fork 发布流程](https://github.com/Xiaxin1235/dsh-coopanion/blob/whaledot-local/docs/releasing.md)发布其新版本，等待 GitHub Release 成功。更新本仓库 `market/companion.json` 中的版本、完整提交及固定下载地址；无桌宠改动时沿用原值。
2. 同步提升根目录、`packages/core` 和 `packages/host` 的版本，更新 `CHANGELOG.md`，运行 `pnpm install --lockfile-only` 并提交。完成 build、test、test:package、typecheck、lint 和 format:check。
3. 推送 master 后，新建并推送对应稳定标签，例如 `git tag v1.1.2`、`git push origin v1.1.2`。版本仅为示例，应使用实际版本。不要移动已发布标签。
4. **Release complete WhaleMaid** 自动重跑检查，验证配套 Release 的版本、源码提交及下载摘要，再生成完整安装包。通过后发布 GitHub Release、同字节的固定下载别名、校验文件，以及供原生 Discover 安装的不可变 Git 包分支，并更新 `market/index.json`。无 npm 上传步骤。

流程失败时查看 Actions 的具体步骤；未成功发布前不宣称完成。修复已打标签的候选时使用新版本和新标签，保留旧失败记录。发布步骤可对同一标签手动重跑；已存在的包树或附件必须与本轮一致，不覆盖不同内容。

## 用户入口

| 场景             | 入口                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原生插件市场     | 插件 → Discover／发现 → 管理索引源，添加 `https://raw.githubusercontent.com/Xiaxin1235/WhaleMaid/master/market/index.json`，选择 WhaleMaid 完整版并安装 |
| 下载完整包       | [最新 Release](https://github.com/Xiaxin1235/WhaleMaid/releases/latest)，附件 `dsh-whalemaid-full.tgz`                                                  |
| 社区公共市场投稿 | `market/Xiaxin1235__WhaleMaid--packages-host.yml`，只投稿这一条功能入口                                                                                 |

原生 Discover 的 format 1 只支持 npm 或固定提交的 Git 来源，所以发布流程把经过验证的压缩包文件树提交到独立的 `codex/market-package-vX.Y.Z` 分支；该分支不包含用户数据或开发依赖。索引固定完整提交，后续发布新增版本而不移动旧包。社区市场使用 GitHub Release 的固定别名；正常更新无需重新投稿。

自定义市场源只对添加了该源的用户可见。社区公共目录另有仓库满 24 小时及维护者审核要求，Release 或索引发布不能代替收录。投稿不修改生成的 README，不修改别人的条目；fork 关系、原作者署名、许可证和对应源码必须保持可见。

完整包升级前备份配置和数据。原来分别安装两个 bundle 的用户先按[安装说明](install.md#complete-installation)迁移，以免重复启用桌宠。卸载完整包会移除两部分配置，保留数据。
