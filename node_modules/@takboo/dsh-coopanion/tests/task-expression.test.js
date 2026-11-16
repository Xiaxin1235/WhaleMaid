// SPDX-License-Identifier: AGPL-3.0-or-later
import { it, expect } from 'vitest';
import { automaticExpression, taskExpression } from '../web/task-expression.js';
import { sessionActivity } from '../web/session-ui.js';
import { notificationPresentation } from '../web/notification-ui.js';
import { initialCompanionship, stepCompanionship } from '../web/companionship.js';
import { initialNpc, npcSpace, stepNpc } from '../web/npc-life.js';
const moods = ['idle', 'thinking', 'talking', 'working', 'waiting', 'happy', 'error', 'sleeping'];
const safe = word => expect(['sad', 'cry']).not.toContain(word);

it('all task moods and foreground/background waiting/error combinations use tear-free faces', () => {
  expect(taskExpression('error')).toEqual({ word: 'worried', expression: 'worried' });
  for (const selected of moods) for (const background of moods) {
    const { mood } = sessionActivity({ mood: selected, active: false, sessionId: 'selected', sessions: [{ id: 'selected', mood: selected }, { id: 'background', mood: background }] });
    for (const value of [taskExpression(selected), taskExpression(mood)]) { safe(value.word); safe(value.expression); }
  }
  for (const word of ['sad', 'cry']) expect(automaticExpression(word)).toBe('worried');
});

it('every notification category and reminder avoids tears, including characters offering only tear faces', () => {
  for (const category of ['reply', 'goal-progress', 'completed', 'approval', 'question', 'error', 'stopped', 'interrupted', 'blocked', 'max-tokens']) {
    for (const stage of ['initial', 'reminder']) for (const words of [['sad', 'cry'], ['sad', 'cry', 'worried', 'confused', 'neutral', 'happy', 'wave', 'nod', 'thinking']]) {
      const result = notificationPresentation({ category, stage, requestIds: [], title: '', body: '' }, 'zh', words);
      safe(result.word); safe(taskExpression(result.mood).expression);
      if (category === 'error' && stage === 'initial' && words.includes('worried')) expect(result.word).toBe('worried');
    }
  }
});

it('companionship recipes and NPC automatic words/emotions remain tear-free across interruptions and arrivals', () => {
  const words = ['neutral', 'stand', 'look', 'nod', 'sit', 'sleepy', 'happy', 'dance', 'wave', 'love', 'sad', 'cry'];
  for (const mode of ['off', 'quiet', 'interactive']) for (const hour of [0, 12, 23]) {
    let state = initialCompanionship();
    for (let step = 0; step < 30; step++) {
      const result = stepCompanionship(state, { mode, hour, now: step * 1000, words, automatic: true, eligible: true, unlocked: true, action: step === 1 ? 'play' : undefined, occupied: step === 15 }, () => .1);
      state = result.state; safe(result.word); safe(automaticExpression(result.word));
    }
  }
  let greeting = { ...initialCompanionship(), mode: 'interactive', period: 'day', blocked: false, lastAt: 0, inviteAt: 0 };
  for (const [now, action] of [[1, undefined], [2, 'reserved'], [2003, undefined], [3204, undefined], [3500, undefined]]) {
    const result = stepCompanionship(greeting, { mode: 'interactive', hour: 12, now, words, automatic: true, eligible: true, unlocked: true, action });
    greeting = result.state; safe(result.word);
  }
  const layout = { x: 800, box: { x: 720, y: 560, w: 160, h: 160 } }, space = npcSpace({ width: 1000, layout });
  let npc = initialNpc(1);
  for (let step = 0; step < 120; step++) {
    const arriving = npc.walkId && step % 5 === 0;
    const result = stepNpc(npc, { enabled: true, now: step * 1000, space, words, keyboard: step % 17 === 0 ? 'active' : 'idle', layout: { ...layout, x: arriving ? npc.target : layout.x }, canWalk: true, event: arriving ? { kind: 'arrived', walkId: npc.walkId } : undefined });
    npc = result.state; safe(result.word); safe(npc.emotion); safe(automaticExpression(npc.emotion));
  }
});
