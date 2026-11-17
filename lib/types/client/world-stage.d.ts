import type { WorldSnapshot } from '#whalemaid/core';
export interface StagePosition {
    x: number;
    y: number;
    scale: number;
}
export declare function stageEvent(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, source: Window | null): {
    type: string;
    actions: string[];
} | {
    type: string;
    actions?: never;
} | undefined;
/** One browser-owned lease through the authenticated Coopanion host route. */
export declare function keepStageLease(signal: AbortSignal, ready: () => void, request?: typeof fetch): Promise<void>;
export declare function WorldStage({ position, actor, time, quiet, visible, away, still, label, fallback, leaseError, }: {
    position: StagePosition;
    actor: WorldSnapshot['actor'];
    time: WorldSnapshot['time'];
    quiet: boolean;
    visible: boolean;
    away: boolean;
    still: () => Promise<string | undefined>;
    label: string;
    fallback: string;
    leaseError: string;
}): import("react").DetailedReactHTMLElement<{
    className: string;
    'data-stage': "ready" | "loading" | "fallback";
}, HTMLElement>;
