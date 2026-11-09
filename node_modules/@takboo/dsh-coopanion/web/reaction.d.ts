// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PetSnapshot } from '../src/model.ts';
export const REACTION_EXPRESSIONS: readonly string[];
export function reactionFor(message: unknown, snapshot: Pick<PetSnapshot, 'sessions' | 'results'>, options: {now: number; words: readonly string[]; blocked: boolean}): string | undefined;
