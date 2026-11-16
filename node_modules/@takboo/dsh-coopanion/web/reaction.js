// SPDX-License-Identifier: AGPL-3.0-or-later
export const REACTION_EXPRESSIONS = Object.freeze(['happy', 'excited', 'love', 'shy', 'smug', 'surprised', 'thinking', 'confused', 'worried', 'sad', 'flustered', 'determined', 'neutral']);

/** Validate ephemeral Host reactions against the latest local result and actual character vocabulary. */
export function reactionFor(message, snapshot, { now, words, blocked }) {
  if (blocked || message?.type !== 'reaction' || !Number.isFinite(message.at) || Math.abs(now - message.at) > 15000 || !REACTION_EXPRESSIONS.includes(message.expression) || message.expression === 'neutral' || !words.includes(message.expression)) return;
  const session = snapshot.sessions?.find(s => s.id === message.sessionId);
  if (!session || session.archived || session.replyId !== message.resultId || !snapshot.results?.some(r => r.id === message.resultId && r.sessionId === message.sessionId)) return;
  return message.expression;
}
