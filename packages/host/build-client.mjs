import { build } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'
import { URL } from 'node:url'

const welcomeArt = {}
for (const [key, file, mime] of [
  ['webp', 'dafeiyu.webp', 'image/webp'],
  ['gif', 'dafeiyu.gif', 'image/gif'],
  ['still', 'dafeiyu-still.png', 'image/png'],
]) {
  const source = new URL('./welcome/' + file, import.meta.url)
  const stat = statSync(source, { throwIfNoEntry: false })
  if (!stat) continue
  if (stat.size > 600_000) throw Error('Welcome artwork welcome/' + file + ' exceeds 600 KB')
  const bytes = readFileSync(source)
  welcomeArt[key] = 'data:' + mime + ';base64,' + bytes.toString('base64')
}
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react'],
  define: { __WHALEMAID_WELCOME_ART__: JSON.stringify(welcomeArt) },
  loader: { '.css': 'text' },
  sourcemap: false,
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-whalemaid", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})
