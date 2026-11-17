import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { stageDocument } from '../src/stage-host.ts';
import { waitForCanvasChange } from './helpers/canvas.mjs';

const output = 'artifacts/p26-stage';
const path = '/api/coopanion/stage/1';
const { html, headers } = stageDocument(await readFile(new URL('../dist/stage.js', import.meta.url), 'utf8'));
const server = createServer((req, res) => {
  if (req.url === path) res.writeHead(200, headers).end(html);
  else res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()),
    headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 480, height: 380 } });
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().startsWith('http')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(path => {
    const frame = document.createElement('iframe');
    frame.id = 'stage-frame'; frame.setAttribute('sandbox', 'allow-scripts');
    frame.style = 'display:block;width:100vw;height:100vh;border:0';
    window.stageEvents = [];
    addEventListener('message', event => {
      if (event.source === frame.contentWindow && event.origin === 'null') window.stageEvents.push(event.data);
    });
    frame.src = path;
    document.body.append(frame);
  }, path);
  await page.waitForFunction(() => window.stageEvents.some(event => event.type === 'ready'), undefined, { timeout: 20000 });
  const ready = await page.evaluate(() => window.stageEvents.find(event => event.type === 'ready'));
  assert.equal(ready.protocol, 'stage/1');
  assert.ok(['walk', 'sit-work', 'sleep', 'happy', 'shy'].every(name => ready.actions.includes(name)));
  const stage = page.frameLocator('#stage-frame');
  const actor = stage.locator('#actor');
  const canvas = stage.locator('canvas');
  assert.equal(await canvas.count(), 1);
  assert.equal(await canvas.evaluate(() => {
    try { return parent.document === document; } catch (error) { return error.name; }
  }), 'SecurityError');
  const send = data => page.evaluate(message => document.querySelector('#stage-frame').contentWindow.postMessage(message, '*'), { protocol: 'stage/1', ...data });
  const has = (type, code) => page.waitForFunction(
    ({ type, code }) => window.stageEvents.some(event => event.type === type && (!code || event.code === code)),
    { type, code },
  );
  const transform = () => actor.getAttribute('transform');
  await send({ protocol: 'stage/2', type: 'hello' });
  await has('error', 'unsupported-version');
  await send({ type: 'place', x: 'bad', y: 320, scale: 1, facing: 'right' });
  await has('error', 'invalid-command');
  await send({ type: 'place', x: 240, y: 320, scale: 1, facing: 'right', extra: 'ignored' });
  await stage.locator('#actor[transform^="translate(240 320)"]').waitFor({ state: 'attached' });
  await actor.evaluate(node => { window.actorPaints = 0; new MutationObserver(rows => { window.actorPaints += rows.length; }).observe(node, { attributes: true, attributeFilter: ['transform'] }); });
  const readPaints = () => actor.evaluate(() => window.actorPaints);
  const previous = await transform();
  // Same-origin sibling and a synthetic message carrying a different origin are both refused.
  await page.evaluate(() => { const frame = document.createElement('iframe'); frame.id = 'sibling'; frame.hidden = true; document.body.append(frame); });
  await page.frameLocator('#sibling').locator('body').evaluate(() => {
    const stage = parent.document.querySelector('#stage-frame').contentWindow;
    stage.postMessage({ protocol: 'stage/1', type: 'place', x: 9, y: 9, scale: 1, facing: 'left' }, '*');
  });
  await actor.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://other.invalid', source: parent,
    data: { protocol: 'stage/1', type: 'place', x: 9, y: 9, scale: 1, facing: 'left' },
  })));
  await wait(100);
  assert.equal(await transform(), previous);
  await page.mouse.move(236, 152);
  await has('hover');
  await page.mouse.click(236, 152);
  await has('click');
  const pointer = await page.evaluate(() => window.stageEvents.filter(event => ['hover', 'click'].includes(event.type)));
  for (const event of pointer) assert.deepEqual(Object.keys(event).sort(), ['protocol', 'type']);

  const begin = await readPaints();
  await wait(1050);
  const frames = await readPaints() - begin;
  assert.ok(frames > 5 && frames <= 34, 'stage frame budget: ' + frames);
  await send({ type: 'pause' });
  await wait(100);
  const stopped = await readPaints();
  await wait(240);
  assert.equal(await readPaints(), stopped);
  await send({ type: 'resume' });
  await actor.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await readPaints();
  await wait(240);
  assert.equal(await readPaints(), hidden);
  await actor.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(140);
  assert.ok(await readPaints() > hidden);

  for (const name of ['walk', 'sit-work', 'sleep']) {
    const pixels = await canvas.evaluate(node => node.toDataURL());
    await send({ type: 'motion', name });
    await waitForCanvasChange(canvas, pixels);
    await wait(480);
    await send({ type: 'pause' });
    await page.locator('#stage-frame').screenshot({ path: join(output, name + '.png'), omitBackground: true });
    await send({ type: 'resume' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await send({ type: 'place', x: 205, y: 328, scale: .85, facing: 'left', durationMs: 5000 });
  await send({ type: 'light', name: 'lamp' });
  await wait(150);
  assert.match(await transform(), /^translate\(205 328\) scale\(-0\.85 0\.85\)/);
  assert.match(await stage.locator('#drawing').getAttribute('style'), /sepia/);
  const staticPaints = await readPaints();
  await wait(240);
  assert.equal(await readPaints(), staticPaints);
  assert.deepEqual(requests, [origin + '/', origin + path]);
  assert.deepEqual(errors, []);
  console.log('Stage browser passed: verified sandbox, source and version, click/hover, 30 fps budget, visibility, reduced motion, and three keyframes.');
} finally {
  await browser?.close();
  server.close();
}
