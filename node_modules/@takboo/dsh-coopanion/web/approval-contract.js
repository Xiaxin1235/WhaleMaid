// SPDX-License-Identifier: AGPL-3.0-or-later
/** Shared renderer/main/Host validation; no policy or command payload crosses this wire. */
export function approvalAnswer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['type', 'interactionId', 'requestId', 'generation', 'answer'].includes(key))) return;
  if (value.type !== 'approval-answer' || !['allow-once', 'reject'].includes(value.answer) || !Number.isSafeInteger(value.generation) || value.generation < 0) return;
  if (typeof value.interactionId !== 'string' || !value.interactionId.length || value.interactionId.length > 2048 || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(value.requestId)) return;
  return { type: value.type, interactionId: value.interactionId, requestId: value.requestId, generation: value.generation, answer: value.answer };
}
