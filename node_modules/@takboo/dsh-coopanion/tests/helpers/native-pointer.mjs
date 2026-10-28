import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';

const run = promisify(execFile);
// Win32 cursor inputs below are physical points. Make the short-lived helper
// Per-Monitor-V2 aware so Windows cannot virtualize them a second time.
async function warpWindowsCursor(point) {
  const awareness = point.logical ? '' : "if ([PetTestCursor]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) -eq [IntPtr]::Zero) { throw 'Cannot set test DPI awareness' };";
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PetTestCursor { [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'; ${awareness} if (-not [PetTestCursor]::SetCursorPos(${point.x},${point.y})) { throw 'Cannot move native test cursor' }`,
  ], { windowsHide: true });
}

const warpMacCursor = `
import ctypes, sys
class Point(ctypes.Structure):
    _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]
cg = ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
cg.CGWarpMouseCursorPosition.argtypes = [Point]
cg.CGWarpMouseCursorPosition.restype = ctypes.c_int32
if cg.CGWarpMouseCursorPosition(Point(float(sys.argv[1]), float(sys.argv[2]))) != 0:
    raise RuntimeError('Cannot move the native test cursor')
`;
const warpCursor = `
import ctypes, sys
x11 = ctypes.CDLL('libX11.so.6')
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XWarpPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_int, ctypes.c_int]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
display = x11.XOpenDisplay(None)
if not display:
    raise RuntimeError('Cannot open the native test display')
xtst = ctypes.CDLL('libXtst.so.6')
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
if not xtst.XTestFakeMotionEvent(display, -1, int(sys.argv[1]), int(sys.argv[2]), 0):
    raise RuntimeError('Cannot move the native X11 test cursor')
x11.XSync(display, 0)
x11.XCloseDisplay(display)
`;
const clickX11Cursor = `
import ctypes, sys, time
x11=ctypes.CDLL('libX11.so.6'); xtst=ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.argtypes=[ctypes.c_char_p]; x11.XOpenDisplay.restype=ctypes.c_void_p
x11.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int]; x11.XCloseDisplay.argtypes=[ctypes.c_void_p]
xtst.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
d=x11.XOpenDisplay(None)
if not d: raise RuntimeError('Cannot open the native test display')
try:
    button = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    for click in range(count):
        if click: time.sleep(.08)
        if not xtst.XTestFakeButtonEvent(d,button,1,0): raise RuntimeError('Cannot press native test button')
        x11.XSync(d,0)
        # Keep press and release distinct while Chromium and the window manager
        # dispatch the native button; do not send another click on a timeout.
        time.sleep(.05)
        if not xtst.XTestFakeButtonEvent(d,button,0,0): raise RuntimeError('Cannot release native test button')
        x11.XSync(d,0)
finally: x11.XCloseDisplay(d)
`;

export async function warpNativePoint(point) {
  if(process.platform==='darwin')await run('python3',['-c',warpMacCursor,String(point.x),String(point.y)]);
  else if(process.platform==='linux')await run('python3',['-c',warpCursor,String(point.x),String(point.y)]);
  else await warpWindowsCursor(point);
}

/** Exercise real click-through hit testing with the OS and CDP cursors at the same point. */
export async function petClick(page, options = {}, twice = false) {
  await page.evaluate(() => {
    if (window.__nativeInputTrace) { window.__nativeInputTrace.length = 0; return; }
    window.__nativeInputTrace = [];
    const record = entry => { window.__nativeInputTrace.push({ t: Math.round(performance.now()), ...entry }); if (window.__nativeInputTrace.length > 100) window.__nativeInputTrace.shift(); };
    window.dshPetBridge.subscribe(message => { if (['cursor', 'hit-state'].includes(message.type)) record(message); });
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'contextmenu']) document.addEventListener(type, event => {
      const pet = document.getElementById('pet'), box = pet.getBoundingClientRect();
      record({ type, target: `${event.target.tagName}#${event.target.id}`, x: event.clientX, y: event.clientY, nativeHit: pet.dataset.nativeHit, mode: pet.dataset.mode, hidden: pet.hidden, focus: document.hasFocus(), box: { x: box.x, y: box.y, w: box.width, h: box.height } });
    }, true);
  });
  const pet = page.locator('#pet');
  await pet.waitFor({ state: 'visible' });
  // CDP can attach to an inactive target after relaunch. Activate it before
  // ordinary pointer input; the desktop itself continues to show without stealing focus.
  await page.bringToFront();
  if (process.platform === 'darwin') {
    // A restarted transparent window can appear under a stationary cursor.
    // Observe a real leave/enter through the native cursor poll before CDP input.
    const origin = await pet.evaluate(() => ({ x: screenX, y: screenY }));
    await run('python3', ['-c', warpMacCursor, String(origin.x), String(origin.y)]);
    await page.waitForSelector('#pet[data-native-hit=false]');
    // Roaming can move the body while the cursor helper starts. Track its
    // current position until the native window acknowledges entry, then click.
    let entered = false;
    for (let attempt = 0; attempt < 10 && !entered; attempt++) {
      const point = await pet.evaluate(el => {
        const b = el.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
        return { x, y, screenX: screenX + x, screenY: screenY + y };
      });
      await run('python3', ['-c', warpMacCursor, String(point.screenX), String(point.screenY)]);
      await page.mouse.move(point.x, point.y);
      try { await page.waitForSelector('#pet[data-native-hit=true]', { timeout: 300 }); entered = true; }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
    }
    assert.ok(entered, `Native cursor did not enter the moving pet: ${JSON.stringify(await page.evaluate(() => window.__nativeInputTrace))}`);
  }
  if (process.platform === 'linux' && process.env.DISPLAY) {
    // CDP moves a virtual pointer. Enabling native input also generates X11
    // movement at the physical cursor; keep both at the same point as a user.
    const { point } = await nativeMeasurement(page, '#pet');
    await run('python3', ['-c', warpCursor, String(point.x), String(point.y)]);
  }
  if (process.platform === 'win32') {
    const { point } = await nativeMeasurement(page, '#pet');
    await warpWindowsCursor(point);
  }
  await pet.hover();
  await page.waitForSelector('#pet[data-native-hit=true]');
  if (process.platform === 'linux' && process.env.DISPLAY && options.button === 'right') {
    // After a restart X11 may discard CDP's virtual button events even after
    // native hit entry. Send the actual OS button at the measured body point,
    // as nativeClick already does for panels, retaining the event assertions.
    // Left/double clicks retain CDP's explicit click count; changing their
    // native timing is unrelated to the restarted right-button regression.
    const { point } = await nativeMeasurement(page, '#pet');
    await run('python3', ['-c', warpCursor, String(point.x), String(point.y)]);
    await page.waitForSelector('#pet[data-native-hit=true]');
    await run('python3', ['-c', clickX11Cursor, options.button === 'right' ? '3' : '1', twice ? '2' : '1']);
  } else if (process.platform === 'darwin') {
    // Hover freezes roaming. Use one fresh point for both pointers so a later
    // locator stability check cannot choose another point in the breathing body.
    const point = await pet.evaluate(el => {
      const b = el.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      return { x, y, screenX: screenX + x, screenY: screenY + y };
    });
    await run('python3', ['-c', warpMacCursor, String(point.screenX), String(point.screenY)]);
    await page.mouse[twice ? 'dblclick' : 'click'](point.x, point.y, options);
  } else await pet[twice ? 'dblclick' : 'click'](options);
  if (options.button === 'right') {
    try { await page.locator('#menu').waitFor({ state: 'visible', timeout: 3000 }); }
    catch (error) {
      console.log('Native pointer failure:', JSON.stringify(await page.evaluate(() => window.__nativeInputTrace)));
      if (process.platform === 'linux') {
        console.log('Native pointer measurement:', JSON.stringify(await nativeMeasurement(page, '#pet')));
        const tree = await run('xwininfo', ['-root', '-tree']);
        console.log('X11 window tree:', tree.stdout.slice(0, 6000));
      }
      throw error;
    }
    const trace = await page.evaluate(() => window.__nativeInputTrace);
    assert.ok(trace.some(event => event.type === 'pointerdown' && event.target === 'DIV#pet'), 'native right click reaches the pet');
    assert.ok(trace.some(event => event.type === 'contextmenu' && event.target === 'DIV#pet'), 'native right click opens the menu through contextmenu');
    if (process.env.DSH_PET_INPUT_TRACE === '1') console.log('Native pointer pass:', JSON.stringify(trace));
  }
}

/** Measurements and physical conversion come from the tested Electron instance. */
export async function nativeMeasurement(page, selector) {
  const measurement = await page.locator(selector).evaluate(el => {
    const b = el.getBoundingClientRect();
    if (!window.dshPetBridge.testScreenPoint) throw new Error('Native measurement requires an isolated debug test profile');
    const css = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    return window.dshPetBridge.testScreenPoint({...css,width:innerWidth,height:innerHeight}).then(native => ({ ...native, css }));
  });
  if(process.platform==='linux') {
    // Chromium's X11 screen API may cache the last in-window pointer event.
    // Independently query the real server cursor, retaining both observations.
    const {stdout}=await run('python3',['-c',`
import ctypes,json
x=ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes=[ctypes.c_char_p]; x.XOpenDisplay.restype=ctypes.c_void_p
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p]; x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XQueryPointer.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint)]
x.XCloseDisplay.argtypes=[ctypes.c_void_p]
d=x.XOpenDisplay(None)
if not d: raise RuntimeError('Cannot query native test cursor')
try:
 r=ctypes.c_ulong(); c=ctypes.c_ulong(); rx=ctypes.c_int(); ry=ctypes.c_int(); wx=ctypes.c_int(); wy=ctypes.c_int(); m=ctypes.c_uint()
 if not x.XQueryPointer(d,x.XDefaultRootWindow(d),ctypes.byref(r),ctypes.byref(c),ctypes.byref(rx),ctypes.byref(ry),ctypes.byref(wx),ctypes.byref(wy),ctypes.byref(m)): raise RuntimeError('Native cursor query failed')
 print(json.dumps({'x':rx.value,'y':ry.value}))
finally: x.XCloseDisplay(d)
`]);
    measurement.electronCursor=measurement.cursor;
    measurement.cursor=JSON.parse(stdout);
    measurement.cursorSource='XQueryPointer';
  }
  return measurement;
}

/** Native OS cursor + CDP click on a panel's measured CSS hit region. */
export async function nativeClick(page, selector) {
  await page.bringToFront();
  if(process.platform==='linux')await page.locator(selector).waitFor({state:'visible'});
  else await page.locator(selector).click({ trial: true });
  const measurement = await nativeMeasurement(page, selector), p = measurement.point;
  // Flush the trial's virtual pointer before the OS warp. Otherwise a queued
  // X11 motion from that trial can restore the previous point after the warp.
  if(process.platform!=='linux')await page.mouse.move(measurement.css.x, measurement.css.y);
  if (process.platform === 'darwin') await run('python3', ['-c', warpMacCursor, String(p.x), String(p.y)]);
  else if (process.platform === 'linux') await run('python3', ['-c', warpCursor, String(p.x), String(p.y)]);
  else await warpWindowsCursor(p);
  // A font/size update can reflow the panel while the OS helper starts. Keep
  // CDP and the physical cursor on the same measured point rather than mixing
  // two layout samples; locator trial above waits for actionability/stability.
  const { x, y } = measurement.css;
  // X11 cursor warps are processed asynchronously; Electron's screen query can
  // still return the previous sample when the helper process has just exited.
  // Wait for the native observation, without issuing another input action.
  let beforeCdp;
  const deadline=Date.now()+3000;
  do {
    beforeCdp=await nativeMeasurement(page, selector);
    if(Math.abs(beforeCdp.cursor.x-measurement.dip.x)<=2 && Math.abs(beforeCdp.cursor.y-measurement.dip.y)<=2)break;
    await page.waitForTimeout(25);
  }while(Date.now()<deadline);
  assert.ok(Math.abs(beforeCdp.cursor.x-measurement.dip.x)<=2 && Math.abs(beforeCdp.cursor.y-measurement.dip.y)<=2, `OS cursor conversion is correct before CDP input: ${JSON.stringify({ expected: measurement.dip, observed: beforeCdp.cursor, physical: p })}`);
  if(process.platform!=='linux')await page.mouse.move(x, y);
  try { await page.waitForSelector('#pet[data-native-hit=true]',{timeout:5000}); }
  catch(error) { console.log('Native panel entry evidence:',JSON.stringify({measurement,current:await nativeMeasurement(page,selector),renderer:await page.evaluate(()=>({pet:document.querySelector('#pet').dataset,trace:window.__nativeInputTrace,viewport:{width:innerWidth,height:innerHeight}}))}));throw error; }
  if(process.platform==='linux')await run('python3',['-c',clickX11Cursor]);
  else await page.mouse.click(x, y);
  const observed = await nativeMeasurement(page, selector);
  if (process.env.DSH_PET_INPUT_TRACE === '1') console.log('Pointer conversion stages:', JSON.stringify({ measurement, beforeCdp, observed }));
  // DIP -> integer physical -> DIP rounding is independent on each axis.
  assert.ok(Math.abs(observed.cursor.x - measurement.dip.x) <= 2 && Math.abs(observed.cursor.y - measurement.dip.y) <= 2,
    `OS cursor reaches the measured DIP point: ${JSON.stringify({ measurement, observed })}`);
  return { ...measurement, cursorAfterClick: observed.cursor };
}

/** Keep the OS cursor and CDP pointer away from an autonomous walking path. */
export async function parkNativePointer(page) {
  const origin = await page.evaluate(() => window.dshPetBridge.testScreenPoint
    ? window.dshPetBridge.testScreenPoint({ x: 2, y: 2, width: innerWidth, height: innerHeight }).then(v => v.point)
    : { x: screenX + 2, y: screenY + 2, logical: true });
  if (process.platform === 'darwin') await run('python3', ['-c', warpMacCursor, String(origin.x), String(origin.y)]);
  else if (process.platform === 'linux' && process.env.DISPLAY) await run('python3', ['-c', warpCursor, String(origin.x), String(origin.y)]);
  else if (process.platform === 'win32') await warpWindowsCursor(origin);
  await page.mouse.move(2, 2);
}
