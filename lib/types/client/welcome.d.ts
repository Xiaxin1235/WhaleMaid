import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale } from '#whalemaid/core';
type ArtKind = 'motion' | 'still';
type LoadArt = (kind: ArtKind) => Promise<string | undefined>;
export declare function openWelcome(locale: Locale): void;
/** The shell overlay stays mounted independently of the selected Harness panel. */
export declare function WelcomeOverlay({ ctx, connection }: {
    ctx: Context;
    connection: ConnectionHandle;
}): import("react").FunctionComponentElement<{
    locale: Locale;
    dismiss: () => void;
    loadArt: LoadArt;
    view: "welcome" | "update" | "both";
}> | null;
/** Settings entry: reopen the welcome without changing its record, and reach feedback channels. */
export declare function AboutSettings({ locale }: {
    locale: Locale;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
export {};
