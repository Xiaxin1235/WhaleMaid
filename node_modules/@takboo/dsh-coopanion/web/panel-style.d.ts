// SPDX-License-Identifier: AGPL-3.0-or-later
export function contrast(a: string, b?: string): number;
export function actionInk(accent: string): string;
export function apronPosition(anchor: {x: number; y: number}, panel: {width: number; height: number}, viewport: {width: number; height: number}, petBottom?: number): {x: number; y: number; tail: 'top' | 'bottom'; offset: number};
export function createPanelStyle(document: Document): {set(value?: string): void; portraits(): void};
