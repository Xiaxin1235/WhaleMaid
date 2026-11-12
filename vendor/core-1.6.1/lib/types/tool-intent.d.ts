import type { ActionIntent } from './model/action.js';
export declare const RESTRICTED_TOOLS: readonly ["exit_plan_mode", "working_directory", "bash_persistent", "pwsh_persistent", "terminal_open", "terminal_send", "terminal_read", "terminal_signal", "terminal_close", "terminal_list", "job_output", "job_list", "job_kill", "create_goal", "get_goal", "update_goal", "schedule", "schedule_create", "schedule_list", "schedule_update", "schedule_delete", "session_search", "session_event_search", "session_trace", "session_event_trace", "session_event_read", "send_message", "interrupt_agent", "list_agents", "list_subagent_models", "ralph", "run_code", "skill", "load_workspace_dependencies", "present", "workflow"];
/** Resolve literal paths without Node dependencies or cross-dialect aliases. */
export declare function resolveToolPath(cwd: string, path: string): string | null;
/** Map only verified tool shapes. Unsupported stateful/administrative surfaces fail closed. */
export declare function toolCallToIntents(name: string, args: unknown, ctx: {
    cwd: string;
    commandMode?: 'confirmed' | 'trusted';
}): {
    intents: ActionIntent[];
} | {
    unknown: true;
};
