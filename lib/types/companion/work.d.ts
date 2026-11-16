import type { Context } from '@deepseek-ai/cordis';
/** Title of a conversation she started. No `[WhaleMaid]` prefix: it is ordinary work, not an autopilot task. */
export declare function workTitle(task: string, locale: 'zh-CN' | 'en'): string;
/**
 * Open an ordinary conversation in the project and send it the task. It gets the user's default
 * permission preset and approvals like any conversation the user opens; nothing is granted here.
 */
export declare function startWork(ctx: Context, input: {
    projectRoot: string;
    task: string;
}, locale: 'zh-CN' | 'en'): Promise<{
    sessionId: string;
}>;
