// SPDX-License-Identifier: AGPL-3.0-or-later
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));

/** Preserve exact identities and labels; unsupported or oversized batches keep the Harness path. */
export function inlineQuestionItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 16) return;
  const result = [];
  for (const q of value) {
    if (!object(q) || !keys(q, ['id', 'question', 'detail', 'header', 'options', 'multiSelect', 'intent']) || !text(q.id, 2048) || !text(q.question, 8192) || q.multiSelect === true || q.intent !== undefined) return;
    if (q.multiSelect !== undefined && q.multiSelect !== false || q.detail !== undefined && !text(q.detail, 65536) || q.header !== undefined && !text(q.header, 256)) return;
    const options = q.options ?? [];
    if (!Array.isArray(options) || options.length > 32 || options.some(o => !object(o) || !keys(o, ['label', 'description']) || !text(o.label, 4096) || o.description !== undefined && !text(o.description, 8192))) return;
    if (new Set(options.map(o => o.label)).size !== options.length || result.some(item => item.id === q.id)) return;
    result.push({ id: q.id, question: q.question, ...(q.header !== undefined ? { header: q.header } : {}), ...(q.detail !== undefined ? { detail: q.detail } : {}), options: options.map(o => ({ label: o.label, ...(o.description !== undefined ? { description: o.description } : {}) })) });
  }
  return JSON.stringify(result).length <= 131072 ? result : undefined;
}

/** Shared strict Renderer/main/Host request parser; free text remains answer data. */
export function questionAnswer(value) {
  if (!object(value) || !keys(value, ['type', 'interactionId', 'requestId', 'generation', 'answers']) || value.type !== 'question-answer' || !text(value.interactionId, 2048) || !text(value.requestId, 128) || !/^[A-Za-z0-9:_-]+$/.test(value.requestId) || !Number.isSafeInteger(value.generation) || value.generation < 1) return;
  if (!Array.isArray(value.answers) || !value.answers.length || value.answers.length > 16) return;
  const answers = [];
  for (const answer of value.answers) {
    if (!object(answer) || !keys(answer, ['id', 'selected', 'custom']) || !text(answer.id, 2048) || !Array.isArray(answer.selected) || answer.selected.length > 1 || answer.selected.some(label => !text(label, 4096)) || answer.custom !== undefined && (typeof answer.custom !== 'string' || answer.custom.length > 2000)) return;
    const custom = answer.custom?.trim();
    if ((!answer.selected.length && !custom) || answers.some(item => item.id === answer.id)) return;
    answers.push({ id: answer.id, selected: [...answer.selected], ...(custom ? { custom } : {}) });
  }
  return { type: 'question-answer', interactionId: value.interactionId, requestId: value.requestId, generation: value.generation, answers };
}

/** Bind a complete batch to the exact offered question identities and labels. */
export function boundQuestionAnswer(questions, answers) {
  if (answers.length !== questions.length || questions.some(q => !answers.some(a => a.id === q.id))) return;
  if (answers.some(a => a.selected.some(label => !questions.find(q => q.id === a.id)?.options.some(o => o.label === label)))) return;
  return { answers: answers.map(a => ({ id: a.id, selected: a.custom ? [] : [...a.selected], ...(a.custom ? { custom: a.custom } : {}) })) };
}
