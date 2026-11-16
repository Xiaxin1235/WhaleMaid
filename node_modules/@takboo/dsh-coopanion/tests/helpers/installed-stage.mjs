import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

const stagePath = '/api/coopanion/stage/1';

async function petRpc(page, name, payload = {}) {
  return page.evaluate(async ({ name, payload }) => {
    const method = 'coopanion/' + name;
    const response = await fetch('/api/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'installed-stage', method, payload }),
      signal: AbortSignal.timeout(6000),
    });
    const { result } = await response.json();
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, { name, payload });
}

async function assertVisibility(page, visible, desiredVisible) {
  let status;
  for (let n = 0; n < 80; n++) {
    status = await petRpc(page, 'status');
    if (status.phase === 'running' && status.visible === visible && status.desiredVisible === desiredVisible) return;
    await wait(100);
  }
  assert.deepEqual([status.phase, status.visible, status.desiredVisible], ['running', visible, desiredVisible]);
}

const away = page => page.evaluate(async url => {
  window.stageAwayController = new AbortController();
  const timeout = setTimeout(() => window.stageAwayController.abort(), 6000);
  try {
    const reply = await fetch(url, { method: 'POST', signal: window.stageAwayController.signal });
    if (!reply.ok) throw new Error('stage lease HTTP ' + reply.status);
    if (reply.headers.get('content-type') !== 'text/event-stream' || reply.headers.has('content-encoding'))
      throw new Error('stage lease is not an uncompressed event stream');
    const reader = reply.body.pipeThrough(new TextDecoderStream()).getReader();
    window.stageAwayReader = reader;
    let first = '';
    while (!first.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stage lease ended before acknowledgement');
      first += value;
    }
    return first.split('\n\n')[0];
  } finally { clearTimeout(timeout); }
}, stagePath + '/away');
const back = page => page.evaluate(() => window.stageAwayController?.abort());

export async function verifyInstalledStage({ page, pet, hostUrl }) {
  const url = new URL(stagePath, hostUrl);
  assert.equal((await fetch(url)).status, 401, 'anonymous stage document refused by the real Connection');
  assert.equal((await fetch(url.href + '/away', { method: 'POST' })).status, 401, 'anonymous away refused');
  const reply = await page.request.get(url.href);
  assert.equal(reply.status(), 200);
  assert.match(reply.headers()['content-security-policy'], /frame-ancestors 'self'/);
  assert.equal(reply.headers()['access-control-allow-origin'], undefined);

  await page.evaluate(path => {
    const frame = document.createElement('iframe');
    frame.id = 'installed-stage';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style = 'position:fixed;right:0;bottom:0;width:400px;height:360px;border:0;pointer-events:none';
    const onMessage = event => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      if (event.data?.type === 'ready') {
        frame.dataset.protocol = event.data.protocol;
        frame.contentWindow.postMessage({ protocol: 'stage/1', type: 'motion', name: 'sit-work' }, '*');
        removeEventListener('message', onMessage);
      }
    };
    addEventListener('message', onMessage);
    frame.src = path;
    document.body.append(frame);
  }, stagePath);
  await page.locator('#installed-stage[data-protocol="stage/1"]').waitFor({ timeout: 20000 });
  assert.equal(await page.frameLocator('#installed-stage').locator('canvas').count(), 1);
  await page.locator('#installed-stage').evaluate(frame => frame.remove());

  await pet.evaluate(() => {
    window.p26Departure = 0;
    window.p26Hop = false;
    window.dshPetBridge.subscribe(message => { if (message.type === 'stage-departure') window.p26Departure++; });
    const body = document.querySelector('#pet');
    new MutationObserver(() => {
      if (window.p26Departure && ['crouch', 'air'].includes(body.dataset.mode)) window.p26Hop = true;
    }).observe(body, { attributes: true, attributeFilter: ['data-mode'] });
  });
  const second = await page.context().newPage();
  try {
    await assertVisibility(page, true, true);
    await second.goto(new URL('/', hostUrl).href);
    console.log('Stage: both Harness pages loaded');
    assert.equal(await away(page), 'data: stage/1');
    console.log('Stage: first lease opened');
    assert.equal(await away(second), 'data: stage/1');
    console.log('Stage: second lease opened');
    await assertVisibility(page, false, true);
    assert.deepEqual(await pet.evaluate(() => [window.p26Departure, window.p26Hop]), [1, true]);
    await back(page);
    await assertVisibility(page, false, true);
    await second.close();
    await assertVisibility(page, true, true);
    console.log('Stage: the last disconnect restored the pet');

    await petRpc(page, 'control', { command: 'hide' });
    await assertVisibility(page, false, false);
    console.log('Stage: user hide acknowledged');
    await away(page);
    await back(page);
    await assertVisibility(page, false, false);
    assert.equal(await pet.evaluate(() => window.p26Departure), 1);
    await petRpc(page, 'control', { command: 'show' });
    await assertVisibility(page, true, true);
    return { anonymousDenied: true, browserStage: true, hopBeforeHide: true, lastDisconnectRestores: true, manualHidePreserved: true };
  } finally {
    await back(page).catch(() => {});
    if (!second.isClosed()) await second.close();
  }
}
