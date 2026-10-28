import { z } from 'zod';
export const CodexArgumentsSchema = z.strictObject({
    task: z.string().trim().min(1).max(8000),
    mode: z.enum(['read-only', 'workspace-write']).default('read-only'),
});
export const CodexSettingsSchema = z.strictObject({
    enabled: z.boolean().default(false),
    timeoutMinutes: z.number().int().min(1).max(60).default(15),
});
export const CodexRecordSchema = z.strictObject({
    id: z.string(),
    at: z.number(),
    sessionId: z.string(),
    mode: z.enum(['read-only', 'workspace-write']),
    cwd: z.string(),
    task: z.string().max(300),
    status: z.string(),
    exitCode: z.number().nullable(),
    elapsedMs: z.number(),
    files: z.array(z.string()),
    logPath: z.string(),
    pid: z.number().optional(),
});
export const CodexPanelSchema = z.strictObject({
    settings: CodexSettingsSchema,
    records: z.array(CodexRecordSchema).max(100),
});
export const codexCopy = (locale) => locale === 'zh-CN'
    ? {
        title: '对话调用 Codex',
        enabled: '允许对话调用 Codex',
        timeout: '超时（分钟，1–60）',
        description: '默认关闭。每次都需要允许一次；工作目录固定为当前普通会话的项目。消耗你的 Codex 额度。',
        history: '最近的 Codex 调用',
        empty: '暂无调用记录。',
        save: '保存',
        failed: 'Codex 设置或记录暂不可用。',
    }
    : {
        title: 'Codex in conversations',
        enabled: 'Allow conversations to call Codex',
        timeout: 'Timeout (minutes, 1–60)',
        description: 'Off by default. Every call needs one-time approval, uses the current ordinary session directory, and consumes your Codex allowance.',
        history: 'Recent Codex calls',
        empty: 'No Codex calls yet.',
        save: 'Save',
        failed: 'Codex settings or history unavailable.',
    };
//# sourceMappingURL=contract.js.map