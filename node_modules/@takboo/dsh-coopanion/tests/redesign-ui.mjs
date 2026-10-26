// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { previewServer } from '../scripts/preview.mjs';
import { contrast } from '../web/panel-style.js';

const directory = await mkdtemp(join(tmpdir(), 'dsh-redesign-'));
const evidence = process.env.DSH_C06_EVIDENCE ?? 'artifacts/redesign';
await mkdir(evidence, { recursive: true });
const server = previewServer({ dataDir: directory }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.actions = []; window.dshPetBridge = { subscribe(fn) { window.receive = fn; }, action(value) { window.actions.push(value); }, hit() {} }; });
  const receive = message => page.evaluate(message => window.receive(message), message);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForSelector('#pet[data-character=whale][data-mode]');
  const focus = { id: 'c06-focus', label: '演示会话', mood: 'idle', chatAvailable: true, reply: '任务完成啦！要不要休息一下？' };
  const snapshot = { mood: 'idle', sessionId: focus.id, sessions: [focus], results: [{ id: 'c06-result', sessionId: focus.id, text: focus.reply, time: Date.now(), read: false }] };
  const item = { id: 'c06-question', nativeId: 'question', sessionId: focus.id, kind: 'question', state: 'open', turn: 1, seq: 1, preview: '接下来要怎么做？', questions: [{ id: 'q', question: '接下来要怎么做？', options: [{ label: '继续检查', description: '在已有授权内核对结果。' }, { label: '先停一下', description: '保持当前状态。' }] }] };
  await receive({ type: 'init', baseline: true, options: { locale: 'zh', roam: false }, snapshot });
  await receive({ type: 'notification-state', snapshot: { protocol: 1, runtime: { phase: 'running', visible: true, generation: 1, visibilityRevision: 1, suspended: false }, interactions: [item] } });
  assert.equal(await page.locator('.apron-identity svg[aria-hidden=true]').count(), 3);
  await page.evaluate(async () => { for (const weight of [400, 600, 700, 800]) { const loaded = await document.fonts.load(`${weight} 16px Nunito`); if (!loaded.length) throw new Error('Bundled Nunito failed to load'); } });
  const capture = async filename => {
    const clip = await page.evaluate(() => {
      const panels = ['chat', 'menu', 'requests'].map(id => document.getElementById(id)).filter(n => !n.hidden);
      const rects = [...panels, document.getElementById('pet')].map(n => n.getBoundingClientRect());
      const x = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - 26)), y = Math.max(0, Math.floor(Math.min(...rects.map(r => r.top)) - 26));
      return { x, y, width: Math.min(innerWidth - x, Math.ceil(Math.max(...rects.map(r => r.right)) - x + 26)), height: Math.min(innerHeight - y, Math.ceil(Math.max(...rects.map(r => r.bottom)) - y + 26)) };
    });
    await page.screenshot({ path: join(evidence, filename), clip });
  };
  const openChat = async () => { await page.keyboard.press('Escape'); await page.locator('#pet').dblclick(); await page.locator('#chat:not([hidden])').waitFor(); };
  const openMenu = async () => { await page.keyboard.press('Escape'); await page.locator('#pet').click({ button: 'right' }); await page.locator('#menu:not([hidden])').waitFor(); };
  const openInbox = async () => { await page.keyboard.press('Escape'); await page.locator('#attention').click(); await page.locator('#requests:not([hidden])').waitFor(); };
  await openChat();
  await page.locator('#message').fill('保留这份草稿\n第二行');
  const baseline = await page.locator('#message').inputValue();
  for (const style of ['classic', 'new', 'classic', 'new']) {
    await openMenu(); await page.locator('#open-characters').click();
    await page.locator('#interface-style').selectOption(style);
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), { type: 'preference', field: 'interfaceStyle', value: style });
    await receive({ type: 'configure', options: { interfaceStyle: style } });
    assert.equal(await page.locator('html').evaluate(n => n.classList.contains('redesigned')), style === 'new');
    await openChat(); assert.equal(await page.locator('#message').inputValue(), baseline);
    assert.equal(await page.locator('#chat-title').innerText(), style === 'new' ? '我在呢～慢慢说！' : '我在，慢慢说。');
    await openInbox(); assert.equal(await page.locator('.request-card').count(), 1);
  }
  await openMenu();
  await page.locator('#companion-segments [data-companionship=quiet]').click();
  assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), { type: 'preference', field: 'companionship', value: 'quiet' });
  await receive({ type: 'configure', options: { companionship: 'quiet' } });
  assert.equal(await page.locator('#companion-segments [data-companionship=quiet]').getAttribute('aria-checked'), 'true');
  await page.locator('#companion-segments [data-companionship=quiet]').focus(); await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), { type: 'preference', field: 'companionship', value: 'interactive' });
  await page.locator('#toggle-roam').click();
  assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), { type: 'preference', field: 'roam', value: true });
  await receive({ type: 'configure', options: { roam: false } });
  // Theme changes go through the real character scheme controls.
  for (const [scheme, filename] of [['deepseek', 'blue'], ['claude', 'claude'], ['qwen', 'purple']]) {
    await openMenu(); await page.locator('#open-characters').click();
    const values = await page.locator('#character-scheme option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent })));
    const option = values.find(v => v.value.includes(scheme) || v.text.toLowerCase().includes(scheme));
    assert.ok(option, `scheme ${scheme} exists: ${JSON.stringify(values)}`);
    await page.locator('#character-scheme').selectOption(option.value); await page.locator('#character-use').click();
    await page.waitForFunction(value => document.getElementById('pet').dataset.scheme === value, option.value);
    await openChat();
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement), rgb = id => getComputedStyle(document.getElementById(id)).color;
      return { accent: root.getPropertyValue('--accent').trim(), action: root.getPropertyValue('--action').trim(), body: rgb('message'), muted: getComputedStyle(document.querySelector('.compose-footer small')).color, button: rgb('send') };
    });
    const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('');
    assert.ok(contrast(hex(colors.body)) >= 4.5); assert.ok(contrast(hex(colors.muted)) >= 4.5); assert.ok(contrast(hex(colors.button), colors.action) >= 4.5);
    for (const scale of [.85, 1, 1.3]) {
      await page.evaluate(scale => document.documentElement.style.setProperty('--text-scale', String(scale)), scale);
      for (const [id, open] of [['chat', openChat], ['menu', openMenu], ['requests', openInbox]]) {
        await open();
        const geometry = await page.locator('#' + id).evaluate(panel => {
          const r = panel.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: panel.scrollWidth > panel.clientWidth + 1 };
        });
        assert.ok(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry));
        assert.equal(geometry.overflow, false);
        for (const button of await page.locator(`#${id} button:visible`).all()) {
          const dimensions = await button.evaluate(n => ({ h: n.getBoundingClientRect().height, overflow: n.scrollWidth > n.clientWidth + 1 }));
          assert.ok(dimensions.h >= 32, JSON.stringify(dimensions)); assert.equal(dimensions.overflow, false);
        }
      }
    }
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1'));
    await openChat(); await capture(`chat-${filename}.png`);
    if (filename === 'blue') {
      await openMenu(); await capture('menu-blue.png');
      await openInbox(); await page.locator('.inline-question').evaluate(n => { if (!n.open) n.querySelector('summary').click(); }); await capture('inbox-blue.png');
    }
  }
  await page.keyboard.press('Escape');
  await page.locator('#pet').hover(); await page.mouse.down(); await page.mouse.move(600, 50, { steps: 12 });
  await page.waitForSelector('#pet[data-mode=drag]');
  await page.locator('#pet').focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#chat[data-tail=top]:not([hidden])');
  assert.equal(await page.locator('#chat').evaluate(n => getComputedStyle(n, '::after').top), '-10px');
  await capture('chat-tail-top.png');
  await page.mouse.up();
  await page.waitForSelector('#chat[data-tail=bottom]:not([hidden])');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const open of [openChat, openMenu, openInbox]) { await open(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
  assert.deepEqual(errors, []);
  console.log('Redesign UI passed: styles preserve drafts and requests; preference actions, radio keyboard, real outfits, contrast, 3 scales, 3 panels, 125% raster and narrow viewport.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
