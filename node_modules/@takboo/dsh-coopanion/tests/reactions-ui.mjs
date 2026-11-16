// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { observeBodyReady } from './helpers/body-startup.mjs';
import { previewServer } from '../scripts/preview.mjs';
import { petCopy } from '../web/locale.js';

const directory = await mkdtemp(join(tmpdir(), 'dsh-reactions-ui-'));
const server = previewServer({ dataDir: directory });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  for (const interfaceStyle of ['new', 'classic']) for (const locale of ['zh', 'en']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(7000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Observe calls to the real character body, without changing its rendering or clock.
    await page.route('**/upstream/body-host.js', async route => {
      const response = await route.fetch();
      const source = (await response.text()).replace('export function loadBody(', 'function originalLoadBody(');
      await route.fulfill({ response, body: source + `
        export async function loadBody(...args) {
          const body = await originalLoadBody(...args);
          window.bodyCalls = []; window.bodyControls = []; window.unsupportedReaction = false;
          return new Proxy(body, { get(target, key) {
            if (key === 'words' && window.unsupportedReaction) return target.words.filter(w => w !== 'love');
            if (key === 'do') return word => { window.bodyCalls.push(word); return target.do(word); };
            if (key === 'set') return controls => { window.bodyControls.push(controls); return target.set(controls); };
            return Reflect.get(target, key);
          }});
        }` });
    });
    await page.addInitScript(() => {
      window.actions = [];
      window.dshPetBridge = { subscribe(fn) { window.receive = fn; }, action(a) { window.actions.push(a); }, hit() {} };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await observeBodyReady(page, 'reactions-ui')('#pet[data-character=whale][data-mode]');
    const receive = message => page.evaluate(m => window.receive(m), message);
    const session = { id: 'chat', label: 'Fictional companion', mood: 'idle', active: false, replyId: 'reply', unread: 1, revision: 1 };
    const snapshot = { mood: 'idle', active: false, streaming: false, text: '', sessionId: 'chat', revision: 1, sessions: [session], results: [{ id: 'reply', sessionId: 'chat', text: 'Fictional reply', read: false, time: 1 }] };
    await receive({ type: 'init', baseline: true, options: { locale, interfaceStyle, roam: false, quietMode: true, decisionsReactions: true, reactionStatus: { keyAvailable: true, calls: 4 } }, snapshot });
    const reaction = (expression = 'love', extra = {}) => receive({ type: 'reaction', resultId: 'reply', sessionId: 'chat', expression, at: Date.now(), ...extra });
    const held = () => page.locator('#pet').getAttribute('data-reply-reaction');
    const noPanels = async () => assert.deepEqual(await page.evaluate(() => ['bubble', 'interaction', 'chat', 'requests'].filter(id => !document.getElementById(id).hidden)), []);
    await reaction();
    assert.equal(await held(), 'love');
    assert.equal(await page.evaluate(() => window.bodyCalls.at(-1)), 'love');
    assert.equal(await page.evaluate(() => window.bodyControls.at(-1).expression), 'love');
    await noPanels();
    await page.waitForTimeout(1500);
    assert.equal(await held(), 'love', 'mood mapping must not erase the expression early');
    assert.equal(await page.evaluate(() => window.bodyControls.at(-1).expression), 'love');
    await page.waitForFunction(() => document.querySelector('#pet').dataset.replyReaction === '');
    assert.notEqual(await page.evaluate(() => window.bodyControls.at(-1).expression), 'love');
    // Priority changes cancel an existing reaction immediately and cannot be masked by it.
    for (const mood of ['working', 'waiting', 'error']) {
      await reaction(); assert.equal(await held(), 'love');
      await receive({ type: 'snapshot', snapshot: { ...snapshot, mood, active: mood === 'working', sessions: [{ ...session, mood, active: mood === 'working' }] } });
      assert.equal(await held(), ''); assert.equal(await page.locator('#pet').getAttribute('data-mood'), mood);
      await reaction(); assert.equal(await held(), '');
      if (mood === 'error') assert.equal(await page.evaluate(() => window.bodyControls.at(-1).expression), 'worried', 'ordinary task errors retain C05');
      await receive({ type: 'snapshot', snapshot });
    }
    for (const extra of [{ at: Date.now() - 16000 }, { resultId: 'old' }, { expression: 'unknown' }]) { await reaction('love', extra); assert.equal(await held(), ''); }
    await page.evaluate(() => { window.unsupportedReaction = true; }); await reaction(); assert.equal(await held(), '');
    await page.evaluate(() => { window.unsupportedReaction = false; });
    async function changeMotion(reducedMotion) {
      await page.evaluate(() => {
        window.motionChanged = false;
        matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { window.motionChanged = true; }, { once: true });
      });
      await page.emulateMedia({ reducedMotion });
      await page.waitForFunction(() => window.motionChanged);
    }
    await changeMotion('reduce'); await reaction(); assert.equal(await held(), '');
    await changeMotion('no-preference');
    await reaction('sad'); assert.equal(await held(), 'sad'); // Explicit opt-in differs from automatic error mapping.
    await receive({ type: 'configure', options: { decisionsReactions: false } }); assert.equal(await held(), '');
    await reaction(); assert.equal(await held(), '');
    await page.locator('#pet').click({ button: 'right' });
    const toggle = page.locator('#toggle-reactions');
    assert.equal(await toggle.isVisible(), true); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    assert.ok((await toggle.textContent()).includes(petCopy(locale).decisionsReactions));
    assert.ok((await page.locator('#reaction-status').textContent()).includes('4'));
    assert.ok((await page.locator('#reaction-status').textContent()).includes(petCopy(locale).reactionKeyPresent));
    const fits = await toggle.evaluate(el => el.scrollWidth <= el.clientWidth + 1); assert.ok(fits, `privacy label fits ${interfaceStyle}/${locale}`);
    await toggle.click();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), { type: 'preference', field: 'decisionsReactions', value: true });
    assert.deepEqual(errors, []);
    console.log(`PASS Decisions reaction UI ${interfaceStyle} ${locale}: actual body calls, hold/recovery, priorities, quiet, vocabulary, age, reduced motion, settings`);
    await page.close();
  }
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
