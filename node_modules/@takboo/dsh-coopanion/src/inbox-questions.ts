// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions';
import { SessionId } from '@deepseek-ai/dsh-session';
import { inlineQuestionItems, questionAnswer, boundQuestionAnswer } from '../web/question-contract.js';
import type { InlineQuestion, QuestionAnswerReceipt } from '../web/question-contract.js';
import type { NotificationSnapshot, PendingInteraction } from './notification-contract.ts';

interface OpenQuestion {
  agent: Agent; questions: InlineQuestion[]; signal?: AbortSignal;
  answer(value: AskUserQuestionAnswer): boolean;
  cancel(): void;
}
const aborted = () => Object.assign(new Error('Question cancelled'), { code: 'ASK_ABORTED' });

/** A second answer surface for the original public waterfall; never prompts or approves. */
export class InboxQuestions {
  private readonly open = new Map<string, OpenQuestion>();
  constructor(private readonly ctx: Context, private readonly enabled: () => boolean,
    private readonly current: () => NotificationSnapshot, private readonly changed: () => void) {}

  /** UserQuestionService.ask passes a fresh agent-scoped event envelope, not its caller's object. */
  track(id: string, request: AskUserQuestionRequest, next: () => Promise<AskUserQuestionAnswer>): Promise<AskUserQuestionAnswer> {
    const questions = inlineQuestionItems(request.questions), agent = request.agent;
    if (!this.enabled() || !questions || !agent || this.open.size >= 500) return next();
    const source = request.signal, downstream = new AbortController();
    // Give the remaining answerer chain its own lifetime, retaining the caller's original signal.
    request.signal = source ? AbortSignal.any([source, downstream.signal]) : downstream.signal;
    return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      let settled = false;
      const finish = (answer?: AskUserQuestionAnswer, error?: unknown) => {
        if (settled) return false;
        settled = true; this.open.delete(id); source?.removeEventListener('abort', cancel);
        if (error !== undefined) reject(error); else resolve(answer!);
        downstream.abort(); this.changed(); return true;
      };
      const cancel = () => { finish(undefined, aborted()); };
      this.open.set(id, { agent, questions, signal: source, answer: value => finish(value), cancel });
      source?.addEventListener('abort', cancel, { once: true });
      if (source?.aborted) { cancel(); return; }
      this.changed();
      Promise.resolve().then(next).then(answer => { finish(answer); }, error => {
        // An available native form remains an answerer when no browser is attached.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'NO_PROVIDER' && !settled && this.enabled()) return;
        finish(undefined, error);
      });
    });
  }

  private root(sessionId: string): Agent | undefined {
    const agent = this.ctx.agents.get(SessionId(sessionId));
    return agent && this.ctx.agents.roots().includes(agent) ? agent : undefined;
  }
  private continued(item: PendingInteraction) {
    const agent = this.root(item.sessionId);
    if (!agent || item.state !== 'continued') return;
    const projections = this.ctx.get('sessionProjections');
    const question = projections?.snapshot(agent.session, ['userQuestions']).values.userQuestions?.active.find(q => q.callId === item.nativeId && q.state === 'continued');
    const questions = inlineQuestionItems(question?.questions);
    return questions ? { agent, questions } : undefined;
  }

  /** Only currently answerable, supported questions expose a form; approvals remain untouched. */
  snapshot(value: NotificationSnapshot): NotificationSnapshot {
    if (!this.enabled()) return value;
    return { ...value, interactions: value.interactions.map(item => {
      if (item.kind !== 'question') return item;
      const live = this.open.get(item.id);
      const questions = live && !live.signal?.aborted && this.root(item.sessionId) === live.agent ? live.questions : this.continued(item)?.questions;
      return questions ? { ...item, questions: structuredClone(questions) } : item;
    }) };
  }

  /** Validate fresh Host truth and one complete structured batch before the first settlement. */
  submit(value: unknown): QuestionAnswerReceipt | undefined {
    const input = questionAnswer(value);
    if (!input) return;
    const receipt = (code?: string): QuestionAnswerReceipt => ({ type: 'question-answer-result', interactionId: input.interactionId, requestId: input.requestId, generation: input.generation, status: code ? 'failed' : 'accepted', ...(code ? { code } : {}) });
    if (!this.enabled()) return receipt('question/disabled');
    const current = this.current(), item = current.interactions.find(i => i.id === input.interactionId && i.kind === 'question' && i.state !== 'settled');
    if (!item || current.runtime.phase !== 'running' || current.runtime.generation !== input.generation) return receipt('question/stale');
    const live = this.open.get(item.id);
    if (live) {
      if (live.signal?.aborted || this.root(item.sessionId) !== live.agent) return receipt('question/stale');
      const answer = boundQuestionAnswer(live.questions, input.answers);
      if (!answer) return receipt('question/invalid-answer');
      return receipt(live.answer(answer) ? undefined : 'question/stale');
    }
    const continued = this.continued(item);
    if (!continued) return receipt('question/stale');
    const answer = boundQuestionAnswer(continued.questions, input.answers);
    if (!answer) return receipt('question/invalid-answer');
    try {
      return receipt(this.ctx.userQuestions.answer(continued.agent, item.nativeId as never, answer) ? undefined : 'question/stale');
    } catch (error) {
      return receipt(error && typeof error === 'object' && 'code' in error && error.code === 'REPLY_QUEUED' ? 'question/already-answered' : 'question/unavailable');
    }
  }

  dispose(): void { for (const entry of [...this.open.values()]) entry.cancel(); }
}
