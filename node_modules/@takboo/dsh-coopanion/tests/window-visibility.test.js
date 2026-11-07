// SPDX-License-Identifier: AGPL-3.0-or-later
import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { visibilityPlan, topLevel, createVisibilityGuard } = createRequire(import.meta.url)('../desktop/window-visibility.cjs');
const { createWindowTrace, windowTrace } = createRequire(import.meta.url)('../desktop/window-diagnostics.cjs');
const healthy = { ready: true, desiredVisible: true, visible: true, alwaysOnTop: true, aboveFullscreen: true };
it('recovers system minimization, hiding, lost top and display changes without disturbing healthy patrols', () => {
  expect(visibilityPlan(healthy, 'patrol')).toEqual([]);
  expect(visibilityPlan({ ...healthy, minimized: true, visible: false }, 'minimize')).toEqual(['restore-inactive', 'raise']);
  expect(visibilityPlan({ ...healthy, visible: false }, 'hide')).toEqual(['show-inactive', 'raise']);
  expect(visibilityPlan({ ...healthy, alwaysOnTop: false }, 'patrol')).toEqual(['raise']);
  expect(visibilityPlan(healthy, 'display-change')).toEqual(['raise']);
  expect(visibilityPlan(healthy, 'blur')).toEqual(['raise']);
  expect(visibilityPlan({ ...healthy, aboveFullscreen: false }, 'blur')).toEqual([]);
  expect(visibilityPlan({ ...healthy, aboveFullscreen: false, alwaysOnTop: false, belowTaskbar: true }, 'patrol')).toEqual([]);
  expect(topLevel(true, 'win32')).toBe('pop-up-menu'); expect(topLevel(false, 'win32')).toBe('floating');
});
it.each([{ desiredVisible: false }, { suspended: true }, { closing: true }, { destroyed: true }, { ready: false }])('never restores a deliberately hidden, suspended or closed window: %j', extra => {
  expect(visibilityPlan({ ...healthy, visible: false, minimized: true, ...extra }, 'minimize')).toEqual([]);
});
it('restores without activation and coalesces reentrant native events', () => {
  const calls = []; let guard;
  const win = { isDestroyed: () => false, isMinimized: () => true, isVisible: () => false, isAlwaysOnTop: () => false, isFocusable: () => true,
    setFocusable: v => calls.push(['focusable', v]), restore: () => { calls.push(['restore']); guard('restore'); }, showInactive: () => calls.push(['showInactive']), setAlwaysOnTop: (...v) => calls.push(['top', ...v]), moveTop: () => calls.push(['moveTop']) };
  guard = createVisibilityGuard({ win, state: () => healthy, platform: 'linux' }); guard('minimize');
  expect(calls).toEqual([['focusable', false], ['restore'], ['showInactive'], ['focusable', true], ['top', true, topLevel(true)], ['moveTop']]);
});
it('uses the inactive show path on Windows instead of activating restore', () => {
 const calls = []; const win = { isDestroyed:()=>false,isMinimized:()=>true,isVisible:()=>false,isAlwaysOnTop:()=>true,
   showInactive:()=>calls.push('showInactive'),setAlwaysOnTop:()=>calls.push('top'),moveTop:()=>calls.push('moveTop') };
 createVisibilityGuard({win,state:()=>healthy,platform:'win32'})('minimize');
 expect(calls).toEqual(['showInactive','top','moveTop']);
});
it('keeps passive macOS recovery non-focusable until real pointer interaction', () => {
  const calls=[]; let focusable=true;
  const win={isDestroyed:()=>false,isMinimized:()=>false,isVisible:()=>true,isAlwaysOnTop:()=>false,isFocused:()=>false,isFocusable:()=>focusable,
    setFocusable:v=>{focusable=v;calls.push(['focusable',v]);},setAlwaysOnTop:()=>{expect(focusable).toBe(false);calls.push(['top']);},moveTop:()=>{expect(focusable).toBe(false);calls.push(['moveTop']);}};
  createVisibilityGuard({win,state:()=>healthy,platform:'darwin'})('patrol');
  expect(calls).toEqual([['focusable',false],['top'],['moveTop']]);
});
it('keeps only 24 opted-in lifecycle snapshots, strips unknown data and clears history', () => {
  let enabled = false; const rect = { x: -1920, y: 0, width: 1920, height: 1040 };
  const state = { visible: true, minimized: false, alwaysOnTop: true, desiredVisible: true, bounds: rect, workArea: rect, scaleFactor: 1.25, pet: { at: 1, pet: { x: 100, y: 800, width: 150, height: 180 }, viewport: { x: 0, y: 0, width: 1920, height: 1040 } }, title: 'must not leak' };
  const trace = createWindowTrace({ enabled: () => enabled, snapshot: () => state, now: () => 1 });
  trace.record('blur'); expect(trace.read()).toBeUndefined(); enabled = true;
  for (let n = 0; n < 30; n++) trace.record('minimize');
  const clean = windowTrace(trace.read().events); expect(clean).toHaveLength(24); expect(JSON.stringify(clean)).not.toContain('must not leak');
  expect(() => windowTrace([{ ...clean[0], event: 'untrusted-title' }])).toThrow();
  trace.clear(); expect(trace.read().events).toEqual([]);
});
