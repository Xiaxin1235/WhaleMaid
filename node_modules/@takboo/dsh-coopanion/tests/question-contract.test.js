// SPDX-License-Identifier: AGPL-3.0-or-later
import { it, expect } from 'vitest';
import { inlineQuestionItems, questionAnswer, boundQuestionAnswer } from '../web/question-contract.js';

const questions = [{ id: 'q-full', question: 'Continue?', detail: '<b>plain text</b>', options: [{ label: 'Retry', description: 'Within existing permission.' }] }];
const request = { type: 'question-answer', interactionId: '["session","question","full-id"]', requestId: 'native-1', generation: 1, answers: [{ id: 'q-full', selected: ['Retry'] }] };
it('keeps full identities and excludes multi-select, plan review, duplicate labels and oversized content', () => {
  expect(inlineQuestionItems(questions)).toEqual(questions);
  for (const q of [
    { ...questions[0], multiSelect: true },
    { ...questions[0], intent: { kind: 'plan-review', approve: 'Retry' } },
    { ...questions[0], options: [{ label: 'Retry' }, { label: 'Retry' }] },
    { ...questions[0], question: 'x'.repeat(8193) },
  ]) expect(inlineQuestionItems([q])).toBeUndefined();
});
it('strict wire validation rejects unknown fields, malformed identities, multiple labels and oversized free text', () => {
  expect(questionAnswer(request)).toEqual(request);
  for (const value of [
    { ...request, command: 'run arbitrary text' }, { ...request, generation: -1 },
    { ...request, requestId: 'bad id' },
    { ...request, answers: [{ id: 'q-full', selected: ['Retry', 'Pause'] }] },
    { ...request, answers: [{ id: 'q-full', selected: [], custom: 'x'.repeat(2001) }] },
    { ...request, answers: [{ id: 'q-full', selected: [], custom: '  ' }] },
    { ...request, answers: [request.answers[0], request.answers[0]] },
  ]) expect(questionAnswer(value)).toBeUndefined();
});
it('binds every question exactly once, rejects forged labels even with custom text, and follows single-select custom semantics', () => {
  expect(boundQuestionAnswer(questions, request.answers)).toEqual({ answers: request.answers });
  expect(boundQuestionAnswer(questions, [{ id: 'q-full', selected: ['Unknown'], custom: 'note' }])).toBeUndefined();
  expect(boundQuestionAnswer(questions, [{ id: 'q-other', selected: ['Retry'] }])).toBeUndefined();
  expect(boundQuestionAnswer(questions, [{ id: 'q-full', selected: ['Retry'], custom: '先别改 utils.ts' }])).toEqual({ answers: [{ id: 'q-full', selected: [], custom: '先别改 utils.ts' }] });
});
