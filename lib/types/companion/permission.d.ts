import type { Context } from '@deepseek-ai/cordis';
import type { WhaleStore } from '../store/index.js';
/**
 * Earlier versions pinned her session to `read-only`. She now works like an ordinary conversation, so
 * move her current session to `workspace-write` once. After that the user owns the preset (`/permission`).
 * A cold session has no agent yet, so this waits for her agent to be created or to take a step.
 */
export declare function installCompanionPermission(ctx: Context, store: WhaleStore, log: (message: string, error?: unknown) => void): void;
