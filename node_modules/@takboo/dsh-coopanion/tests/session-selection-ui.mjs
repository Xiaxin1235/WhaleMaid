import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { observeBodyReady } from './helpers/body-startup.mjs';
import { previewServer } from '../scripts/preview.mjs';

const root=await mkdtemp(join(tmpdir(),'whalemaid-selection-'));
const server=previewServer({dataDir:root});server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1200,height:800},reducedMotion:'reduce'});
  page.setDefaultTimeout(12000);
  await page.addInitScript(()=>{window.selectionActions=[];window.dshPetBridge={subscribe:fn=>window.selectionReceive=fn,action:value=>window.selectionActions.push(value),hit(){}};});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await observeBodyReady(page, 'session-selection-ui')('#pet[data-character=whale][data-mode]');
  const a={id:'first',label:'First conversation',mood:'idle',unread:0,chatAvailable:true},b={...a,id:'second',label:'Second conversation',unread:1};
  const reply={id:'second-reply',sessionId:b.id,text:'The second conversation result.',time:1,read:false};
  const frame=id=>({mood:'idle',active:false,sessionId:id,sessions:[a,b],results:[reply]});
  const receive=value=>page.evaluate(value=>window.selectionReceive(value),value);
  await receive({type:'init',baseline:true,options:{roam:false,notifications:true},snapshot:frame(a.id)});
  await page.locator('#attention').click();
  await page.locator('#reader:not([hidden])').waitFor();
  await page.locator('#reader-session').click();
  assert.equal(await page.locator('#chat-session-name').innerText(),b.label);
  // The acknowledgement of "read" was captured before the later selection.
  await receive({type:'snapshot',snapshot:frame(a.id)});
  await page.locator('#message').fill('Continue the second conversation.');
  await page.locator('#send').click();
  assert.equal(await page.evaluate(()=>window.selectionActions.find(a=>a.type==='chat')?.sessionId),b.id,'the message retains the chosen source too');
  await page.locator('#chat-session').click();
  const opened=await page.evaluate(()=>window.selectionActions.filter(a=>a.type==='open-session').at(-1));
  assert.equal(opened.sessionId,b.id,'an in-flight read snapshot cannot redirect a user to the previous conversation');
  await receive({type:'snapshot',snapshot:frame(b.id)});
  await receive({type:'snapshot',snapshot:frame(a.id)});
  assert.equal(await page.locator('#chat-session-name').innerText(),a.label,'authoritative selections work normally after acknowledgement');
  console.log('Session selection UI passed: stale read snapshot cannot change the chosen source; host acknowledgement releases the selection.');
} finally {await browser?.close();await new Promise(done=>server.close(done));await rm(root,{recursive:true,force:true});}
