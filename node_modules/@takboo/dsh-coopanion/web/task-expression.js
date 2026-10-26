// SPDX-License-Identifier: AGPL-3.0-or-later
/** Automatic attention never asks for tear-emitting faces; manual previews remain explicit. */
export const automaticExpression = word => word === 'sad' || word === 'cry' ? 'worried' : word;
export function taskExpression(mood) {
  const word = { idle: 'neutral', thinking: 'thinking', talking: 'neutral', working: 'determined', waiting: 'worried', happy: 'happy', error: 'worried', sleeping: 'sleep' }[mood];
  const expression = { thinking: 'thinking', talking: 'determined', working: 'determined', waiting: 'worried', error: 'worried' }[mood] ?? null;
  return { word, expression };
}
