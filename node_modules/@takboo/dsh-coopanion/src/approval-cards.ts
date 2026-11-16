// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { approvalAnswer, type ApprovalReceipt } from '../web/approval-contract.js';
import type { NotificationSnapshot } from './notification-contract.ts';

const identity = z.string().min(1).max(2048);
export const cardSchema = z.object({ key: identity, sessionId: identity, callId: identity.optional(), toolName: z.string().max(256), reason: z.string().max(600), appearedAt: z.number().finite().nonnegative() }).strict();
export type ApprovalCard = z.infer<typeof cardSchema>;
export const cardPollSchema = z.object({ clientId: identity, cards: z.array(cardSchema).max(500), receipts: z.array(z.object({ requestId: identity, key: identity, ok: z.boolean(), code: z.enum(['approval/missing', 'approval/already-answered', 'approval/invalid', 'approval/disabled', 'approval/call-failed']).optional() }).strict()).max(100) }).strict();
export interface CardCommand { clientId: string; key: string; requestId: string; outcome: 'allowed-once' | 'rejected'; }
interface Flight { command: CardCommand; interactionId: string; finish(code?: string): void; }

/** Routes a user gesture to an existing Client card. Never joins approval/request. */
export class ApprovalCards {
  private clients = new Map<string, { at: number; cards: ApprovalCard[] }>();
  private flights = new Map<string, Flight>();
  constructor(private enabled: () => boolean, private current: () => NotificationSnapshot, private changed: () => void, private now = Date.now) {}
  expire(): void {
    let changed = false;
    for (const [id, client] of this.clients) if (this.now() - client.at >= 5000) { this.clients.delete(id); changed = true; }
    if (changed) this.changed();
  }
  poll(value: unknown) {
    const input = cardPollSchema.parse(value);
    for (const receipt of input.receipts) {
      const flight = this.flights.get(receipt.requestId);
      if (flight && flight.command.clientId === input.clientId && flight.command.key === receipt.key) flight.finish(receipt.ok ? undefined : receipt.code ?? 'approval/call-failed');
    }
    if (this.enabled()) this.clients.set(input.clientId, { at: this.now(), cards: input.cards });
    else { this.clients.clear(); for (const flight of [...this.flights.values()]) flight.finish('approval/disabled'); }
    this.expire(); this.changed();
    return { enabled: this.enabled(), commands: this.enabled() ? [...this.flights.values()].filter(f => f.command.clientId === input.clientId && this.isOpen(f.interactionId)).map(f => f.command) : [] };
  }
  private isOpen(id: string): boolean { return this.current().interactions.some(item => item.id === id && item.kind === 'approval' && item.state !== 'settled'); }
  private candidate(sessionId: string, callId?: string): { clientId: string; card: ApprovalCard } | undefined {
    if (!this.enabled() || !callId) return;
    return [...this.clients].filter(([, client]) => this.now() - client.at < 5000).sort((a, b) => b[1].at - a[1].at).flatMap(([clientId, client]) => client.cards.filter(card => card.sessionId === sessionId && card.callId === callId).map(card => ({ clientId, card })))[0];
  }
  snapshot(value: NotificationSnapshot): NotificationSnapshot {
    return { ...value, interactions: value.interactions.map(item => {
      if (item.kind !== 'approval') return item;
      const target = this.candidate(item.sessionId, item.callId);
      return { ...item, ...(target ? { preview: target.card.reason || target.card.toolName } : {}), approvalAnswerable: !!target && ![...this.flights.values()].some(f => f.interactionId === item.id) };
    }) };
  }
  async submit(value: unknown): Promise<ApprovalReceipt | undefined> {
    const input = approvalAnswer(value); if (!input) return;
    const receipt = (code?: string): ApprovalReceipt => ({ type: 'approval-answer-result', interactionId: input.interactionId, requestId: input.requestId, generation: input.generation, answer: input.answer, status: code ? 'failed' : 'accepted', ...(code ? { code } : {}) });
    if (!this.enabled()) return receipt('approval/disabled');
    const state = this.current(), item = state.interactions.find(i => i.id === input.interactionId && i.kind === 'approval' && i.state !== 'settled');
    if (!item || state.runtime.phase !== 'running' || state.runtime.generation !== input.generation) return receipt('approval/stale');
    if (input.answer === 'allow-once' && item.approvalCommand?.kind === 'shell' && !item.approvalCommand.command) return receipt('approval/command-unavailable');
    if ([...this.flights.values()].some(f => f.interactionId === item.id)) return receipt('approval/duplicate');
    const target = this.candidate(item.sessionId, item.callId); if (!target) return receipt('approval/offline');
    return new Promise(resolve => {
      const requestId = randomUUID();
      const timer = setTimeout(() => finish('approval/timeout'), 5000);
      const finish = (code?: string) => { if (!this.flights.delete(requestId)) return; clearTimeout(timer); resolve(receipt(code)); this.changed(); };
      this.flights.set(requestId, { command: { clientId: target.clientId, key: target.card.key, requestId, outcome: input.answer === 'allow-once' ? 'allowed-once' : 'rejected' }, interactionId: item.id, finish });
      this.changed();
    });
  }
  dispose(): void { this.clients.clear(); for (const flight of [...this.flights.values()]) flight.finish('approval/unavailable'); }
}
