import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CompanionApi } from './service.js';
/** Every tool the companion session may call; the WhaleMaid gate denies anything else there. */
export declare const COMPANION_TOOL_NAMES: readonly ["whaledot_propose_goal", "whaledot_propose_work", "whaledot_propose_goal_pause", "whaledot_propose_autopilot", "whaledot_propose_global_pause", "whaledot_propose_goal_note", "whaledot_memory_list", "whaledot_memory_propose", "whaledot_memory_forget", "whaledot_recall_search", "whaledot_daily_brief", "whaledot_goals_overview", "whaledot_pending_decisions", "whaledot_goal_detail", "whaledot_recent_sessions", "read_session"];
export declare const COMPANION_ALLOWED_TOOLS: ReadonlySet<string>;
/** Read-only WhaleMaid tools for the companion preset. Results are data for the model, never instructions. */
export declare function companionTools(api: CompanionApi): ToolDefinition[];
