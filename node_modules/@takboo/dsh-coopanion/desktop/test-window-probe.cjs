// SPDX-License-Identifier: AGPL-3.0-or-later
// Only installed by the isolated native test; never a normal-install IPC surface.
exports.installWindowProbe = ({ ipcMain, BrowserWindow, screen, win, show, hide, hit, powerMonitor }) => {
  const calls = { top: 0, show: 0, focus: 0 };
  for (const [method, key] of [['setAlwaysOnTop', 'top'], ['showInactive', 'show'], ['focus', 'focus']]) {
    const original = win[method].bind(win); win[method] = (...args) => { calls[key]++; return original(...args); };
  }
  let game, measureChild, measure;
  const stopMeasure = () => { measure = undefined; measureChild?.stdin.end(); measureChild?.kill(); measureChild = undefined; };
  const startMeasure = async () => {
    if (process.platform !== 'win32') return;
    const handle = window => { const bytes = window.getNativeWindowHandle(); return bytes.length === 8 ? bytes.readBigUInt64LE().toString() : String(bytes.readUInt32LE()); };
    // Compile before focusing the fixture. Subsequent reads use this same hidden
    // child so creating a console cannot interfere with focus measurements.
    const bounds=game.getBounds(), point=screen.dipToScreenPoint({x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)});
    const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PetZOrder { [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint c); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra); [StructLayout(LayoutKind.Sequential)] public struct P { public int x,y; } [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p); [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint f); public static void FocusOwn(long own,int x,int y) { SetThreadDpiAwarenessContext(new IntPtr(-4)); if(GetAncestor(WindowFromPoint(new P{x=x,y=y}),2).ToInt64()!=own)throw new Exception("Fixture is occluded"); SetCursorPos(x,y); mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero); } public static bool Above(long pet,long game) { IntPtr w=GetTopWindow(IntPtr.Zero); for(int n=0;n<4096 && w!=IntPtr.Zero;n++,w=GetWindow(w,2)){ if(w.ToInt64()==pet)return true; if(w.ToInt64()==game)return false; } return false; } }'; [Console]::WriteLine('ready'); while (($line=[Console]::ReadLine()) -ne $null) { if($line -eq 'focus') { [PetZOrder]::FocusOwn(${handle(game)},${point.x},${point.y}) }; [Console]::WriteLine([PetZOrder]::Above(${handle(win)},${handle(game)})); [Console]::WriteLine([PetZOrder]::GetForegroundWindow().ToInt64() -eq ${handle(game)}) }`;
    const { spawn } = require('node:child_process');
    measureChild = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let buffer='', ready, pending; const startup=new Promise((resolve,reject)=>{ready=resolve;measureChild.once('error',reject);});
    measureChild.stdout.on('data', data => { buffer+=data; let end; while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line==='ready')ready();else if(pending){pending.lines.push(line);if(pending.lines.length===2){const p=pending;pending=undefined;clearTimeout(p.timer);p.resolve({aboveForeground:p.lines[0]==='True',nativeForegroundFocused:p.lines[1]==='True'});}}} });
    const timeout=setTimeout(()=>{stopMeasure();ready();},5000); await startup;clearTimeout(timeout);
    if(!measureChild)throw new Error('Native test measurement helper did not start');
    measure=(command='sample')=>new Promise((resolve,reject)=>{if(pending)return reject(new Error('Concurrent native test measurement'));const timer=setTimeout(()=>{pending=undefined;reject(new Error('Native test measurement timeout'));},3000);pending={resolve,reject,timer,lines:[]};measureChild.stdin.write(command+'\n');});
  };
  win.on('closed', stopMeasure);
  const inspect = () => ({ visible: win.isVisible(), minimized: win.isMinimized(), top: win.isAlwaysOnTop(),
    focused: win.isFocused(), foregroundFocused: game?.isFocused() ?? false, fullscreen: game?.isFullScreen() ?? false, petFullscreen: win.isFullScreen(), maximized: win.isMaximized(), normalBounds: win.getNormalBounds(),
    bounds: win.getBounds(), workArea: screen.getDisplayMatching(win.getBounds()).workArea, scaleFactor: screen.getDisplayMatching(win.getBounds()).scaleFactor, calls: { ...calls } });
  ipcMain.handle('pet:test-window', async (event, input) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return null;
    switch (input?.command) {
      case 'fullscreen':
        if(process.platform==='darwin')require('electron').app.setActivationPolicy('regular');
        game = new BrowserWindow({ fullscreen: true, show: false, backgroundColor: '#204060', webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
        await game.loadURL('data:text/html,<title>Fullscreen test fixture</title><h1>Fullscreen focus fixture</h1>');
        await startMeasure(); game.setAlwaysOnTop(true,'pop-up-menu'); game.show(); game.moveTop(); hit(false); if(measure)await measure('focus'); game.setAlwaysOnTop(false);
        // This is the explicit foreground fixture setup, not pet recovery.
        // AppKit will not reliably focus its window while the app is inactive.
        if(process.platform==='darwin')require('electron').app.focus({steal:true});
        game.focus();
        if(process.platform==='darwin') {
          // AppKit transitions Spaces asynchronously. Request fixture focus
          // after the transition, rather than during its opening animation.
          game.once('enter-full-screen',()=>{require('electron').app.focus({steal:true});game.focus();});
        }
        break;
      case 'minimize': win.minimize(); break;
      case 'system-hide': win.hide(); break;
      case 'lose-top': win.setAlwaysOnTop(false); break;
      case 'user-hide': hide(); break;
      case 'show': show(); break;
      case 'level':
        if (!['floating', 'pop-up-menu', 'screen-saver'].includes(input.level)) return null;
        win.setAlwaysOnTop(true, input.level); win.moveTop(); break;
      case 'measure': return { ...inspect(), ...(measure ? await measure() : {}) };
      case 'offscreen': win.setBounds({ x: -100000, y: -100000, width: 100, height: 100 }); break;
      case 'lock': powerMonitor.emit('lock-screen'); break;
      case 'unlock': powerMonitor.emit('unlock-screen'); break;
      case 'suspend': powerMonitor.emit('suspend'); break;
      case 'resume': powerMonitor.emit('resume'); break;
      case 'close': stopMeasure(); game?.destroy(); game = undefined; break;
      case 'inspect': break;
      default: return null;
    }
    return inspect();
  });
};
