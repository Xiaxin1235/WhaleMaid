import type { Locale, RadarSettings } from '#whalemaid/core';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
export declare function RadarSettingsView({ connection, locale, settings, }: {
    connection: ConnectionHandle;
    locale: Locale;
    settings: RadarSettings;
}): import("react").ReactElement<{
    'data-radar-settings': string;
}, string | import("react").JSXElementConstructor<any>>;
export declare function GoalRadarView({ connection, locale, goalId, }: {
    connection: ConnectionHandle;
    locale: Locale;
    goalId: string;
}): import("react").DetailedReactHTMLElement<{
    'data-goal-radar': string;
    'aria-label': "项目雷达" | "Project Radar";
}, HTMLElement>;
