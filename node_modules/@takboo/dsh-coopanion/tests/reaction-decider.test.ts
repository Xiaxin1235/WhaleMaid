// SPDX-License-Identifier: AGPL-3.0-or-later
import { reactionKeyView } from '../src/client/reaction-key-view.ts';
import { expect, it, vi } from 'vitest';
import { ReactionDecider, reactionExcerpt } from '../src/reaction-decider.ts';
import type { DecisionsProvider } from '../src/reaction-decider.ts';
import { PetModel, type PetSnapshot } from '../src/model.ts';
import { SessionId, SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session';
import { REACTION_EXPRESSIONS, reactionFor } from '../web/reaction.js';

const secret = 'fictional-api-key-do-not-log', reply = '太棒了，虚构 bug 修好啦！';
function snapshot(id = 'r1', text = reply): PetSnapshot {
  return {mood:'idle',text:'',sessionId:'chat',companionSessionId:'chat',revision:1,active:false,streaming:false,speechId:'',results:[{id,sessionId:'chat',text,time:1,read:false}],sessions:[{id:'chat',label:'private title',project:'private project',cwd:'C:\\private-path',prompt:'private-user-input',createdAt:0,updatedAt:1,mood:'idle',text:'',reply:text,replyId:id,unread:1,revision:1,active:false,streaming:false,speechId:'',companionRole:'current'}]};
}
function answer(choice = 'excited', confidence = .9) {
  return {answers:{reply_mood:{type:'choice',choice,confidence,probabilities:Object.fromEntries(REACTION_EXPRESSIONS.map(value=>[value,value===choice?1:0]))}}};
}
function setup(fetcher = vi.fn(async()=>Response.json(answer()))) {
  let enabled=true,key: string|undefined=secret,now=10000;
  const send=vi.fn(),log=vi.fn(),changed=vi.fn();
  const decider=new ReactionDecider({enabled:()=>enabled,provider:()=> 'openrouter',key:()=>key,now:()=>now,fetch:fetcher,send,log,changed});
  return {decider,fetcher,send,log,changed,setEnabled:(v:boolean)=>{enabled=v;},setKey:(v:string|undefined)=>{key=v;},setNow:(v:number)=>{now=v;}};
}
it('sends only the Unicode-bounded final opening, with the documented API shape and no metadata',async()=>{
  expect(reactionExcerpt('首段\r\n\r\nPRIVATE TAIL')).toBe('首段');
  expect(reactionExcerpt('🐳'.repeat(120)+'\n\nPRIVATE TAIL')).toBe('🐳'.repeat(120));
  expect(Array.from(reactionExcerpt('🐳'.repeat(201))).length).toBe(200);
  const s=setup();s.decider.observe(snapshot('r1',reply+'\n\nPRIVATE TAIL'));
  await vi.waitFor(()=>expect(s.send).toHaveBeenCalledOnce());
  const [url,options]=s.fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
  expect(options.headers).toEqual({Authorization:`Bearer ${secret}`,'Content-Type':'application/json'});
  const body=JSON.parse(String(options.body));
  expect(Object.keys(body).sort()).toEqual(['model','questions','state']);
  expect(body).toMatchObject({model:'openai/gpt-6-luna-decisions',state:reply,questions:{reply_mood:{type:'choice'}}});
  expect(body.questions.reply_mood.criteria).toEqual(Object.fromEntries(REACTION_EXPRESSIONS.map(value=>[value,value])));
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.stringify(body)).not.toMatch(/PRIVATE TAIL|private title|private-path|private-user-input/);
  expect(s.send).toHaveBeenCalledWith({type:'reaction',resultId:'r1',sessionId:'chat',expression:'excited',at:10000});
  expect(JSON.stringify(s.log.mock.calls)).not.toContain(secret);expect(JSON.stringify(s.log.mock.calls)).not.toContain(reply);
  expect(s.decider.status()).toEqual({provider:'openrouter',keyAvailable:true,calls:1});s.decider.dispose();
});
it('does not send disabled, missing-key, historical, archived or WhaleMaid / WhaleDot replies, and never replays them',async()=>{
  for(const mode of ['off','key','history','archive','label','legacy-label','prompt'] as const){
    const s=setup(),state=snapshot();
    if(mode==='off')s.setEnabled(false);if(mode==='key')s.setKey(undefined);
    if(mode==='history')state.results[0].read=true;if(mode==='archive')state.sessions[0].archived=true;
    if(mode==='label')state.sessions[0].label='[WhaleMaid] private task';if(mode==='legacy-label')state.sessions[0].label='[WhaleDot] private task';
    if(mode==='prompt')state.sessions[0].prompt='WhaleDot: execute this single task\nPRIVATE';
    s.decider.observe(state);s.setEnabled(true);s.setKey(secret);state.results[0].read=false;state.sessions[0].archived=false;state.sessions[0].label='ordinary';state.sessions[0].prompt='ordinary';s.decider.observe(state);
    expect(s.fetcher).not.toHaveBeenCalled();expect(s.log).not.toHaveBeenCalled();s.decider.dispose();
  }
});
it('reserves a rolling hourly quota before concurrent requests and deduplicates in-flight and failed ids',async()=>{
  const fetcher=vi.fn(async()=>new Response('private failure',{status:429})),s=setup(fetcher as ReturnType<typeof setup>['fetcher']);
  for(let i=0;i<31;i++){s.decider.observe(snapshot('r'+i));s.decider.observe(snapshot('r'+i));}
  await vi.waitFor(()=>expect(s.log).toHaveBeenCalledTimes(30));expect(fetcher).toHaveBeenCalledTimes(30);expect(s.send).not.toHaveBeenCalled();
  s.setNow(3610000);s.decider.observe(snapshot('new-hour'));await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(31));
  expect(s.decider.status().calls).toBe(31);s.decider.dispose();
});
it('silently drops neutral and low confidence; malformed data, HTTP and network failures produce one safe diagnostic',async()=>{
  for(const payload of [answer('neutral'),answer('happy',.49),{answers:[]},answer('not-allowed'),{answers:[{type:'choice',name:'reply_mood',choice:'happy',confidence:.9}]}]){
    const s=setup(vi.fn(async()=>Response.json(payload)));
    s.decider.observe(snapshot());await vi.waitFor(()=>expect(s.log).toHaveBeenCalledOnce());expect(s.send).not.toHaveBeenCalled();s.decider.dispose();
  }
  const s=setup(vi.fn(async()=>{throw Error(`${secret}: ${reply}`);}));s.decider.observe(snapshot());
  await vi.waitFor(()=>expect(s.log).toHaveBeenCalledOnce());expect(JSON.stringify(s.log.mock.calls)).not.toContain(secret);expect(JSON.stringify(s.log.mock.calls)).not.toContain(reply);expect(s.send).not.toHaveBeenCalled();s.decider.dispose();
});
it('aborts a timed-out request without retrying',async()=>{
  const send=vi.fn(),log=vi.fn();
  const fetcher=vi.fn((_url: string|URL|Request,options?:RequestInit)=>new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(Error('private timeout contents')),{once:true})));
  const decider=new ReactionDecider({enabled:()=>true,provider:()=> 'openrouter',key:()=>secret,fetch:fetcher,send,log,timeout:()=>AbortSignal.timeout(10)});
  decider.observe(snapshot());await vi.waitFor(()=>expect(log).toHaveBeenCalledOnce());expect(fetcher).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();decider.observe(snapshot());expect(fetcher).toHaveBeenCalledOnce();decider.dispose();
});
it('ignores replies that become stale or disabled while classification is in flight',async()=>{
  let resolve!: (r:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;})),s=setup(fetcher as ReturnType<typeof setup>['fetcher']);
  s.decider.observe(snapshot());s.setEnabled(false);resolve(Response.json(answer()));await vi.waitFor(()=>expect(s.log).toHaveBeenCalledOnce());expect(s.send).not.toHaveBeenCalled();s.decider.dispose();
});
it('observes a result only after PetModel commits the completed turn, not live text or assistant messages',async()=>{
  const model=new PetModel(),s=setup();
  const session={id:SessionId('live'),header:{id:SessionId('live'),createdAt:0,cwd:'/fictional'}} as Session;
  const consume=(type:string,data:unknown,seq:number)=>{model.consume(session,{type,data,seq:SessionSeq(seq),time:seq} as SessionEvent);s.decider.observe(model.snapshot());};
  consume('turn/start',{turn:1},1);
  consume('assistant/message',{message:{role:'assistant',content:[{type:'text',text:reply}]}},2);
  expect(s.fetcher).not.toHaveBeenCalled();consume('turn/end',{turn:1,reason:{kind:'completed'}},3);
  await vi.waitFor(()=>expect(s.fetcher).toHaveBeenCalledOnce());consume('turn/end',{turn:1,reason:{kind:'completed'}},3);expect(s.fetcher).toHaveBeenCalledOnce();s.decider.dispose();
});
it('validates renderer age, latest result, vocabulary and blockers without changing notices',()=>{
  const state=snapshot(),message={type:'reaction',resultId:'r1',sessionId:'chat',expression:'love',at:10000};
  const options={now:10000,words:REACTION_EXPRESSIONS,blocked:false};
  expect(reactionFor(message,state,options)).toBe('love');
  for(const m of [{...message,at:-6000},{...message,resultId:'old'},{...message,expression:'unknown'},{...message,at:NaN}])expect(reactionFor(m,state,options)).toBeUndefined();
  expect(reactionFor(message,state,{...options,blocked:true})).toBeUndefined();
  expect(reactionFor(message,state,{...options,words:['neutral']})).toBeUndefined();
});

it('uses only the selected provider endpoint, environment key, request and response schema',async()=>{
  vi.stubEnv('OPENAI_API_KEY','fictional-direct-key');vi.stubEnv('OPENROUTER_API_KEY','fictional-router-key');
  try {
    for(const provider of ['openai','openrouter'] as const){
      const send=vi.fn(),log=vi.fn(),routerAnswer=answer('happy');
      const payload=provider==='openrouter'?routerAnswer:{answers:[{type:'choice',name:'reply_mood',choice:'happy',confidence:.9,probabilities:REACTION_EXPRESSIONS.map(value=>({value,probability:value==='happy'?1:0}))}]};
      const fetcher=vi.fn(async()=>Response.json(payload));
      const decider=new ReactionDecider({enabled:()=>true,provider:()=>provider,send,log,fetch:fetcher});decider.observe(snapshot());
      await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());
      const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
      expect(url).toBe(provider==='openai'?'https://api.openai.com/v1/decisions':'https://openrouter.ai/api/alpha/decisions');
      expect(options.headers).toMatchObject({Authorization:provider==='openai'?'Bearer fictional-direct-key':'Bearer fictional-router-key'});
      const body=JSON.parse(String(options.body));
      expect(Object.keys(body).sort()).toEqual(provider==='openai'?['input','model','questions']:['model','questions','state']);
      if(provider==='openai'){
        expect(body).toMatchObject({model:'gpt-6-luna',input:reply,questions:[{type:'choice',name:'reply_mood'}]});
        expect(body.questions[0].choices).toEqual(REACTION_EXPRESSIONS.map(value=>({value})));
      }else expect(body.model).toBe('openai/gpt-6-luna-decisions');
      expect(decider.status()).toMatchObject({provider,keyAvailable:true,calls:1});decider.dispose();
    }
    vi.stubEnv('OPENROUTER_API_KEY','');const fetcher=vi.fn(),decider=new ReactionDecider({enabled:()=>true,provider:()=> 'openrouter',send:vi.fn(),log:vi.fn(),fetch:fetcher});
    decider.observe(snapshot());expect(fetcher).not.toHaveBeenCalled();expect(decider.status().keyAvailable).toBe(false);decider.dispose();
  }finally{vi.unstubAllEnvs();}
});
it('discards an in-flight reaction after changing service and never falls back after a failed request',async()=>{
  let provider:DecisionsProvider='openrouter',resolve!:(r:Response)=>void;
  const send=vi.fn(),log=vi.fn(),fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));
  const decider=new ReactionDecider({enabled:()=>true,provider:()=>provider,key:()=>secret,send,log,fetch:fetcher});
  decider.observe(snapshot());provider='openai';resolve(Response.json(answer()));await vi.waitFor(()=>expect(log).toHaveBeenCalledOnce());expect(send).not.toHaveBeenCalled();decider.dispose();
  const denied=vi.fn(async()=>new Response('never log this response',{status:401})),failed=new ReactionDecider({enabled:()=>true,provider:()=> 'openrouter',key:()=>secret,send,log,fetch:denied});
  failed.observe(snapshot());await vi.waitFor(()=>expect(log).toHaveBeenCalledTimes(2));expect(denied).toHaveBeenCalledOnce();expect(log).toHaveBeenLastCalledWith('Decisions reaction unavailable: HTTP 401');failed.dispose();
});

it('resolves credentials dynamically, hot-updates on subsequent decisions without restart', async () => {
  const store = new Map<string, string>([['OPENAI_API_KEY', 'first-credential-key']]);
  const creds = {
    resolve: vi.fn(async (ref: string) => store.has(ref) ? { value: store.get(ref)! } : undefined),
    describe: vi.fn(async (ref: string) => ({ configured: store.has(ref), source: store.has(ref) ? 'file' : undefined, writable: true })),
    set: vi.fn(async (ref: string, val: string) => { store.set(ref, val); }),
    unset: vi.fn(async (ref: string) => { store.delete(ref); }),
  };
  const fetcher = vi.fn(async () => Response.json(answer('happy')));
  const send = vi.fn(), log = vi.fn();
  const decider = new ReactionDecider({
    enabled: () => true,
    provider: () => 'openai',
    credentials: () => creds as never,
    fetch: fetcher,
    send,
    log,
  });
  await decider.refreshStatus();
  expect(decider.status()).toMatchObject({ provider: 'openai', keyAvailable: true, source: 'file', writable: true });

  decider.observe(snapshot('r1'));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const [, opt1] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(opt1.headers).toMatchObject({ Authorization: 'Bearer first-credential-key' });

  // Hot update credential without restarting
  store.set('OPENAI_API_KEY', 'second-credential-key');
  decider.observe(snapshot('r2'));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const [, opt2] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
  expect(opt2.headers).toMatchObject({ Authorization: 'Bearer second-credential-key' });
  decider.dispose();
});

it('falls back to process.env when credentials service is absent', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'env-only-fallback-key');
  try {
    const fetcher = vi.fn(async () => Response.json(answer('happy')));
    const send = vi.fn(), log = vi.fn();
    const decider = new ReactionDecider({
      enabled: () => true,
      provider: () => 'openrouter',
      credentials: () => undefined,
      fetch: fetcher,
      send,
      log,
    });
    await decider.refreshStatus();
    expect(decider.status()).toMatchObject({ provider: 'openrouter', keyAvailable: true, source: 'env', writable: false });

    decider.observe(snapshot('r1'));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const [, opt] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(opt.headers).toMatchObject({ Authorization: 'Bearer env-only-fallback-key' });
    decider.dispose();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('rejects setKey and clearKey when shadowed by environment variable with exact error', async () => {
  const creds = {
    resolve: vi.fn(async () => ({ value: 'env-key' })),
    describe: vi.fn(async () => ({ configured: true, source: 'env', writable: false })),
    set: vi.fn(async () => { throw new Error('Cannot set read-only environment variable'); }),
    unset: vi.fn(async () => { throw new Error('Cannot unset read-only environment variable'); }),
  };
  const decider = new ReactionDecider({
    enabled: () => true,
    provider: () => 'openai',
    credentials: () => creds as never,
    log: vi.fn(),
    send: vi.fn(),
  });
  await decider.refreshStatus();
  await expect(decider.setKey('openai', 'valid-key-value')).rejects.toThrow('该密钥由系统环境变量提供，请先删除环境变量');
  await expect(decider.clearKey('openai')).rejects.toThrow('该密钥由系统环境变量提供，请先删除环境变量');
  decider.dispose();
});

it('validates key format strictly: trims whitespace and rejects empty, oversize (>512) or non-printable ASCII', async () => {
  const store = new Map<string, string>();
  const creds = {
    resolve: vi.fn(async (ref: string) => store.has(ref) ? { value: store.get(ref)! } : undefined),
    describe: vi.fn(async (ref: string) => ({ configured: store.has(ref), source: store.has(ref) ? 'file' : undefined, writable: true })),
    set: vi.fn(async (ref: string, val: string) => { store.set(ref, val); }),
    unset: vi.fn(async (ref: string) => { store.delete(ref); }),
  };
  const decider = new ReactionDecider({
    enabled: () => true,
    provider: () => 'openrouter',
    credentials: () => creds as never,
    log: vi.fn(),
    send: vi.fn(),
  });

  const invalidInputs = [
    '',
    '   ',
    'a'.repeat(513),
    'key\nwith\nnewlines',
    'key\twith\ttab',
    'key\x00null',
    '包含中文密钥',
  ];
  for (const invalid of invalidInputs) {
    await expect(decider.setKey('openrouter', invalid)).rejects.toThrow('密钥格式无效：只允许 1–512 位的 ASCII 可打印字符');
  }

  // Valid inputs
  await decider.setKey('openrouter', '  sk-valid-ascii-123  ');
  expect(store.get('OPENROUTER_API_KEY')).toBe('sk-valid-ascii-123');

  await decider.setKey('openrouter', 'a'.repeat(512));
  expect(store.get('OPENROUTER_API_KEY')).toBe('a'.repeat(512));

  decider.dispose();
});

it('never leaks secret values in status, returns, logs, or error strings', async () => {
  const canarySecret = 'CANARY_SECRET_DO_NOT_LEAK_XYZ_98765';
  const store = new Map<string, string>();
  const creds = {
    resolve: vi.fn(async (ref: string) => store.has(ref) ? { value: store.get(ref)! } : undefined),
    describe: vi.fn(async (ref: string) => ({ configured: store.has(ref), source: store.has(ref) ? 'file' : undefined, writable: true })),
    set: vi.fn(async (ref: string, val: string) => { store.set(ref, val); }),
    unset: vi.fn(async (ref: string) => { store.delete(ref); }),
  };
  const logs: string[] = [];
  const decider = new ReactionDecider({
    enabled: () => true,
    provider: () => 'openai',
    credentials: () => creds as never,
    log: msg => logs.push(msg),
    send: vi.fn(),
  });

  const setStatus = await decider.setKey('openai', canarySecret);
  // Status check: returns { configured, writable, source }, no values
  expect(JSON.stringify(setStatus)).not.toContain(canarySecret);
  expect(setStatus.openai).toEqual({ configured: true, source: 'file', writable: true });

  const credStatus = await decider.getCredentialStatus();
  expect(JSON.stringify(credStatus)).not.toContain(canarySecret);

  const currentStatus = decider.status();
  expect(JSON.stringify(currentStatus)).not.toContain(canarySecret);

  // Clear key
  const clearStatus = await decider.clearKey('openai');
  expect(JSON.stringify(clearStatus)).not.toContain(canarySecret);

  // Global log check: canary secret must never appear in logs
  for (const logMsg of logs) {
    expect(logMsg).not.toContain(canarySecret);
  }
  expect(logs).toContain('已更新 OpenAI 密钥');
  expect(logs).toContain('已清除 OpenAI 密钥');

  decider.dispose();
});

it('shows any non-writable configured key as read-only, naming .env files separately', () => {
  expect(reactionKeyView(undefined)).toBe('loading');
  expect(reactionKeyView({ configured: false, writable: true })).toBe('missing');
  expect(reactionKeyView({ configured: true, source: 'file', writable: true })).toBe('harness');
  expect(reactionKeyView({ configured: true, source: 'env', writable: false })).toBe('env');
  expect(reactionKeyView({ configured: true, source: 'user-env', writable: false })).toBe('env-file');
  expect(reactionKeyView({ configured: true, source: 'project-env', writable: false })).toBe('env-file');
});
