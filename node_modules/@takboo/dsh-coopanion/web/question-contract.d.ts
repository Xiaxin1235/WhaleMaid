// SPDX-License-Identifier: AGPL-3.0-or-later
export interface InlineQuestion { id: string; question: string; header?: string; detail?: string; options: { label: string; description?: string }[]; }
export interface InlineAnswer { id: string; selected: string[]; custom?: string; }
export interface QuestionAnswerRequest { type: 'question-answer'; interactionId: string; requestId: string; generation: number; answers: InlineAnswer[]; }
export interface QuestionAnswerReceipt { type: 'question-answer-result'; interactionId: string; requestId: string; generation: number; status: 'accepted' | 'failed'; code?: string; }
export function inlineQuestionItems(value: unknown): InlineQuestion[] | undefined;
export function questionAnswer(value: unknown): QuestionAnswerRequest | undefined;
export function boundQuestionAnswer(questions: readonly InlineQuestion[], answers: readonly InlineAnswer[]): { answers: InlineAnswer[] } | undefined;
