// SPDX-License-Identifier: AGPL-3.0-or-later
// Run only against an explicitly started, isolated dev host.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const [log, patch, evidence] = process.argv.slice(2);
assert.ok(log && patch && evidence, 'Pass isolated host log, profile patch and output file');
assert.match(patch.replaceAll('\\', '/'), /\/\.dsh-dev\/c06-home\/profiles\/c06\/cordis.patch.yml$/);
const base = 'http://127.0.0.1:3185';
const token = (await readFile(log, 'utf8')).match(/token=([^\s&]+)/)[1];
let cookies = '', url = base + '/?token=' + token;
for (let i = 0; i < 5; i++) {
  const response = await fetch(url, { redirect: 'manual', headers: { Cookie: cookies } });
  cookies = [cookies, ...response.headers.getSetCookie().map(value => value.split(';')[0])].filter(Boolean).join('; ');
  if (response.status < 300 || response.status >= 400) break;
  url = new URL(response.headers.get('location'), url).href;
}
const control = async command => {
  const response = await fetch(base + '/api/coopanion/control', { method: 'POST', headers: { Cookie: cookies, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'c06-style', method: 'coopanion/control', payload: { command } }) });
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.result.ok, true); return result.result.value;
};
let browser;
const connect = async () => {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9496');
  const page = browser.contexts()[0].pages()[0]; await page.waitForSelector('#pet[data-host-ready=true][data-mode]'); return page;
};
const result = { host: 'DSH 0.2.1-rc.2', profile: 'c06', checks: [] };
try {
  let page = await connect();
  result.devicePixelRatio = await page.evaluate(() => devicePixelRatio);
  for (const style of ['classic', 'new']) {
    await control('characters'); await page.locator('#characters:not([hidden])').waitFor();
    await page.locator('#interface-style').selectOption(style);
    await page.waitForFunction(style => document.documentElement.classList.contains('redesigned') === (style === 'new'), style);
    assert.match(await readFile(patch, 'utf8'), new RegExp('interfaceStyle: ' + style));
    result.checks.push({ style, savedToProfile: true });
    await control('restart'); await browser.close().catch(() => {});
    page = await connect();
    assert.equal(await page.locator('#interface-style').inputValue(), style);
    assert.equal(await page.locator('html').evaluate(n => n.classList.contains('redesigned')), style === 'new');
    result.checks.at(-1).nativeRestartRestored = true;
  }
  await writeFile(evidence, JSON.stringify(result, null, 2));
  console.log('Isolated real Host + Electron: new/classic persisted via settings.mutate and restored after native restarts; DPR=' + result.devicePixelRatio);
} finally { await browser?.close().catch(() => {}); }
