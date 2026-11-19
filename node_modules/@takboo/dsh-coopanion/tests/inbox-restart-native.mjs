// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { ElectronBridge } from '../dist/bridge.js';
const dir = await mkdtemp(join(tmpdir(), 'inbox-native-'));
const oldDirectory = process.env.DSH_PET_TEST_DATA_DIR, oldPort = process.env.DSH_PET_TEST_DEBUG_PORT;
const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
process.env.DSH_PET_TEST_DATA_DIR = dir; process.env.DSH_PET_TEST_DEBUG_PORT = String(port); process.env.DSH_PET_TEST_NO_SANDBOX = '1';
const key = kind => JSON.stringify([kind, 'issue', kind, 1, 9]);
let bridge, browser;
const sessions = ['error', 'blocked'].map(id => ({ id, label: id, mood: id === 'error' ? 'error' : 'waiting', text: id, active: false, attentionId: key(id), revision: 1 }));
const interactions = ['continued', 'open', 'approval'].map(id => ({ id, nativeId: id, sessionId: id, kind: id === 'approval' ? id : 'question', state: id === 'continued' ? id : 'open', turn: 1, seq: 2, createdAt: 1, dueAt: null, automaticReminders: 0, preview: id }));
sessions.push(...interactions.map(item => ({ id: item.sessionId, label: item.id, mood: 'waiting', text: item.id, active: false })));
const frame = { mood: 'error', sessionId: 'error', active: false, text: 'error', sessions, results: [] };
async function start() {
  bridge = new ElectronBridge(); bridge.update(frame);
  await bridge.start({ locale: 'en', size: 150, roam: false, notifications: true, inlineQuestions: false });
  bridge.notificationState({ protocol: 1, runtime: { phase: 'running', visible: true, generation: 1, visibilityRevision: 1, suspended: false }, interactions });
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForSelector('#pet[data-host-ready=true]');
  return page;
}
async function open(page) { await page.evaluate(() => { if (document.querySelector('#requests').hidden) document.querySelector('#attention').click(); }); }
try {
  let page = await start(); await open(page);
  assert.equal(await page.locator('.inbox-issue').count(), 2); assert.equal(await page.locator('.request-card').count(), 3);
  for (const id of ['error', 'blocked', 'continued', 'open', 'approval']) {
    await open(page); await page.locator(`button[data-inbox-key="${id}"][data-action=open]`).evaluate(button => button.click());
  }
  const file = join(dir, 'inbox-receipts-v1.json');
  await page.waitForFunction(() => document.querySelector('#attention-count').textContent === '2');
  assert.equal(await page.evaluate(() => window.dshPetBridge.inboxReceipt(JSON.stringify(['open', 'continued', 'open']))), false, 'blocking request cannot acquire a continued receipt');
  await bridge.dispose(); await browser.close(); browser = undefined;
  const archive = JSON.parse(await readFile(file, 'utf8')); assert.equal(archive.entries.length, 3);
  page = await start(); await open(page);
  assert.equal(await page.locator('.inbox-issue').count(), 0); assert.equal(await page.locator('.request-card').count(), 2);
  assert.equal(await page.locator('[data-request-id=continued]').count(), 0);
  frame.sessions[0] = { ...frame.sessions[0], attentionId: JSON.stringify(['error', 'issue', 'error', 2, 12]), revision: 2 };
  bridge.update(frame); await open(page); await page.waitForFunction(() => document.querySelectorAll('.inbox-issue').length === 1);
  await page.keyboard.press('Escape');
  bridge.notify({ id: JSON.stringify(['error', 2, 12, 'error', 'initial']), sessionId: 'error', turn: 2, seq: 12, category: 'error', stage: 'initial', requestIds: [], title: 'New error', body: 'Fictional error', time: Date.now() });
  await page.waitForSelector('#interaction:not([hidden])');
  await page.locator('#interaction-close').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('#attention-count').textContent === '2');
  await bridge.dispose(); await browser.close(); browser = undefined;
  assert.equal(JSON.parse(await readFile(file, 'utf8')).entries.length, 4, 'closing an exact current issue also persists its receipt');
  await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/inbox-restart-native.json', JSON.stringify({ persistedReceipts: archive.entries.length, afterRestart: { issues: 0, requests: 2 }, newErrorVisible: true, nativeIpc: true }, null, 2));
  console.log('Native inbox receipts passed: atomic save, real process restart, continued dismissal, pending entrances and new error.');
} finally {
  await bridge?.dispose(); await browser?.close(); await rm(dir, { recursive: true, force: true });
  if (oldDirectory === undefined) delete process.env.DSH_PET_TEST_DATA_DIR; else process.env.DSH_PET_TEST_DATA_DIR = oldDirectory;
  if (oldPort === undefined) delete process.env.DSH_PET_TEST_DEBUG_PORT; else process.env.DSH_PET_TEST_DEBUG_PORT = oldPort;
}
