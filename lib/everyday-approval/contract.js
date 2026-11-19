import { z } from 'zod';
export const EverydayApprovalRecordSchema = z.strictObject({
    at: z.number().int().nonnegative(),
    sessionId: z.string().min(1).max(200),
    sessionName: z.string().max(500),
    cwd: z.string().max(4096),
    command: z.string().max(500),
    classification: z.literal('safe'),
});
export const EverydayApprovalPanelSchema = z.strictObject({
    enabled: z.boolean(),
    records: z.array(EverydayApprovalRecordSchema).max(1000),
});
export const EverydayApprovalSettingsSchema = z
    .strictObject({
    enabled: z.boolean(),
    confirm: z.literal(true).optional(),
})
    .refine((value) => !value.enabled || value.confirm === true, 'Confirmation required');
export function everydayApprovalCopy(locale) {
    return locale === 'zh-CN'
        ? {
            title: '日常自动审批',
            history: '自动审批记录',
            description: '仅在普通会话中自动允许可解析、未识别出危险类别的 shell 命令。默认关闭。',
            risk: '危险操作按命令文字识别，只能尽力而为；脚本内部、运行时下载或生成的代码仍不可见。普通命令可能读写工作目录以外的文件。日常会话没有目标模式的独立 worktree、检查点和回滚。确认开启日常自动审批？',
            disable: '关闭日常自动审批',
            empty: '还没有自动审批记录。',
            time: '时间',
            session: '会话',
            cwd: '工作目录',
            command: '命令',
            classification: '识别结果',
            safe: '普通操作',
        }
        : {
            title: 'Everyday auto-approval',
            history: 'Auto-approval history',
            description: 'Automatically allow parseable shell commands with no recognized dangerous category in ordinary sessions only. Off by default.',
            risk: 'Danger detection uses command text and is best effort. Script bodies, runtime downloads and generated code remain opaque. Ordinary commands may access files outside the working directory. Everyday sessions do not have goal-mode worktrees, checkpoints or rollback. Enable everyday auto-approval?',
            disable: 'Turn off everyday auto-approval',
            empty: 'No auto-approval records yet.',
            time: 'Time',
            session: 'Session',
            cwd: 'Working directory',
            command: 'Command',
            classification: 'Classification',
            safe: 'Ordinary operation',
        };
}
//# sourceMappingURL=contract.js.map