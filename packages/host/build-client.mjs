import { build } from 'esbuild'
import { statSync } from 'node:fs'
import { URL } from 'node:url'

// Welcome artwork ships as separate files read by the host on demand; it is not bundled here.
for (const file of ['dafeiyu.webp', 'dafeiyu.gif', 'dafeiyu-still.png']) {
  const stat = statSync(new URL('./welcome/' + file, import.meta.url), { throwIfNoEntry: false })
  if (stat && stat.size > 600_000) throw Error('Welcome artwork welcome/' + file + ' exceeds 600 KB')
}
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react'],
  loader: { '.css': 'text' },
  sourcemap: false,
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-whalemaid", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})
