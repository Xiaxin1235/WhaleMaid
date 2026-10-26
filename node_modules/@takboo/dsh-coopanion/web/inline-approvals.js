// SPDX-License-Identifier: AGPL-3.0-or-later
/** Explicit clicks only. Opening or keyboard submission never grants permission. */
export function createApprovalForms({ send, changed, feedback }) {
  const drafts = new Map(); let revision = 0;
  const dispose = draft => clearTimeout(draft.timer);
  return {
    get revision() { return revision; },
    opened() { for (const [id, draft] of drafts) if (!['sending', 'accepted'].includes(draft.status)) { dispose(draft); drafts.delete(id); } revision++; },
    retain(items, generation, copy) {
      for (const [id, draft] of drafts) if (draft.generation !== generation || !items.some(item => item.id === id && item.state !== 'settled')) {
        if (draft.status !== 'sending' && draft.status !== 'accepted' && draft.generation === generation) feedback(copy.approvalElsewhere);
        dispose(draft); if (draft.status !== 'sending') drafts.delete(id); revision++;
      }
    },
    receipt(value, copy) {
      const draft = drafts.get(value.interactionId);
      if (!draft || draft.requestId !== value.requestId || draft.generation !== value.generation || draft.status !== 'sending') return;
      draft.status = value.status; clearTimeout(draft.timer);
      feedback(value.status === 'accepted' ? value.answer === 'allow-once' ? copy.approvalAllowed : copy.approvalRejected : `${copy.approvalFailed} (${value.code ?? 'approval/unavailable'})`);
      revision++; changed();
    },
    render(item, generation, copy) {
      const container = document.createElement('div'); container.className = 'inline-approval';
      let draft = drafts.get(item.id);
      if (!item.approvalAnswerable) {
        if (!draft || draft.generation !== generation) { draft = { generation, readyAt: Infinity, status: '' }; drafts.set(item.id, draft); }
        const hint = document.createElement('p'); hint.textContent = copy.approvalHarness; container.append(hint); return container;
      }
      if (!draft || draft.generation !== generation || draft.readyAt === Infinity) {
        draft = { generation, readyAt: performance.now() + 1000, status: '' }; drafts.set(item.id, draft);
        draft.timer = setTimeout(() => { revision++; changed(); }, 1000);
      }
      const allow = document.createElement('button'), reject = document.createElement('button');
      allow.type = reject.type = 'button'; allow.textContent = copy.approvalAllow; reject.textContent = copy.approvalReject;
      allow.dataset.action = 'approval-allow'; reject.dataset.action = 'approval-reject';
      allow.dataset.inboxKey = reject.dataset.inboxKey = item.id;
      const blocked = draft.status === 'sending' || draft.status === 'accepted';
      const missingCommand = item.approvalCommand?.kind === 'shell' && !item.approvalCommand.command;
      allow.disabled = blocked || missingCommand || performance.now() < draft.readyAt; reject.disabled = blocked;
      allow.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
      const answer = value => {
        if (draft.status === 'sending' || draft.status === 'accepted' || value === 'allow-once' && (missingCommand || performance.now() < draft.readyAt)) return;
        draft.status = 'sending'; draft.requestId = crypto.randomUUID(); clearTimeout(draft.timer);
        send({ type: 'approval-answer', interactionId: item.id, requestId: draft.requestId, generation, answer: value });
        draft.timer = setTimeout(() => { if (draft.status === 'sending') { draft.status = 'failed'; feedback(copy.approvalFailed); revision++; changed(); } }, 7000);
        revision++; changed();
      };
      allow.onclick = () => answer('allow-once'); reject.onclick = () => answer('reject');
      const hint = document.createElement('small'); hint.textContent = copy.approvalGuard;
      container.append(reject, allow, hint); return container;
    },
  };
}
