// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PendingApproval } from '@deepseek-ai/dsh-client-ui-approval/client';
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client';
import type { ApprovalCard, CardCommand } from '../approval-cards.ts';

export interface ApprovalClientOptions {
  clientId: string;
  status(): SessionStatusSnapshot;
  subscribe(listener: () => void): () => void;
  enabled(): boolean;
  resolve(value: NonNullable<PendingApproval['displayReason']>): string;
  poll(value: unknown, signal: AbortSignal): Promise<{ enabled: boolean; commands: CardCommand[] }>;
}
/** Lives with the plugin, including when Settings and the conversation are closed. */
export class ApprovalClient {
  private firstSeen = new Map<string, number>();
  private results = new Map<string, { requestId: string; key: string; ok: boolean; code?: 'approval/missing' | 'approval/already-answered' | 'approval/invalid' | 'approval/disabled' | 'approval/call-failed' }>();
  private receipts = new Set<string>();
  constructor(private options: ApprovalClientOptions) {}
  private pending(): PendingApproval[] {
    return [...this.options.status().values()].flatMap(value => value.pendingInteraction?.kind === 'approval' ? [value.pendingInteraction as PendingApproval] : []);
  }
  cards(): ApprovalCard[] {
    if (!this.options.enabled()) { this.firstSeen.clear(); return []; }
    const items = this.pending().filter(item => item.answerable), keys = new Set(items.map(item => item.key));
    for (const key of this.firstSeen.keys()) if (!keys.has(key)) this.firstSeen.delete(key);
    return items.map(item => {
      if (!this.firstSeen.has(item.key)) this.firstSeen.set(item.key, Date.now());
      const reason = item.displayReason ? this.options.resolve(item.displayReason) : item.reason ?? '';
      return { key: item.key, sessionId: item.sessionId, ...(item.callId ? { callId: item.callId } : {}), toolName: item.toolName.slice(0, 256), reason: reason.replace(/[\t\r\n]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 600), appearedAt: this.firstSeen.get(item.key)! };
    }).slice(0, 500);
  }
  async answer(command: CardCommand): Promise<void> {
    if (command.clientId !== this.options.clientId) return;
    if (this.results.has(command.requestId)) { this.receipts.add(command.requestId); return; }
    const result: NonNullable<ReturnType<typeof this.results.get>> = { requestId: command.requestId, key: command.key, ok: false };
    this.results.set(command.requestId, result); // Reserve before awaiting the public one-shot answer.
    const item = this.pending().find(item => item.key === command.key);
    if (!this.options.enabled()) result.code = 'approval/disabled';
    else if (!['allowed-once', 'rejected'].includes(command.outcome)) result.code = 'approval/invalid';
    else if (!item) result.code = 'approval/missing';
    else if (!item.answerable) result.code = 'approval/already-answered';
    else try { await item.answer(command.outcome); result.ok = true; } catch { result.code = 'approval/call-failed'; }
    this.receipts.add(command.requestId);
    while (this.results.size > 100) this.results.delete(this.results.keys().next().value!);
  }
  start(): () => void {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>, running = false, dirty = false;
    const poll = async () => {
      if (running) { dirty = true; return; } if (controller.signal.aborted) return;
      running = true; clearTimeout(timer);
      const sent = [...this.receipts];
      try {
        const response = await this.options.poll({ clientId: this.options.clientId, cards: this.cards(), receipts: sent.flatMap(id => this.results.get(id) ?? []) }, AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]));
        for (const id of sent) this.receipts.delete(id);
        if (!controller.signal.aborted && response.enabled && this.options.enabled()) for (const command of response.commands) await this.answer(command);
      } catch { /* Offline cards expire on the Host within five seconds. */ }
      finally { running = false; if (!controller.signal.aborted) { timer = setTimeout(() => void poll(), dirty || this.receipts.size ? 0 : 750); dirty = false; } }
    };
    const unsubscribe = this.options.subscribe(() => void poll()); void poll();
    return () => { controller.abort(); clearTimeout(timer); unsubscribe(); };
  }
}
