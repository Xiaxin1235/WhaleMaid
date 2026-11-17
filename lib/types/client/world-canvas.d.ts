import { worldLayout } from '#whalemaid/core';
import type { WorldPreferences, WorldSnapshot } from '#whalemaid/core';
export type Camera = NonNullable<WorldPreferences['camera']>;
export type Hit = {
    x: number;
    y: number;
    w: number;
    h: number;
    id: string;
    kind: 'goal' | 'notice' | 'gallery' | 'cabinet';
};
export type WorldArt = Partial<Record<'bell' | 'letter' | 'note', HTMLImageElement>>;
type Brush = CanvasRenderingContext2D;
export type WorldLabels = {
    hall: string;
    kitchen: string;
    gallery: string;
    bedroom: string;
    floor: string;
    hold: string;
    gate: string;
    more: string;
};
export declare const worldShade: (world: WorldSnapshot) => number;
export declare function actorPoint(layout: ReturnType<typeof worldLayout>, world: WorldSnapshot, camera: Camera, offset: {
    x: number;
    y: number;
}): {
    x: number;
    y: number;
    scale: number;
};
export declare function drawWorld(g: Brush, world: WorldSnapshot, camera: Camera, width: number, height: number, labels: WorldLabels, art: WorldArt, elapsed: number, shade: number): Hit[];
export {};
