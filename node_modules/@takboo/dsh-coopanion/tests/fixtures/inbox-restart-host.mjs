// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const name = 'coopanion-inbox-restart-fixture';
export const inject = ['sessions', 'sessionController', 'sessionProjections', 'userQuestions', 'sessionQuery'];
export function apply(ctx) {
 const marker = join(process.env.DSH_HOME, 'c04-v9-seeded.json');
 if (existsSync(marker)) {
   void (async () => {
     const listed = await ctx.sessionController.list({},new AbortController().signal), observed=[];
     for(const item of listed.items) { const view=await ctx.sessionQuery.observeSession(item.sessionId); observed.push({id:item.sessionId,header:view.header,events:view.events.length});view[Symbol.dispose](); }
     writeFileSync(join(process.env.DSH_HOME,'c04-restored-list.json'),JSON.stringify({observed}));
   })().catch(error=>writeFileSync(join(process.env.DSH_HOME,'c04-restored-list.json'),JSON.stringify({error:String(error),stack:error.stack})));
   return;
 }
 void (async () => {
      const ids = {}, projections = {};
      for (const kind of ['reply', 'error', 'blocked', 'continued', 'open', 'approval']) {
        const sessionId = `c04-v9-inbox-${kind}`;
        const value = await ctx.sessionController.create({ sessionId, cwd: process.env.DSH_HOME });
        const session = ctx.sessions.get(value.sessionId); ids[kind] = session.id;
        session.append('user/message', { role: 'user', id: `c04-user-${kind}`, content: [{ type: 'text', text: `C04 ${kind}` }], source: { kind: 'user' } }, { surfaceOp: 'append' });
        session.append('turn/start', { turn: 1 });
        session.append('step/start', { turn: 1, step: 1 });
        if (kind === 'reply') session.append('assistant/message', { turn: 1, step: 1, stream: [], message: { role: 'assistant', source: {kind:'model',provider:'test',model:'fixture'}, id: 'c04-reply', content: [{ type: 'text', text: 'C04 fictional reply.' }] } }, { surfaceOp: 'append' });
        if (['continued', 'open'].includes(kind)) {
          session.append('request/header', { reason:'initial', header:{config:{provider:'test',model:'fixture'},tools:[{name:'ask_user_question',description:'C04 fictional question',parameters:{type:'object',properties:{timeout:{type:'integer'}}}}]} });
          const questionArgs = JSON.stringify({timeout:1,questions:[{id:'c04-q',question:`C04 ${kind}?`,options:[{label:'Yes'}]}]});
          session.append('assistant/message',{turn:1,step:1,stream:[],message:{role:'assistant',id:`c04-call-message-${kind}`,source:{kind:'model',provider:'test',model:'fixture'},content:[{type:'tool-call',id:`c04-${kind}-call`,name:'ask_user_question',arguments:questionArgs}]}},{surfaceOp:'append'});
          session.append('tool/call', { turn: 1, step: 1, callId: `c04-${kind}-call`, name: 'ask_user_question', arguments: JSON.stringify({ timeout: 1, questions: [{ id: 'c04-q', question: `C04 ${kind}?`, options: [{ label: 'Yes' }] }] }) });
          if (kind === 'continued') session.append('tool/result', { turn: 1, step: 1, message: { role: 'tool', source: {kind:'tool',callId:'c04-continued-call'}, isError:false, id: 'c04-pending-result', toolCallId: 'c04-continued-call', content: [{ type: 'text', text: '{"pending":true,"callId":"c04-continued-call"}' }] } }, { surfaceOp: 'append' });
        }
        if (kind === 'approval') session.append('approval/asked', { id: 'c04-approval-id', toolName: 'fictional', reason: 'C04 approval' });
        if (!['open', 'approval'].includes(kind)) session.append('step/end', {turn:1,step:1});
        if (!['open', 'approval'].includes(kind)) session.append('turn/end', { turn: 1, reason: { kind: kind === 'error' || kind === 'blocked' ? kind : 'completed' } });
        await ctx.sessions.flush(session);
        projections[kind] = ctx.sessionProjections.snapshot(session, ['userQuestions']).values.userQuestions;
      }

 writeFileSync(marker, JSON.stringify({ok:true,ids,projections}));
 })().catch(error => writeFileSync(marker, JSON.stringify({ok:false,error:String(error),stack:error.stack})));
}
