// Run explicitly: node tests/billing-phase-ui.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { previewServer } from '../scripts/preview.mjs';
import { observeBodyReady } from './helpers/body-startup.mjs';

const directory = await mkdtemp(join(tmpdir(), 'whalemaid-billing-ui-'));
const server = previewServer({ dataDir: directory });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await observeBodyReady(page, 'billing-phase')('#pet[data-character=whale][data-mode]');
  await page.locator('#billing-phase:not([hidden])').waitFor();
  assert.match(await page.locator('#billing-phase').textContent(), /^(?:峰期|谷期 5折) · 距(?:峰|谷)期 /);
  const noHitInterception = await page.locator('#billing-phase').evaluate(node => getComputedStyle(node).pointerEvents);
  assert.equal(noHitInterception, 'none', 'the badge must not block desktop clicks');
  await page.locator('#pet').click({ button: 'right', force: true });
  await page.locator('#toggle-billing').click();
  assert.equal(await page.locator('#billing-phase').isVisible(), false, 'the menu toggle hides the badge');
  assert.equal(await page.locator('#toggle-billing').getAttribute('aria-checked'), 'false');
  await page.reload();
  await observeBodyReady(page, 'billing-phase-reload')('#pet[data-character=whale][data-mode]');
  assert.equal(await page.locator('#billing-phase').isVisible(), false, 'preference persists across reloads');
  await page.locator('#pet').click({ button: 'right', force: true });
  await page.locator('#toggle-billing').click();
  await page.locator('#billing-phase:not([hidden])').waitFor();
  assert.equal(await page.locator('#toggle-billing').getAttribute('aria-checked'), 'true');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Billing phase pet UI: badge, toggle, persistence, click-through passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
