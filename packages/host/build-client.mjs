import { build } from 'esbuild'
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
    js: 'window.__ModuleLoader__.load({ id: "dsh-whaledot", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})
