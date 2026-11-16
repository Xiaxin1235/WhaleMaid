// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { observeBodyReady } from './helpers/body-startup.mjs';
import { previewServer } from '../scripts/preview.mjs';
import { contrast } from '../web/panel-style.js';

const before = process.argv.includes('--record-before');
const evidence = process.env.DSH_C07_EVIDENCE ?? 'artifacts/polish';
const directory = await mkdtemp(join(tmpdir(), 'dsh-polish-'));
await mkdir(evidence, { recursive: true });
const server = previewServer({ dataDir: directory }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
  page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.polishActions = []; window.dshPetBridge = { subscribe(fn) { window.receive = fn; }, action(value) { window.polishActions.push(value); }, hit() {} }; });
  const receive = message => page.evaluate(message => window.receive(message), message);
  if (before) {
    for (const [file, contentType] of [['redesign.css', 'text/css'], ['panel-style.js', 'text/javascript']]) {
      const body = execFileSync('git', ['show', `1f45a23:web/${file}`], { encoding: 'utf8' });
      await page.route('**/' + file, route => route.fulfill({ contentType, body }));
    }
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`); await observeBodyReady(page, 'polish-ui')('#pet[data-character=whale][data-mode]');
  // Fix only screenshot placement to avoid subpixel anchors from the breathing figure.
  await page.addStyleTag({ content: '#chat,#menu,#requests{left:16px!important;top:16px!important}' });
  const session = { id: 'polish-session', label: '界面打磨', mood: 'waiting', active: false, chatAvailable: true, replyId: 'reply', reply: '已经检查好啦。' };
  const snapshot = { sessionId: session.id, mood: 'waiting', sessions: [session], results: [{ id: 'reply', sessionId: session.id, time: 1792756800000, text: session.reply, read: false }] };
  const item = { id: 'polish-question', nativeId: 'polish-q', sessionId: session.id, kind: 'question', state: 'open', turn: 1, seq: 1, preview: '接下来怎么做？', questions: [{ id: 'q', question: '接下来怎么做？', options: [{ label: '继续检查', description: '继续核对，不扩大授权。' }, { label: '先停一下', description: '保留当前状态。' }] }] };
  await receive({ type: 'init', baseline: true, options: { locale: 'zh', roam: false }, snapshot });
  await receive({ type: 'notification-state', snapshot: { protocol: 1, runtime: { phase: 'running', visible: true, generation: 1, visibilityRevision: 1, suspended: false }, interactions: [item] } });
  const open = async panel => {
    await page.keyboard.press('Escape');
    if (panel === 'chat') await receive({ type: 'ui-control', command: 'chat' });
    if (panel === 'menu') await page.locator('#pet').dispatchEvent('contextmenu');
    if (panel === 'requests') await page.locator('#attention').click();
    await page.locator(`#${panel}:not([hidden])`).waitFor(); await page.mouse.move(0, 0);
    await page.locator(`#${panel} header button`).evaluateAll(nodes => nodes.forEach(n => n.blur()));
    await page.evaluate(() => document.fonts.ready);
  };
  const capture = (selector, name) => page.locator(selector).screenshot({ path: join(evidence, name), animations: 'disabled' });
  const classic = {};
  for (const style of ['classic', 'new']) {
    await receive({ type: 'configure', options: { interfaceStyle: style } });
    for (const panel of ['chat', 'menu', 'requests']) {
      await open(panel);
      if (style === 'classic') {
        const name = `${before ? 'before' : 'after'}-classic-${panel}.png`;
        const current = await capture('#' + panel, name), baseline = join(evidence, `before-classic-${panel}.png`);
        classic[panel] = before ? 'recorded' : existsSync(baseline) ? (assert.ok(current.equals(await readFile(baseline)), `classic ${panel} pixels stay identical`), 'identical') : 'baseline not recorded';
      } else {
        const prefix = before ? 'before' : 'after';
        if (panel === 'chat') { await capture('.chat-previous', `${prefix}-reply.png`); await capture('#chat-current', `${prefix}-chevron.png`); }
        if (panel === 'menu') await capture('.menu-switches', `${prefix}-switches.png`);
        if (panel === 'requests') await capture('.inline-question fieldset', `${prefix}-options.png`);
      }
    }
  }
  if (before) { console.log('Recorded C06 baseline: four details and three classic panels.'); }
  else {
    const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('');
    await open('menu');
    const switchColors = await page.locator('#toggle-roam i').evaluate(n => ({ track: getComputedStyle(n).backgroundColor, edge: getComputedStyle(n).borderColor, knob: getComputedStyle(n, '::after').backgroundColor, knobEdge: getComputedStyle(n, '::after').borderColor }));
    assert.equal(hex(switchColors.track), '#d6d8de');
    assert.ok(contrast(hex(switchColors.edge)) >= 3); assert.ok(contrast(hex(switchColors.edge), hex(switchColors.track)) >= 3);
    assert.ok(contrast(hex(switchColors.knobEdge), hex(switchColors.knob)) >= 3); assert.ok(contrast(hex(switchColors.knobEdge), hex(switchColors.track)) >= 3);
    const opacity = await page.locator('#toggle-roam').evaluate(n => { const enabled = getComputedStyle(n).opacity; n.disabled = true; const disabled = getComputedStyle(n).opacity; n.disabled = false; return { enabled, disabled }; });
    assert.ok(Number(opacity.disabled) < Number(opacity.enabled));
    for (const scale of [1, 1.25, 1.5]) {
      await receive({ type: 'configure', options: { textScale: scale } }); await open('chat');
      assert.equal(await page.locator('#chat-current svg.chat-chevron[aria-hidden=true] path[d="M6 9l6 6 6-6"]').count(), 1);
      for (const text of ['好啦。', '已经检查好啦，接下来可以继续核对结果。'.repeat(12)]) {
        await page.locator('#chat-reply').evaluate((n, text) => { n.textContent = text; }, text);
        const geometry = await page.locator('.chat-previous').evaluate(n => {
          const reply = n.querySelector('#chat-reply'), read = n.querySelector('#chat-read'), a = reply.getBoundingClientRect(), b = read.getBoundingClientRect();
          return { textRight: a.right, buttonLeft: b.left, textBottom: a.bottom, buttonBottom: b.bottom, replyHeight: a.height, scrolling: reply.scrollHeight > reply.clientHeight, overflow: n.scrollWidth > n.clientWidth, buttonHeight: b.height };
        });
        assert.ok(geometry.textRight <= geometry.buttonLeft); assert.ok(Math.abs(geometry.textBottom - geometry.buttonBottom) <= 1);
        assert.ok(geometry.replyHeight <= 130); assert.equal(geometry.overflow, false); assert.ok(geometry.buttonHeight >= 32);
        if (text.length > 100) { assert.equal(geometry.scrolling, true); await page.locator('#chat-reply').evaluate(n => n.scrollTop = 100); assert.ok(await page.locator('#chat-reply').evaluate(n => n.scrollTop > 0)); }
      }
      const noReservation = await page.locator('.chat-previous').evaluate(n => { const button = n.querySelector('#chat-read'), reply = n.querySelector('#chat-reply'), width = reply.getBoundingClientRect().width; button.hidden = true; const fullWidth = reply.getBoundingClientRect().width; button.hidden = false; return fullWidth > width; });
      assert.ok(noReservation);
    }
    await receive({ type: 'configure', options: { textScale: 1 } }); await open('requests');
    const radios = page.locator('.inline-question input[type=radio]');
    assert.equal(await radios.first().evaluate(n => getComputedStyle(n).display === 'none'), false);
    await radios.first().focus(); await page.keyboard.press('ArrowRight'); assert.equal(await radios.nth(1).isChecked(), true);
    assert.equal(await radios.nth(1).locator('..').evaluate(n => n.matches(':has(input:focus-visible)')), true);
    // Click the otherwise empty top/right of each card, outside its text.
    for (const index of [0, 1]) {
      const card = radios.nth(index).locator('..'), rect = await card.boundingBox();
      await card.click({ position: { x: rect.width - 5, y: 5 } }); assert.equal(await radios.nth(index).isChecked(), true);
    }
    await capture('.inline-question fieldset', 'after-options-selected.png');
    await radios.nth(1).focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await radios.first().isChecked(), true);
    await page.locator('.inline-question button[type=submit]').click();
    const sent = await page.evaluate(() => window.polishActions.filter(a => a.type === 'question-answer'));
    assert.equal(sent.length, 1); assert.deepEqual(sent[0].answers, [{ id: 'q', selected: ['继续检查'] }]);
    assert.equal(await radios.first().isDisabled(), true);
    const disabled = await radios.first().locator('..').evaluate(n => getComputedStyle(n).opacity); assert.ok(Number(disabled) < 1);
    const locked = await radios.nth(1).locator('..').boundingBox(); await page.mouse.click(locked.x + 5, locked.y + 5); assert.equal(await radios.first().isChecked(), true);
    await receive({ ...sent[0], type: 'question-answer-result', status: 'accepted' });
    assert.equal(await radios.first().isDisabled(), true);
    await writeFile(join(evidence, 'polish-results.json'), JSON.stringify({ DPR: 1.25, classic, switchColors, scales: [1, 1.25, 1.5], keyboardAndCardSelection: true, singleSubmission: true }, null, 2));
    console.log('C07 polish passed: switch contrast, SVG chevron, compact/non-overlapping scrollable replies at three scales, native radio keyboard/card selection, disabled submission, and classic screenshots when recorded.');
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
