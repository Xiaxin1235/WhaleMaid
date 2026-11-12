import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ElectronBridge } from '../dist/bridge.js';
import { verifyNativeVisibility } from './helpers/window-visibility-native.mjs';

const root=await mkdtemp(join(tmpdir(),'whalemaid-recovery-probe-'));
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
Object.assign(process.env,{DSH_PET_TEST_DATA_DIR:root,DSH_PET_TEST_WINDOW_CONTROL:'1',DSH_PET_TEST_DEBUG_PORT:String(port),DSH_PET_TEST_NO_SANDBOX:'1',DSH_PET_TEST_DIAGNOSTICS_DIR:join(root,'diagnostics'),XDG_CONFIG_HOME:root,XDG_CACHE_HOME:root});
const bridge=new ElectronBridge();let browser,page;
try{
  bridge.update({mood:'idle',sessionId:'native-recovery-only',sessions:[{id:'native-recovery-only',label:'Isolated recovery',mood:'idle',chatAvailable:true}],results:[]});
  await bridge.start({locale:'en',size:150,roam:false,notifications:true,bubbleDurationMs:12000});
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];
  await page.waitForSelector('#pet[data-host-ready=true]');
  await verifyNativeVisibility({page,bridge,registry:process.env.DSH_PET_TEST_DIAGNOSTICS_DIR});
}catch(error){console.error(error);await mkdir('artifacts',{recursive:true});await page?.screenshot({path:'artifacts/window-recovery-failure.png'}).catch(()=>{});throw error;}
finally{await bridge.dispose();await browser?.close();await rm(root,{recursive:true,force:true});}
