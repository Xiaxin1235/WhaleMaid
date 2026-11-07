import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

test('the real Client factory synchronizes resolved Harness locale without workspace or notifications', async () => {
  let factory, active='en'; const listeners=new Set(), calls=[], cleanup=[];
  const focusEvents=new EventTarget(), documentEvents=new EventTarget();
  const document={createElement:()=>({dataset:{},remove(){}}),head:{append(){}},visibilityState:'visible',addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents)};
  runInNewContext(readFileSync(new URL('../dist/client.js',import.meta.url),'utf8'),{crypto:webcrypto,window:{__ModuleLoader__:{load(value){factory=value.factory;}},addEventListener:focusEvents.addEventListener.bind(focusEvents),removeEventListener:focusEvents.removeEventListener.bind(focusEvents)},document,URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
  const client=factory(()=>({}));
  const ctx={effect(fn){const stop=fn(); if(stop) cleanup.push(stop);},inject(){},locale:{register:()=>()=>{},getLocale:()=>({active}),resolveText:()=>active==='custom'?'zh':active,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}},configForms:{get:()=>({getSnapshot:()=>({value:{notifications:false,systemNotifications:false}})})},slots:{inject(){}},connection:{isLoopback:true,rpc:{async call(...args){calls.push(args);return{ok:true,value:{}};}}}};
  client.apply(ctx); await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(calls.some(call=>call[2]?.locale==='en'),'initial resolved language is sent even without uiWorkspace');
  active='zh'; for(const listener of listeners) listener(); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.at(-1)[2].locale,'zh','language changes propagate immediately');
  const previous=calls.length; focusEvents.dispatchEvent(new Event('focus')); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.length,previous+1,'focused Harness window reasserts its actual language without a preference change');
  active='custom'; for(const listener of listeners) listener(); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.at(-1)[2].locale,'zh','the registered Harness fallback chain determines the plugin language');
  for(const stop of cleanup.reverse()) stop();
  assert.equal(listeners.size,0,'locale subscription follows plugin lifecycle');
  const disposedCalls=calls.length; focusEvents.dispatchEvent(new Event('focus')); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.length,disposedCalls,'focus subscriptions are removed on disposal');
});
