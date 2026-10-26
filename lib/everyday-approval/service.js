import { realpath } from 'node:fs/promises';
import { AuthorizationScopeSchema, classifyCommand, checkAction, normalizeScopePath, resolveToolPath, isWithinScopePath, redactSecrets, } from '#whalemaid/core';
import { z } from 'zod';
import { EverydayApprovalSettingsSchema } from './contract.js';
const ShellArguments = z.strictObject({
    command: z.string().min(1),
    description: z.string(),
    workdir: z.string().optional(),
    timeoutMs: z.number().positive().optional(),
    run_in_background: z.literal(false).optional(),
    sandbox_permissions: z.enum(['workspace-write', 'danger-full-access']).optional(),
    justification: z.string().optional(),
});
const within = isWithinScopePath;
/** Redact before truncating, so a token crossing the display limit cannot escape masking. */
export function approvalLogText(value, limit) {
    return redactSecrets(value.replace(/(\$env:[a-z_]\w*\s*=\s*|\b[a-z_]\w*=)(?:"[^"]*"|'[^']*'|[^\s;|]+)/gi, '$1[已隐藏]'))
        .replace(/\p{Cc}/gu, ' ')
        .slice(0, limit);
}
/** A non-terminal answerer: only safe ordinary shell calls can produce allowed-once. */
export class EverydayApprovals {
    ctx;
    store;
    registry;
    stopped = false;
    constructor(ctx, store, registry) {
        this.ctx = ctx;
        this.store = store;
        this.registry = registry;
    }
    panel() {
        return this.store.everydayApprovalState();
    }
    settings(input) {
        const value = EverydayApprovalSettingsSchema.parse(input);
        this.store.setEverydayApprovalEnabled(value.enabled);
        return this.panel();
    }
    dispose() {
        this.stopped = true;
    }
    async answer(req, next) {
        let approved = false;
        try {
            if (this.stopped ||
                !this.panel().enabled ||
                !req.callId ||
                req.signal?.aborted ||
                !['bash', 'pwsh'].includes(req.toolName))
                return next();
            const agent = req.agent, session = agent.session, header = session.header;
            const agents = this.ctx.get('agents');
            if (!agents ||
                agents.get(session.id) !== agent ||
                !agents.roots().includes(agent) ||
                header.origin === 'subagent' ||
                header.parentSession ||
                header.agentPreset === 'whaledot-companion' ||
                this.registry.has(session.id))
                return next();
            const workspace = this.ctx.get('workspaceRegistry');
            // Missing archive truth is not permission to approve an unknown session.
            if (!workspace || workspace.archivedSessionIds.includes(session.id))
                return next();
            const events = session.snapshotEvents();
            const titles = events.filter((event) => event.type === 'session/title');
            const title = titles.at(-1)?.data.title ?? '';
            const first = events.find((event) => event.type === 'user/message');
            const content = first?.type === 'user/message' ? first.data.content : undefined;
            const firstText = typeof content === 'string'
                ? content
                : Array.isArray(content)
                    ? content
                        .filter((part) => part.type === 'text')
                        .map((part) => part.text)
                        .join('\n')
                    : '';
            if (/^\[(?:WhaleMaid|WhaleDot)\]/.test(title) ||
                firstText.trimStart().startsWith('WhaleDot: execute this single task'))
                return next();
            const call = events.findLast((event) => event.type === 'tool/call' && event.data.callId === req.callId);
            if (!call || call.type !== 'tool/call' || call.data.name !== req.toolName)
                return next();
            const callIndex = events.indexOf(call);
            if (callIndex < events.findLastIndex((event) => event.type === 'turn/start') ||
                events
                    .slice(callIndex + 1)
                    .some((event) => event.type === 'turn/end' ||
                    (event.type === 'tool/result' && event.data.message.toolCallId === req.callId)))
                return next();
            const args = ShellArguments.safeParse(JSON.parse(call.data.arguments));
            const root = header.cwd && normalizeScopePath(header.cwd);
            if (!args.success || !root)
                return next();
            const cwd = resolveToolPath(root, args.data.workdir ?? '.');
            if (!cwd || !within(cwd, root))
                return next();
            const actual = normalizeScopePath(await realpath(cwd));
            if (!actual || !within(actual, root))
                return next();
            // This is a transient classifier input, never a goal authorization or persistent scope.
            const scope = AuthorizationScopeSchema.parse({
                id: 'scope_everyday_classifier',
                goalId: 'goal_everyday_classifier',
                allowedPaths: [root],
                protectedPaths: [],
                allowedActions: ['run-command'],
                forbiddenActions: [],
                verifyCommands: [],
                commandMode: 'trusted',
                permissionPreset: 'workspace-write',
                status: 'active',
                grantedAt: 0,
                hash: '0'.repeat(64),
            });
            const classification = classifyCommand(args.data.command, actual, scope);
            // The target-mode classifier does not cover every package-manager uninstall alias.
            // Keep everyday approval conservative without changing goal-mode command rules.
            if (/\b(?:pip[23]?|uv|npm|pnpm|yarn|poetry|conda)(?:\.exe|\.cmd)?\b[^\r\n;&|]*\b(?:uninstall|remove|rm)\b/i.test(args.data.command))
                return next();
            if (classification.class !== 'safe' ||
                checkAction(scope, { type: 'run-command', cmdline: args.data.command, cwd: actual }).decision !==
                    'allow')
                return next();
            // Recheck after filesystem I/O. A stopped turn, new ownership or disabled switch wins.
            const currentAgents = this.ctx.get('agents');
            if (this.stopped ||
                req.signal?.aborted ||
                !this.panel().enabled ||
                this.registry.has(session.id) ||
                !currentAgents ||
                currentAgents.get(session.id) !== agent ||
                !currentAgents.roots().includes(agent) ||
                workspace.archivedSessionIds.includes(session.id))
                return next();
            this.store.recordEverydayApproval({
                at: Date.now(),
                sessionId: session.id,
                sessionName: approvalLogText(title, 500),
                cwd: approvalLogText(actual, 4096),
                command: approvalLogText(args.data.command, 500),
                classification: 'safe',
            });
            approved = true;
        }
        catch {
            // No logged decision means no grant. Delegate without changing policy or logging raw arguments.
        }
        return approved ? 'allowed-once' : next();
    }
}
export function installEverydayApprovals(ctx, service) {
    ctx.effect(() => () => service.dispose());
    ctx.on('approval/request', (request, next) => service.answer(request, next), { prepend: true });
}
//# sourceMappingURL=service.js.map