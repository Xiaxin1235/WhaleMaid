// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { waitRecovery } from './desktop-recovery.mjs';
import { listDiagnostics, readDiagnostics } from '../../scripts/diagnostics-client.mjs';

export async function verifyNativeVisibility({ page, bridge, registry }) {
  const command = (name, extra = {}) => page.evaluate(value => window.dshPetBridge.testWindow(value), { command: name, ...extra });
  const samples = [];
  const restored = async reason => {
    await waitRecovery(async () => { const s = await command('inspect'); return s.visible && !s.minimized && s.top; }, `window did not recover from ${reason}`);
    const s = await command(process.platform === 'win32' ? 'measure' : 'inspect');
    assert.equal(s.petFullscreen, false, 'the overlay remains auxiliary and never enters fullscreen itself');
    if (!s.foregroundFocused || s.nativeForegroundFocused === false) console.log('Native recovery focus evidence:', reason, s);
    assert.equal(s.foregroundFocused, true, `${reason} recovery must not activate the pet`);
    assert.equal(s.focused, false); if (process.platform === 'win32') { assert.equal(s.aboveForeground, true); assert.equal(s.nativeForegroundFocused, true, 'Win32 foreground remains the fixture'); }
    samples.push({ reason, ...s });
  };
  bridge.configure({ size: 150, roam: false, notifications: true, diagnostics: true, aboveFullscreen: true, bubbleDurationMs: 12000 });
  try {
    await command('fullscreen');
    try { await waitRecovery(async () => (await command('inspect')).foregroundFocused, 'fullscreen fixture did not gain focus'); }
    catch(error) { console.log('Fullscreen setup evidence:',await command('inspect')); throw error; }
    await restored('fullscreen');
    for (const level of ['floating', 'pop-up-menu', 'screen-saver']) {
      await command('level', { level });
      const s = await command(process.platform === 'win32' ? 'measure' : 'inspect');
      assert.equal(s.foregroundFocused, true, `${level} must not steal focus`); if(process.platform==='win32')assert.equal(s.nativeForegroundFocused,true); samples.push({ level, ...s });
    }
    bridge.configure({ size:150,roam:false,notifications:true,diagnostics:true,aboveFullscreen:false,bubbleDurationMs:12000 });
    await page.waitForTimeout(200);const legacy=await command('inspect');await page.waitForTimeout(2200);
    assert.deepEqual((await command('inspect')).calls,legacy.calls,'legacy floating level must not create a periodic raise/show loop');
    bridge.configure({ size:150,roam:false,notifications:true,diagnostics:true,aboveFullscreen:true,bubbleDurationMs:12000 });
    await restored('configure-on');
    await command('minimize'); await restored('minimize');
    await command('lose-top'); await restored('lost-top');
    await command('system-hide'); await restored('system-hide');
    await command('offscreen'); await restored('offscreen');
    try { await waitRecovery(async()=>{const s=await command('inspect'),expected=s.workArea;return ['x','y','width','height'].every(k=>Math.abs(s.bounds[k]-expected[k])<=1);},'offscreen native window did not return to the work area'); }
    catch(error) { console.log('Offscreen recovery evidence:',await command('inspect'));throw error; }
    await page.waitForFunction(() => { const r = document.querySelector('#pet').getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    await command('user-hide'); await page.waitForTimeout(2300);
    assert.equal((await command('inspect')).visible, false, 'user hide survives the watchdog');
    await command('show'); await restored('explicit-show');
    // Synthetic power events affect only this test pet, never the actual desktop.
    for (const [pause, resume] of [['lock', 'unlock'], ['suspend', 'resume']]) {
      await command(pause); await command('system-hide'); await page.waitForTimeout(2200);
      assert.equal((await command('inspect')).visible, false, `${pause} suppresses automatic recovery`);
      await command(resume); await restored(resume);
    }
    let endpoints;
    await waitRecovery(async () => { endpoints = await listDiagnostics(registry); return endpoints.length === 1; }, 'diagnostics did not start');
    const diagnostic = await readDiagnostics(endpoints[0]);
    assert.ok(diagnostic.value.window.events.some(e => e.event === 'recovery'));
    assert.ok(diagnostic.value.window.current.pet, 'diagnostics include bounded renderer geometry');
    assert.ok(Buffer.byteLength(JSON.stringify(diagnostic)) <= 32768);
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/window-visibility-native.json', JSON.stringify({ samples, diagnostic }, null, 2));
    console.log('Native window visibility passed: fullscreen focus retained, three top levels compared, system recovery, explicit hide and suspension.');
  } finally {
    await command('close');
    bridge.configure({ size: 150, roam: false, notifications: true, diagnostics: false, aboveFullscreen: true, bubbleDurationMs: 12000 });
  }
}
