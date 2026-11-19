import type { Context } from '@deepseek-ai/cordis';
import type { GoalId } from '#whalemaid/core';
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions';
import type { WhaleStore } from '../store/index.js';
export interface InboxPort {
    prepare?(goalId: GoalId): Promise<void>;
    ask(goalId: GoalId, question: AskUserQuestionItem, signal: AbortSignal): Promise<AskUserQuestionAnswer>;
}
/** A read-only runtime root carries questions only; this adapter has no prompt/model call. */
export declare function dshInbox(ctx: Context, store: WhaleStore): InboxPort;
