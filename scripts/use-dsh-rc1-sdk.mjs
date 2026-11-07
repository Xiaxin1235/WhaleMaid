import { readFileSync, writeFileSync } from 'node:fs'
import { dump, load } from 'js-yaml'

const sdk = '0.2.2-rc.1'
const host = 'packages/host/package.json'
const root = 'package.json'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, manifest) => writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')

const plugin = read(host)
for (const name of Object.keys(plugin.devDependencies))
  if (name.startsWith('@deepseek-ai/dsh-')) plugin.devDependencies[name] = sdk
plugin.devDependencies['@deepseek-ai/cordis'] = '4.1.0'
plugin.devDependencies['@deepseek-ai/dsh-tool-executor-native'] = sdk
plugin.devDependencies['@deepseek-ai/dsh-tool-executor-ptc'] = sdk
write(host, plugin)
const workspace = read(root)
workspace.devDependencies['@deepseek-ai/dsh-plugin-market-index'] = sdk
write(root, workspace)

// Exercise the new runtime dependencies without changing the production manifest ranges.
const config = 'pnpm-workspace.yaml'
const settings = load(readFileSync(config, 'utf8'))
settings.overrides = {
  ...settings.overrides,
  '@deepseek-ai/dsh-atomic-write': sdk,
  '@deepseek-ai/dsh-home-paths': sdk,
  '@deepseek-ai/schemastery': '3.19.0',
}
writeFileSync(config, dump(settings))
