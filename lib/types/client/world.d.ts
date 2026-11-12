import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { Locale, WorldPreferencePatch, WorldSnapshot } from '#whalemaid/core';
export declare const worldCopy: (locale: Locale) => {
    readonly title: "宅邸";
    readonly experimental: "实验";
    readonly enable: "开启宅邸（实验）";
    readonly goals: "目标";
    readonly away: "桌宠走进宅邸（实验）";
    readonly hall: "大厅";
    readonly kitchen: "厨房";
    readonly gallery: "陈列室";
    readonly bedroom: "卧室";
    readonly floor: "楼层";
    readonly hold: "请勿打扰";
    readonly gate: "大门已关闭";
    readonly more: "更多";
    readonly storage: "储藏室";
    readonly archive: "移入储藏室";
    readonly restore: "搬回宅邸";
    readonly cabinet: "收纳柜";
    readonly overflow: "其余任务";
    readonly follow: "回到大肥鱼所在处";
    readonly list: "列表视图";
    readonly canvas: "房间视图";
    readonly overview: "楼层总览";
    readonly room: "选择房间";
    readonly quiet: "安静时段";
    readonly dawn: "清晨";
    readonly day: "白天";
    readonly evening: "傍晚";
    readonly night: "夜晚";
    readonly letter: "待决定的信件";
    readonly note: "建议便签";
    readonly parcel: "雷达包裹";
    readonly flicker: "持续集成失败";
    readonly paused: "已暂停";
    readonly locked: "授权已撤销";
    readonly working: "执行中";
    readonly mess: "待整理";
    readonly neutral: "暂无进度";
    readonly failed: "验收失败";
    readonly wilted: "进展停滞";
    readonly tank: "水缸";
    readonly books: "书架";
    readonly plant: "盆栽";
    readonly files: "立式文件架";
    readonly toolbox: "工具箱";
    readonly tray: "文件托盘";
    readonly basket: "编织收纳篮";
    readonly lamp: "台灯";
    readonly keepsake: "纪念摆件";
    readonly zoomIn: "放大";
    readonly zoomOut: "缩小";
    readonly load: "正在读取宅邸…";
    readonly unavailable: "暂时无法读取宅邸，请稍后再试。";
    readonly updateError: "设置没有保存，请重试。";
    readonly noCanvas: "画面无法加载，已切换到列表。";
    readonly pet: "大肥鱼";
    readonly fallback: "安装完整版可以看到她在宅邸里活动。";
    readonly leaseError: "桌宠暂时无法走进宅邸。";
    readonly summary: "完成总结";
    readonly experiences: "大肥鱼的经历";
    readonly verifiedTasks: "项任务已通过验收";
} | Record<"unavailable" | "title" | "paused" | "files" | "summary" | "day" | "failed" | "goals" | "neutral" | "hold" | "room" | "hall" | "kitchen" | "gallery" | "bedroom" | "pet" | "follow" | "letter" | "note" | "archive" | "quiet" | "storage" | "dawn" | "evening" | "night" | "cabinet" | "mess" | "parcel" | "flicker" | "locked" | "working" | "restore" | "canvas" | "list" | "wilted" | "plant" | "toolbox" | "tray" | "basket" | "lamp" | "books" | "tank" | "keepsake" | "floor" | "experiences" | "away" | "fallback" | "leaseError" | "load" | "experimental" | "enable" | "gate" | "more" | "overflow" | "overview" | "zoomIn" | "zoomOut" | "updateError" | "noCanvas" | "verifiedTasks", string>;
export declare function setWorldPreference(connection: ConnectionHandle, patch: WorldPreferencePatch): Promise<{
    enabled: boolean;
    petWalksIn: boolean;
    archived: (string & import("zod").$brand<"GoalId">)[];
    camera?: {
        x: number;
        y: number;
        zoom: number;
        room?: (string & import("zod").$brand<"GoalId">) | "hall" | "kitchen" | "gallery" | "bedroom" | undefined;
    } | undefined;
}>;
export declare function WorldSwitch({ connection, locale, enabled, changed, }: {
    connection: ConnectionHandle;
    locale: Locale;
    enabled: boolean | undefined;
    changed: (enabled: boolean) => void;
}): import("react").DetailedReactHTMLElement<{
    className: string;
}, HTMLElement>;
export type Exhibit = WorldSnapshot['gallery'][number];
type Navigation = {
    onGoal(id: string): void;
    onNotice(id: string): void;
    onExhibit(item: Exhibit): void;
};
export declare function MansionView({ connection, locale, onGoal, onNotice, onExhibit, }: {
    connection: ConnectionHandle;
    locale: Locale;
} & Navigation): import("react").DetailedReactHTMLElement<{
    role: "status";
}, HTMLElement> | import("react").DetailedReactHTMLElement<{
    className: string;
    'aria-label': string;
}, HTMLElement>;
export {};
