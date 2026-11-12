// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { inboxContents, unreadReplies } from '../web/session-ui.js';
import { createNoticeQueue, notificationCopy, notificationPresentation, pendingInteractions } from '../web/notification-ui.js';
import { petCopy } from '../web/locale.js';

// Exercise the actual renderer functions with inert DOM/IPC boundaries when a
// graphics session is unavailable. Browser layout and clicks remain UI checks.
const source = ts.createSourceFile('pet.js', readFileSync(new URL('../web/pet.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['receive', 'applyOptions', 'showNextReply', 'presentNextNotice', 'currentInbox', 'refreshInbox', 'keepQuietCard', 'companionMessage'];
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(source)).join('\n');
function fixture() {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', dataset: {}, value: '', classList: { add: vi.fn(), remove: vi.fn() }, setAttribute: vi.fn() });
    return nodes.get(id);
  };
  const context = {
    approvalForms: { retain: vi.fn(), receipt: vi.fn() }, petCopy,
    $, options: { quietMode: false, notifications: true, companionship: 'off', textScale: 1, size: 180 },
    snapshot: { sessionId: 'work', sessions: [{ id: 'work', label: 'Work', mood: 'idle' }], results: [] },
    pendingSelectionId: undefined,
    shownResults: new Set(), acknowledgedResults: new Set(), quietInbox: new Map(),
    bubble: $('bubble'), interaction: $('interaction'), companionInvitation: $('companion-invitation'), companionFeedback: $('companion-feedback'),
    panels: [$('chat'), $('reader'), $('requests'), $('menu')], pressing: false, dragging: false, reduced: true,
    notificationState: { protocol: 1, runtime: { phase: 'running', visible: true, generation: 1 }, interactions: [] },
    inboxState: { requests: [], issues: [], replies: [], total: 0 }, inboxContents, unreadReplies,
    speech: undefined, currentNotice: undefined, toastTimer: undefined, toastNotice: undefined,
    noticeQueue: createNoticeQueue(), notificationPresentation, pendingInteractions, panelAnchors: new WeakMap(),
    questionForms: { retain: vi.fn() }, snoozing: new Map(),
    attentionToWork: vi.fn(), completionHasReply: () => false,
    inboxReceipts: { hides: () => false },
    body: undefined, activeView: undefined, diagnosticCounters: { configure: vi.fn() },
    panelStyle: { set: vi.fn(), portraits: vi.fn() }, document: { documentElement: { style: { setProperty: vi.fn() } } },
    companionshipMode: value => value, textScale: value => value, performance: { now: () => 100 },
    position: vi.fn(), updateMood: vi.fn(), renderRequests: vi.fn(), clearTimeout,
    notificationLocale: () => 'en', uiCopy: () => petCopy('en'), noticeCopy: () => notificationCopy('en'),
  };
  context.allRequests = () => context.notificationState.interactions;
  context.pendingRequests = context.allRequests;
  context.userOccupied = () => !context.bubble.hidden || context.panels.some(node => !node.hidden);
  context.speak = vi.fn(() => { context.bubble.hidden = false; });
  const api = runInNewContext(functions + '\n({' + names.join(',') + '})', context);
  context.render = vi.fn(() => { context.attentionSnapshot = context.snapshot; api.refreshInbox(); api.showNextReply(); api.presentNextNotice(); });
  context.render();
  return { ...api, context, $ };
}
const reply = id => ({ id, sessionId: 'work', text: 'Complete reply', time: 1, read: false });
const notice = { id: 'question-notice', sessionId: 'work', turn: 1, seq: 2, time: 1, category: 'question', stage: 'initial', title: 'Question', body: 'Choose?', requestIds: ['question'] };

it('quiet reply plus question produces count two, no popup or acknowledgement, and no replay on disable', () => {
  const f = fixture(), c = f.context;
  f.receive({ type: 'configure', options: { quietMode: true } });
  f.receive({ type: 'snapshot', snapshot: { ...c.snapshot, results: [reply('quiet')] } });
  f.receive({ type: 'notification-state', snapshot: { ...c.notificationState, interactions: [{ id: 'question', sessionId: 'work', kind: 'question', state: 'open', preview: 'Choose?' }] } });
  f.receive({ type: 'notice', notice });
  f.receive({ type: 'notice', notice: { ...notice, id: 'due-reminder', stage: 'reminder' } });
  expect(f.$('attention-count').textContent).toBe('2');
  expect(c.speak).not.toHaveBeenCalled();
  expect(c.interaction.hidden).toBe(true);
  expect(c.acknowledgedResults.size).toBe(0);
  expect(c.notificationState.interactions[0].state).toBe('open');
  expect(f.$('attention').classList.add).not.toHaveBeenCalled();
  f.receive({ type: 'configure', options: { quietMode: false } });
  expect(c.speak).not.toHaveBeenCalled();
  expect(c.interaction.hidden).toBe(true);
  f.receive({ type: 'snapshot', snapshot: { ...c.snapshot, results: [reply('quiet'), reply('fresh')] } });
  expect(c.speak).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'fresh' }));
});
it('quiet leaves manually opened panels and input intact, retaining local feedback and invitation in the envelope', () => {
  const f = fixture(), c = f.context;
  f.$('chat').hidden = false; f.$('message').value = 'Keep this draft'; f.$('reader').hidden = false;
  c.options.companionship = 'interactive';
  c.companionInvitation.hidden = false;
  c.bubble.hidden = false;
  f.receive({ type: 'configure', options: { quietMode: true } });
  expect(c.companionInvitation.hidden).toBe(true); expect(c.bubble.hidden).toBe(true);
  expect(f.$('chat').hidden).toBe(false); expect(f.$('reader').hidden).toBe(false);
  expect(f.$('message').value).toBe('Keep this draft');
  f.companionMessage('companionPetThanks'); f.companionMessage('companionPlayed');
  expect(c.companionFeedback.hidden).toBe(true);
  expect(c.quietInbox.size).toBe(2);
  expect(c.quietInbox.get('feedback')).toBe('companionPlayed');
  f.receive({ type: 'configure', options: { quietMode: false } });
  expect(c.companionFeedback.hidden).toBe(true); expect(c.companionInvitation.hidden).toBe(true);
  expect(f.currentInbox().total).toBe(2);
});
it('non-quiet notices retain the existing automatic card path', () => {
  const f = fixture();
  f.receive({ type: 'notice', notice: { ...notice, requestIds: [] } });
  expect(f.context.interaction.hidden).toBe(false);
  expect(f.$('interaction-title').textContent).toBe('There is a question for you.');
});
