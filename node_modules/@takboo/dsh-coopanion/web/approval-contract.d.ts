// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ApprovalAnswer { type: 'approval-answer'; interactionId: string; requestId: string; generation: number; answer: 'allow-once' | 'reject'; }
export interface ApprovalReceipt { type: 'approval-answer-result'; interactionId: string; requestId: string; generation: number; status: 'accepted' | 'failed'; answer: ApprovalAnswer['answer']; code?: string; }
export function approvalAnswer(value: unknown): ApprovalAnswer | undefined;
