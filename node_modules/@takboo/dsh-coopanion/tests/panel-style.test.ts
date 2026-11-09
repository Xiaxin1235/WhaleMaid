// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { actionInk, contrast, apronPosition } from '../web/panel-style.js';

it('keeps body, muted and themed action text readable on white and themed bands', () => {
  for (const accent of ['#3d55d8', '#c8643f', '#6d4fd6']) {
    const band = '#' + accent.slice(1).match(/../g)!.map(v => Math.round(parseInt(v, 16) * .13 + 255 * .87).toString(16).padStart(2, '0')).join('');
    for (const ink of ['#24303f', '#5f6672', actionInk(accent)]) {
      expect(contrast(ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, band)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#ffffff', actionInk(accent))).toBeGreaterThanOrEqual(4.5);
  }
});

it('places the tail toward the pet above/below and clamps it inside the corners', () => {
  const panel = { width: 360, height: 300 }, viewport = { width: 1200, height: 900 };
  expect(apronPosition({ x: 600, y: 700 }, panel, viewport, 850)).toMatchObject({ y: 382, tail: 'bottom', offset: 180 });
  expect(apronPosition({ x: 600, y: 20 }, panel, viewport, 160)).toMatchObject({ y: 178, tail: 'top', offset: 180 });
  for (const x of [0, 1200]) {
    const value = apronPosition({ x, y: 700 }, panel, viewport, 850);
    expect(value.x).toBeGreaterThanOrEqual(8); expect(value.x + panel.width).toBeLessThanOrEqual(1192);
    expect(value.offset).toBeGreaterThanOrEqual(28); expect(value.offset).toBeLessThanOrEqual(332);
  }
});
