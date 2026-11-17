// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { previewServer } from '../scripts/preview.mjs';

const directory = await mkdtemp(join(tmpdir(), 'dsh-c08-'));
const evidence = 'D:/dsh_plugins/WhaleDot/.dsh-dev/c08-evidence';
await mkdir(evidence, { recursive: true });

const server = previewServer({ dataDir: directory });
server.listen(0, '127.0.0.1');
await once(server, 'listening');

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1.25,
    reducedMotion: 'reduce'
  });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.addInitScript(() => {
    window.actions = [];
    window.dshPetBridge = {
      subscribe(fn) { window.receive = fn; },
      action(value) {
        window.actions.push(value);
        if (value.type === 'select') {
          const next = { ...window.__snapshot, sessionId: value.sessionId };
          window.__snapshot = next;
          window.receive({ type: 'snapshot', snapshot: next });
        }
      },
      hit() {}
    };
  });

  const receive = message => page.evaluate(message => {
    if (message.type === 'init' || message.type === 'snapshot') {
      window.__snapshot = message.snapshot ?? window.__snapshot;
    }
    window.receive(message);
  }, message);

  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForSelector('#pet[data-character=whale][data-mode]');

  // Mock sessions
  const companionSession = {
    id: 'session-companion-001',
    label: '大肥鱼',
    project: '',
    cwd: '',
    prompt: '',
    createdAt: 2000,
    updatedAt: 2000,
    mood: 'idle',
    chatAvailable: true,
    agentPreset: 'whaledot-companion',
    companion: true
  };

  const workSession1 = {
    id: 'session-work-001',
    label: 'whaledot-core',
    project: 'whaledot-core',
    cwd: '/workspace/whaledot',
    prompt: '检查模型加载状态',
    createdAt: 1000,
    updatedAt: 1500,
    mood: 'idle',
    chatAvailable: true
  };

  const workSession2 = {
    id: 'session-work-002',
    label: 'dsh-backend',
    project: 'dsh-backend',
    cwd: '/workspace/dsh',
    prompt: '排查连接超时',
    createdAt: 800,
    updatedAt: 1200,
    mood: 'idle',
    chatAvailable: true
  };

  const initialSnapshot = {
    mood: 'idle',
    text: '准备好了，随时叫我。',
    sessionId: companionSession.id,
    companionSessionId: companionSession.id,
    revision: 1,
    active: false,
    streaming: false,
    speechId: '',
    results: [],
    sessions: [workSession1, companionSession, workSession2]
  };

  await receive({
    type: 'init',
    baseline: true,
    options: {
      locale: 'zh',
      roam: false,
      interfaceStyle: 'new',
      defaultChatTarget: 'companion'
    },
    snapshot: initialSnapshot
  });

  const capture = async filename => {
    await page.waitForTimeout(100);
    const clip = await page.evaluate(() => {
      const panels = ['chat', 'conversations', 'menu', 'characters', 'reader', 'requests', 'bubble']
        .map(id => document.getElementById(id))
        .filter(n => n && !n.hidden);
      const pet = document.getElementById('pet');
      const rects = [...panels, pet].map(n => n.getBoundingClientRect());
      const x = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - 26));
      const y = Math.max(0, Math.floor(Math.min(...rects.map(r => r.top)) - 26));
      return {
        x,
        y,
        width: Math.min(innerWidth - x, Math.ceil(Math.max(...rects.map(r => r.right)) - x + 26)),
        height: Math.min(innerHeight - y, Math.ceil(Math.max(...rects.map(r => r.bottom)) - y + 26))
      };
    });
    await page.screenshot({ path: join(evidence, filename), clip });
    console.log(`Captured evidence: ${filename}`);
  };

  // 1. Double click pet -> open chat directly with companion
  console.log('Testing 1: Double click opens companion chat...');
  await page.locator('#pet').dblclick();
  await page.locator('#chat:not([hidden])').waitFor();
  assert.equal(await page.locator('#chat-session-name').textContent(), '和我聊天');
  assert.equal(await page.locator('#chat-session-detail').textContent(), '');
  assert.equal(await page.locator('#chat-to-companion').isHidden(), true);
  await capture('01-double-click-chat-with-me.png');

  // 2. Open conversation list ("换一段")
  console.log('Testing 2: Conversation list shows companion at #0...');
  await page.locator('#chat-current').click();
  await page.locator('#conversations:not([hidden])').waitFor();
  const firstCard = page.locator('#conversation-list button.conversation-card').first();
  assert.equal(await firstCard.evaluate(el => el.classList.contains('companion-card')), true);
  assert.equal(await firstCard.locator('strong').textContent(), '大肥鱼');
  assert.equal(await firstCard.locator('.session-detail').textContent(), '');
  assert.equal(await firstCard.locator('.companion-card-portrait').count(), 1);
  await capture('02-conversation-list-companion-top.png');

  // 3. Select work session (whaledot-core)
  console.log('Testing 3: Switching to work session shows Back to Companion...');
  const workCard = page.locator(`[data-session-id="${workSession1.id}"]`);
  await workCard.click();
  await page.locator('#chat:not([hidden])').waitFor();
  assert.equal(await page.locator('#chat-session-name').textContent(), 'whaledot-core');
  assert.ok((await page.locator('#chat-session-detail').textContent()).includes('/workspace/whaledot'));
  assert.equal(await page.locator('#chat-to-companion').isVisible(), true);
  assert.equal(await page.locator('#chat-to-companion').textContent(), '回到和我聊天');
  await capture('03-work-session-back-to-companion.png');

  // 4. Click "回到和我聊天"
  console.log('Testing 4: Clicking Back to Companion...');
  await page.locator('#chat-to-companion').click();
  await page.locator('#chat:not([hidden])').waitFor();
  assert.equal(await page.locator('#chat-session-name').textContent(), '和我聊天');
  assert.equal(await page.locator('#chat-session-detail').textContent(), '');
  assert.equal(await page.locator('#chat-to-companion').isHidden(), true);

  // 5. Speech bubble reply from companion
  console.log('Testing 5: Companion reply in speech bubble...');
  await page.keyboard.press('Escape');
  await page.locator('#chat').waitFor({ state: 'hidden' });
  const companionReply = {
    id: 'companion-reply-001',
    sessionId: companionSession.id,
    text: '我是大肥鱼呀！你的桌面工作伙伴，随时在这里陪你聊天~\n\n今天有什么需要我帮忙的吗？无论是聊聊天、还是关注你的编码任务，我都可以一直在这里守着你哦！如果你需要切换到其他工作会话，随时点击横幅上的“换一段”就可以啦。这里还有更多内容需要展开阅读。',
    time: Date.now(),
    read: false
  };
  await receive({
    type: 'snapshot',
    snapshot: {
      ...initialSnapshot,
      sessionId: companionSession.id,
      results: [companionReply]
    }
  });
  await page.locator('#bubble:not([hidden])').waitFor();
  assert.equal(await page.locator('#bubble-status').textContent(), '大肥鱼');
  assert.ok((await page.locator('#bubble-text').textContent()).includes('大肥鱼'));
  await capture('04-companion-reply-bubble.png');

  // 6. Reader and Inbox with companion reply
  console.log('Testing 6: Companion reply in reader and inbox...');
  // Click bubble expand to read full companion reply in reader
  await page.locator('#bubble-expand').click();
  await page.locator('#reader:not([hidden])').waitFor();
  assert.equal(await page.locator('#reader-title').textContent(), '大肥鱼');
  assert.ok(!(await page.locator('#reader-detail').textContent()).includes('/workspace'));
  await page.keyboard.press('Escape');
  await page.locator('#reader').waitFor({ state: 'hidden' });

  // Add work reply and fresh companion reply so total unread > 1
  const companionReply2 = {
    id: 'companion-reply-002',
    sessionId: companionSession.id,
    text: '需要我帮忙看代码或者聊聊天吗？随时都在。',
    time: Date.now(),
    read: false
  };
  const workReply = {
    id: 'work-reply-001',
    sessionId: workSession1.id,
    text: '模型检查完成，全部正常。',
    time: Date.now() - 5000,
    read: false
  };
  await receive({
    type: 'snapshot',
    snapshot: {
      ...initialSnapshot,
      sessionId: companionSession.id,
      results: [companionReply, companionReply2, workReply]
    }
  });

  // Open inbox panel
  await receive({ type: 'ui-control', command: 'sessions' });
  await page.locator('#requests:not([hidden])').waitFor();
  const replyCards = page.locator('#inbox-replies .inbox-card');
  assert.ok((await replyCards.count()) >= 1);
  const companionInboxCard = replyCards.first();
  assert.equal(await companionInboxCard.locator('strong').textContent(), '大肥鱼');
  assert.ok(!(await companionInboxCard.locator('small').last().textContent()).includes('/workspace'));
  await capture('05-companion-inbox.png');

  // 7. Classic style presentation
  console.log('Testing 7: Classic style interface...');
  await page.keyboard.press('Escape');
  await receive({
    type: 'configure',
    options: { interfaceStyle: 'classic' }
  });
  await page.locator('#pet').dblclick();
  await page.locator('#chat:not([hidden])').waitFor();
  assert.equal(await page.locator('#chat-session-name').textContent(), '和我聊天');
  await capture('06-classic-style-companion.png');

  // 8. Settings panel for defaultChatTarget
  console.log('Testing 8: Settings defaultChatTarget...');
  await page.keyboard.press('Escape');
  await receive({
    type: 'configure',
    options: { interfaceStyle: 'new' }
  });
  await page.locator('#pet').click({ button: 'right' });
  await page.locator('#menu:not([hidden])').waitFor();
  await page.locator('#open-characters').click();
  await page.locator('#characters:not([hidden])').waitFor();
  assert.equal(await page.locator('#default-chat-target').isVisible(), true);
  assert.equal(await page.locator('#default-chat-target').inputValue(), 'companion');
  await capture('07-default-target-setting.png');

  // Test setting change: switch to 'last'
  await page.locator('#default-chat-target').selectOption('last');
  const lastAction = await page.evaluate(() => window.actions.at(-1));
  assert.deepEqual(lastAction, { type: 'preference', field: 'defaultChatTarget', value: 'last' });
  await receive({ type: 'configure', options: { defaultChatTarget: 'last' } });

  // Now switch session to workSession1
  await page.keyboard.press('Escape');
  await receive({
    type: 'snapshot',
    snapshot: {
      ...initialSnapshot,
      sessionId: workSession1.id
    }
  });

  // Double click with 'last': should open workSession1 instead of companion!
  await page.locator('#pet').dblclick();
  await page.locator('#chat:not([hidden])').waitFor();
  assert.equal(await page.locator('#chat-session-name').textContent(), 'whaledot-core');

  // 9. Fallback when no companion session exists
  console.log('Testing 9: Fallback when no companion session...');
  await page.keyboard.press('Escape');
  const noCompanionSnapshot = {
    mood: 'idle',
    text: '准备好了，随时叫我。',
    sessionId: workSession1.id,
    companionSessionId: null,
    revision: 2,
    active: false,
    streaming: false,
    speechId: '',
    results: [],
    sessions: [workSession1, workSession2]
  };
  await receive({
    type: 'configure',
    options: { defaultChatTarget: 'companion' }
  });
  await receive({
    type: 'snapshot',
    snapshot: noCompanionSnapshot
  });

  await page.locator('#pet').dblclick();
  await page.locator('#chat:not([hidden])').waitFor();
  // With no companion session, falls back to current session
  assert.equal(await page.locator('#chat-session-name').textContent(), 'whaledot-core');
  assert.equal(await page.locator('#chat-to-companion').isHidden(), true);

  // Check conversation list has no companion cards
  await page.locator('#chat-current').click();
  await page.locator('#conversations:not([hidden])').waitFor();
  assert.equal(await page.locator('#conversation-list .companion-card').count(), 0);

  console.log('All C08 acceptance fixture tests passed!');
  assert.equal(errors.length, 0, `Page errors: ${errors.join(', ')}`);
} finally {
  await browser?.close();
  server.close();
}
