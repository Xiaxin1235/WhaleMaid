// SPDX-License-Identifier: AGPL-3.0-or-later
/** Explicitly installed, model-free isolated host fixture; trigger only after native tracing attaches. */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const name = 'coopanion-error-expression-fixture';
export const inject = ['sessions', 'sessionController'];
export function apply(ctx) {
  const root = process.env.DSH_HOME, done = join(root, 'c05-error.json');
  if (existsSync(done)) return;
  let active = true; ctx.effect(() => () => { active = false; });
  void (async () => {
    const { sessionId } = await ctx.sessionController.create({ sessionId: 'c05-error-expression', cwd: root });
    const session = ctx.sessions.get(sessionId);
    session.append('user/message', { role: 'user', id: 'c05-user', content: [{ type: 'text', text: 'C05 fictional error expression' }], source: { kind: 'user' } }, { surfaceOp: 'append' });
    writeFileSync(join(root, 'c05-ready.json'), JSON.stringify({ sessionId }));
    while (active && !existsSync(join(root, 'c05-trigger'))) await new Promise(resolve => setTimeout(resolve, 200));
    if (!active) return;
    session.append('turn/start', { turn: 1 });
    session.append('step/start', { turn: 1, step: 1 });
    session.append('step/end', { turn: 1, step: 1 });
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'C05 fictional failure' } } });
    await ctx.sessions.flush(session);
    writeFileSync(done, JSON.stringify({ sessionId, events: session.snapshotEvents().map(({ type, seq }) => ({ type, seq })) }));
  })().catch(error => writeFileSync(done, JSON.stringify({ error: String(error) })));
}
