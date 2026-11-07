// SPDX-License-Identifier: AGPL-3.0-or-later
import { inlineQuestionItems, questionAnswer } from './question-contract.js';

/** Local drafts and correlated receipts; the Host owns question validity and settlement. */
export function createQuestionForms({ send, changed }) {
  const drafts = new Map();
  let revision = 0;
  const remove = id => { clearTimeout(drafts.get(id)?.timer); drafts.delete(id); };
  return {
    get revision() { return revision; },
    retain(items, generation) {
      for (const [id, draft] of drafts) {
        const item = items.find(i => i.id === id && i.kind === 'question');
        if (!item || draft.generation !== generation || draft.signature !== JSON.stringify(item.questions)) remove(id);
      }
    },
    receipt(value) {
      const draft = drafts.get(value.interactionId);
      if (!draft || value.requestId !== draft.requestId || value.generation !== draft.generation || !['accepted', 'failed'].includes(value.status)) return;
      clearTimeout(draft.timer); draft.status = value.status; draft.code = value.code;
      revision++; changed();
    },
    render(item, generation, copy, expanded = false) {
      const questions = inlineQuestionItems(item.questions);
      if (!questions) return;
      let draft = drafts.get(item.id);
      if (!draft || draft.generation !== generation || draft.signature !== JSON.stringify(item.questions)) {
        remove(item.id); draft = { generation, signature: JSON.stringify(item.questions), values: new Map(), status: '', expanded };
        drafts.set(item.id, draft);
      }
      const details = document.createElement('details'), summary = document.createElement('summary'), form = document.createElement('form');
      details.className = 'inline-question'; details.open = expanded || draft.expanded;
      details.ontoggle = () => { draft.expanded = details.open; changed(); };
      summary.textContent = copy.answerQuestion; summary.dataset.inboxKey = item.id; summary.dataset.action = 'answer-expand';
      const submit = document.createElement('button'), feedback = document.createElement('p');
      submit.type = 'submit'; submit.dataset.inboxKey = item.id; submit.dataset.action = 'answer-submit';
      const terminal = draft.status === 'failed' && ['question/stale', 'question/already-answered'].includes(draft.code);
      const busy = draft.status === 'sending' || draft.status === 'accepted';
      const ready = () => questions.every(q => { const v = draft.values.get(q.id); return v && (v.selected || v.custom?.trim()); });
      const update = () => { submit.disabled = busy || terminal || !ready(); };
      feedback.setAttribute('role', 'status');
      feedback.textContent = draft.status === 'accepted' ? copy.answerAccepted : draft.status === 'sending' ? copy.answerSending : draft.status === 'failed' ? ['question/stale', 'question/already-answered'].includes(draft.code) ? copy.answerStale : copy.answerFailed : '';
      for (const q of questions) {
        let value = draft.values.get(q.id);
        if (!value) { value = { selected: '', custom: '' }; draft.values.set(q.id, value); }
        const field = document.createElement('fieldset'), legend = document.createElement('legend');
        legend.textContent = q.header ?? q.question;
        if (!q.header && questions.length === 1 && q.question === item.preview) legend.className = 'repeat-prompt'; field.dataset.questionId = q.id;
        field.append(legend);
        if (q.header) { const prompt = document.createElement('p'); prompt.textContent = q.question; field.append(prompt); }
        if (q.detail) { const detail = document.createElement('pre'); detail.textContent = q.detail; field.append(detail); }
        const radios = [], other = document.createElement('textarea');
        for (const option of q.options) {
          const label = document.createElement('label'), radio = document.createElement('input'), content = document.createElement('span');
          radio.type = 'radio'; radio.name = `${item.id}:${q.id}`; radio.value = option.label; radio.checked = value.selected === option.label; radio.disabled = busy || terminal;
          radio.dataset.inboxKey = item.id; radio.dataset.action = `answer-option:${q.id}:${option.label}`;
          content.textContent = option.label;
          if (option.description) { const description = document.createElement('small'); description.textContent = option.description; content.append(description); }
          radio.onchange = () => { value.selected = option.label; value.custom = ''; other.value = ''; update(); };
          radios.push(radio); label.append(radio, content); field.append(label);
        }
        const otherLabel = document.createElement('label'), otherText = document.createElement('span');
        otherText.textContent = copy.answerOther; other.value = value.custom; other.maxLength = 2000; other.disabled = busy || terminal;
        other.dataset.inboxKey = item.id; other.dataset.action = `answer-custom:${q.id}`;
        other.oninput = () => { value.custom = other.value; value.selected = ''; for (const radio of radios) radio.checked = false; value.selection = [other.selectionStart, other.selectionEnd]; update(); };
        other.onselect = () => { value.selection = [other.selectionStart, other.selectionEnd]; };
        if (value.selection) other.setSelectionRange(...value.selection);
        otherLabel.append(otherText, other); field.append(otherLabel); form.append(field);
      }
      submit.textContent = busy ? draft.status === 'accepted' ? copy.answerAccepted : copy.answerSending : copy.answerSubmit;
      update(); form.append(submit, feedback); details.append(summary, form);
      form.onsubmit = event => {
        event.preventDefault();
        if (draft.status === 'sending' || draft.status === 'accepted' || terminal || !ready()) return;
        const request = questionAnswer({ type: 'question-answer', interactionId: item.id, generation,
          requestId: crypto.randomUUID(), answers: questions.map(q => {
            const value = draft.values.get(q.id);
            return { id: q.id, selected: value.selected ? [value.selected] : [], ...(value.custom.trim() ? { custom: value.custom.trim() } : {}) };
          }) });
        if (!request) return;
        draft.requestId = request.requestId; draft.status = 'sending';
        draft.timer = setTimeout(() => { if (draft.status !== 'sending') return; draft.status = 'failed'; draft.code = 'question/unconfirmed'; revision++; changed(); }, 10000);
        send(request); revision++; changed();
      };
      return details;
    },
  };
}
