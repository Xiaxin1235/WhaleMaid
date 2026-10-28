import type { Context } from '@deepseek-ai/cordis';
/** Prompt variable the preset's persona row renders (`prefix: '{{whaledot_persona}}'`). */
export declare const PERSONA_VARIABLE = "whaledot_persona";
/**
 * Child plugin of the `whaledot-companion` agent preset. It runs in that agent's scope only, so the
 * persona variable and the read-only tools exist for the companion session and for no other session.
 */
export declare const name = "whaledot-companion-agent";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
