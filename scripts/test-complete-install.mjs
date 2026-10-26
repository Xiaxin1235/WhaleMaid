import assert from 'node:assert/strict'
import process from 'node:process'
import { setTimeout, clearTimeout } from 'node:timers'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { chromium } from 'playwright-core'

const root = await realpath(await mkdtemp(join(tmpdir(), 'whalemaid-complete-')))
const home = join(root, 'home'),
  profileName = 'complete-install',
  profile = join(home, 'profiles', profileName)
const cli = resolve('.dsh-dev/complete-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js')
const archive = resolve('dist/release/dsh-whalemaid-full.tgz')
const report = JSON.parse(await readFile('dist/release/verification.json', 'utf8'))
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programw6432|display|xauthority|xdg_runtime_dir)$/i.test(
      key,
    ),
  ),
)
Object.assign(environment, {
  DSH_HOME: home,
  DSH_TELEMETRY: '0',
  DSH_PET_TEST_DATA_DIR: join(root, 'pet'),
  DSH_PET_TEST_NO_SANDBOX: '1',
})
const listener = createServer().listen(0, '127.0.0.1')
await once(listener, 'listening')
const port = listener.address().port
await new Promise((done) => listener.close(done))
environment.DSH_PET_TEST_DEBUG_PORT = String(port)
let host,
  browser,
  petBrowser,
  hostLog = ''
const run = async (args) => {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-16000)
    })
  const timeout = setTimeout(() => child.kill('SIGKILL'), 600000)
  try {
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, output)
  } finally {
    clearTimeout(timeout)
  }
}
try {
  await mkdir(profile, { recursive: true })
  await writeFile(
    join(profile, 'package.json'),
    JSON.stringify({
      name: 'whalemaid-complete-test',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }),
  )
  await writeFile(
    join(profile, 'pnpm-workspace.yaml'),
    'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n',
  )
  await run(['plugin', '--profile', profileName, 'add', archive])
  const installed = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  assert.ok(installed.dsh.profile.bundles.includes('dsh-whalemaid'))
  assert.ok(
    !installed.dsh.profile.bundles.includes('@takboo/dsh-coopanion'),
    'one complete bundle owns both components',
  )
  const maid = JSON.parse(await readFile(join(profile, 'node_modules/dsh-whalemaid/package.json'), 'utf8'))
  const pet = JSON.parse(
    await readFile(join(profile, 'node_modules/@takboo/dsh-coopanion/package.json'), 'utf8'),
  )
  assert.equal(maid.version, report.version)
  assert.equal(pet.version, report.companion.version)
  const observer = join(root, 'observer')
  await mkdir(observer)
  await writeFile(
    join(observer, 'package.json'),
    '{"name":"complete-install-observer","type":"module","private":true}',
  )
  await writeFile(
    join(observer, 'index.mjs'),
    `export const inject=['appReady','appExit','webServer','connection'];export function apply(ctx){ctx.effect(()=>ctx.appReady.onReady(()=>process.send?.({type:'ready',url:ctx.connection.authenticatedUrl('http://127.0.0.1:'+ctx.webServer.port+'/')})));ctx.effect(()=>{const handler=m=>{if(m?.type==='shutdown')ctx.appExit(0)};process.on('message',handler);return()=>process.off('message',handler)});}`,
  )
  await writeFile(
    join(profile, 'cordis.patch.yml'),
    `- insert:\n    - id: complete-observer\n      name: ${JSON.stringify(join(observer, 'index.mjs').replaceAll('\\', '/'))}\n- id: locale\n  config:\n    preference: en\n- id: ui-settings-models\n  config:\n    credentialOnboarding: false\n`,
  )
  host = spawn(process.execPath, [cli, '--profile', profileName, '--no-open', '--port', '0'], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  for (const stream of [host.stdout, host.stderr])
    stream.on('data', (chunk) => {
      hostLog = (hostLog + chunk).slice(-16000)
    })
  const url = await new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('Complete host startup timed out')), 120000)
    host.on('message', (m) => {
      if (m?.type === 'ready') {
        clearTimeout(timeout)
        done(m.url)
      }
    })
    host.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Complete host exited ${code}`))
    })
  })
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await page.getByRole('button', { name: 'WhaleMaid', exact: true }).click()
  await page.getByRole('heading', { name: 'WhaleMaid', exact: true }).waitFor()
  await page.getByText(report.version, { exact: true }).waitFor()
  assert.equal(await page.getByRole('alert').count(), 0, 'WhaleMaid status API is healthy')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/complete-host.png' })
  petBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const petPage = petBrowser.contexts()[0].pages()[0]
  await petPage.waitForSelector('#pet[data-host-ready=true]')
  await petPage.screenshot({ path: 'artifacts/complete-pet.png' })
  assert.deepEqual(errors, [])
  await browser.close()
  browser = undefined
  await petBrowser.close()
  petBrowser = undefined
  const exited = once(host, 'exit')
  host.send({ type: 'shutdown' })
  await exited
  host = undefined
  await run(['plugin', '--profile', profileName, 'remove', 'dsh-whalemaid'])
  const removed = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  assert.ok(!removed.dsh.profile.bundles.includes('dsh-whalemaid'))
  await writeFile(
    'artifacts/complete-install.json',
    JSON.stringify(
      {
        platform: process.platform,
        dsh: process.env.DSH_TEST_VERSION,
        version: report.version,
        sha256: report.sha256,
        companion: pet.version,
        singleBundle: true,
        hostUi: true,
        nativePet: true,
        uninstalled: true,
        modelCalls: 0,
      },
      null,
      2,
    ),
  )
  console.log(
    'Complete installation passed: one bundle, both components, real host UI and native pet, clean removal; no model calls.',
  )
} catch (error) {
  console.error(hostLog.replace(/([?&]token=)[^&\s]+/g, '$1[REDACTED]'))
  throw error
} finally {
  await browser?.close()
  await petBrowser?.close()
  if (host?.connected) {
    const exited = once(host, 'exit')
    host.send({ type: 'shutdown' })
    const timer = setTimeout(() => host.kill('SIGKILL'), 10000)
    await exited
    clearTimeout(timer)
  }
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
}
