// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { previewServer } from '../scripts/preview.mjs';
import { petCopy } from '../web/locale.js';

const directory = await mkdtemp(join(tmpdir(), 'dsh-companion-ui-'));
const server = previewServer({ dataDir: directory });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  for (const interfaceStyle of ['new', 'classic']) for (const locale of ['zh', 'en']) for (const textScale of [1, 1.25, 1.5]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(5000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.actions = [];
      // Deliberately no synchronous selection echo: sending must use the clicked target.
      window.dshPetBridge = { subscribe(fn) { window.receive = fn; }, action(a) { window.actions.push(a); }, hit() {} };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('#pet[data-character=whale][data-mode]');
    const receive = message => page.evaluate(m => window.receive(m), message);
    const work = { id: 'work', label: 'Fictional work', cwd: '/fictional/work', project: 'work', updatedAt: 10, mood: 'idle', chatAvailable: true };
    const current = { ...work, id: 'current', label: 'internal-current', cwd: '/private/companion', project: 'private', companionRole: 'current', updatedAt: 0 };
    const old = { ...current, id: 'old', label: 'internal-old', companionRole: 'earlier', agentPreset: 'whaledot-companion', companion: true, updatedAt: 1 };
    const extra = { ...work, id: 'extra', label: 'First remaining work' };
    // Harness's unused draft slot in the companion Workspace.
    const draft = { ...work, id: 'draft', label: 'companion', cwd: '/private/companion', blank: true, updatedAt: 20 };
    // An earlier companion conversation WhaleDot archived out of Harness's sidebar.
    const archived = { ...old, id: 'archived-old', archived: true, updatedAt: 30 };
    const snapshot = { mood: 'idle', active: false, streaming: false, text: '', sessionId: 'current', companionSessionId: 'current', sessions: [extra, old, work, current, draft, archived], results: [] };
    await receive({ type: 'init', baseline: true, options: { locale, interfaceStyle, textScale, roam: false, defaultChatTarget: 'companion' }, snapshot });
    const copy = petCopy(locale);
    await page.locator('#pet').dblclick();
    assert.equal(await page.locator('#chat-session-name').textContent(), copy.chatWithMe);
    assert.equal(await page.locator('#chat-help').textContent(), copy.companionChatHelp);
    assert.equal(await page.locator('#send').textContent(), copy.companionSend);
    await page.locator('#chat-current').click();
    const cards = page.locator('#conversation-list .conversation-card');
    assert.equal(await cards.first().getAttribute('data-session-id'), 'current');
    assert.equal(await page.locator('#conversation-list .companion-card').count(), 1);
    assert.equal(await page.locator('#conversation-list [data-session-id=draft]').count(), 0);
    assert.equal(await page.locator('#conversation-list [data-session-id=archived-old]').count(), 0);
    const oldCard = page.locator('[data-session-id=old]');
    assert.equal(await oldCard.locator('strong').textContent(), copy.earlierCompanion);
    assert.equal(await oldCard.locator('.session-detail').textContent(), '');
    assert.ok(!(await oldCard.getAttribute('title')).includes('/private'));
    await page.locator('[data-session-id=work]').click();
    assert.equal(await page.locator('#chat').isVisible(), true);
    assert.equal(await page.locator('#chat-session-name').textContent(), work.label);
    const geometry = await page.locator('#chat-to-companion').evaluate(button => {
      const r = button.getBoundingClientRect(), panel = document.querySelector('#chat').getBoundingClientRect(), style = getComputedStyle(button);
      const range = document.createRange(); range.selectNodeContents(button);
      return { width: r.width, height: r.height, line: parseFloat(style.lineHeight), text: range.getBoundingClientRect().width, fits: r.left >= panel.left && r.right <= panel.right };
    });
    assert.ok(geometry.height <= 1.6 * geometry.line, JSON.stringify(geometry));
    assert.ok(geometry.width > geometry.text, JSON.stringify(geometry));
    assert.ok(geometry.fits, JSON.stringify(geometry));
    assert.equal(await page.locator('#chat-help').textContent(), copy.chatHelp(work.label));
    await page.locator('#message').fill('只回复收到'); await page.locator('#send').click();
    const request = await page.evaluate(() => window.actions.filter(a => a.type === 'chat').at(-1));
    assert.equal(request.sessionId, 'work');
    await receive({ type: 'chat-result', sessionId: request.sessionId, requestId: request.requestId, status: 'accepted' });
    assert.equal(await page.locator('#message').inputValue(), '');
    await page.locator('#chat-to-companion').click();
    assert.equal(await page.locator('#chat-session-name').textContent(), copy.chatWithMe);
    await receive({ type: 'snapshot', snapshot: { ...snapshot, sessionId: 'current' } });
    // A model removal echo selects the first remaining work; 'last' must retain it.
    await page.keyboard.press('Escape');
    await receive({ type: 'configure', options: { defaultChatTarget: 'last' } });
    await receive({ type: 'snapshot', snapshot: { ...snapshot, sessionId: 'extra', sessions: [extra, old, current] } });
    await page.locator('#pet').dblclick();
    assert.equal(await page.locator('#chat-session-name').textContent(), extra.label);
    await page.keyboard.press('Escape');
    // Archived while in focus: still listed and named, but the pet explains instead of sending.
    await receive({ type: 'snapshot', snapshot: { ...snapshot, sessionId: 'extra', sessions: [{ ...extra, archived: true }, old, current] } });
    await page.locator('#pet').dblclick();
    assert.equal(await page.locator('#chat-session-name').textContent(), extra.label);
    assert.equal(await page.locator('#message').isDisabled(), true);
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(await page.locator('#chat-help').textContent(), copy.archivedChat);
    // The reason must be visible in both styles, not only present in the DOM.
    assert.equal(await page.locator('#chat-help').isVisible(), true);
    assert.equal(await page.locator('#message').getAttribute('placeholder'), copy.archivedChat);
    assert.ok((await page.locator('#chat-session-state').textContent()).includes(copy.archived));
    await page.locator('#chat-current').click();
    assert.equal(await page.locator('#conversation-list [data-session-id=extra]').count(), 1);
    await page.keyboard.press('Escape');
    await receive({ type: 'snapshot', snapshot: { ...snapshot, sessionId: 'work', companionSessionId: null, sessions: [work, extra] } });
    await page.locator('#pet').dblclick(); await page.locator('#chat-current').click();
    await page.locator('[data-session-id=extra]').click();
    assert.equal(await page.locator('#conversations').isHidden(), true);
    assert.equal(await page.locator('#chat').isHidden(), true);
    assert.deepEqual(errors, []);
    console.log(`PASS companion UI ${interfaceStyle} ${locale} ${textScale}`);
    await page.close();
  }
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
