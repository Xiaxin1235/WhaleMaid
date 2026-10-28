import type { Context } from '@deepseek-ai/cordis';
export interface DraftModel {
    generate(prompt: string, signal: AbortSignal): Promise<string>;
}
/** One direct LLM request on the live default selection, with no tool definitions or retry loop. */
export declare function dshDraftModel(ctx: Context): DraftModel;
