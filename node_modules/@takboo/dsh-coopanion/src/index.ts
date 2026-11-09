import { randomUUID } from 'node:crypto';
import type { Context, Volatile } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-settings';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-user-approval';
import type {} from '@deepseek-ai/dsh-user-questions';
import type {} from '@deepseek-ai/dsh-api-session-controller';
import type {} from '@deepseek-ai/dsh-session-projection';
import { SessionId, type Session } from '@deepseek-ai/dsh-session';
import { NotificationBroker, type NotificationEvent } from './notification-broker.ts';
import { notificationPreferencesSchema, notificationEndpoints, notificationRequests, noticeId, interactionId } from './notification-contract.ts';
import { InboxQuestions } from './inbox-questions.ts';
import { ApprovalCards } from './approval-cards.ts';
import { approvalAnswer } from '../web/approval-contract.js';
import { ChatSubmission } from './chat.ts';
import { archivedSessionIds } from './archive.ts';
import z from '@deepseek-ai/schemastery';
import { ElectronBridge, isRecord, type PetBridge, type DesktopOptions } from './bridge.ts';
import { PetModel } from './model.ts';
import { ReactionDecider } from './reaction-decider.ts';
import { PetControls } from './controls.ts';
import { z as wire } from 'zod';
import { petLanguage, petCopy } from '../web/locale.js';
import { DEFAULT_TEXT_SCALE, TEXT_SCALES, type TextScale } from '../web/text-scale.js';
import { COMPANIONSHIP_MODES, type CompanionshipMode } from '../web/companionship.js';

export const name = 'dsh-coopanion';
export const inject = ['agents'];
export interface Config {
  size: Volatile<number>; npcHome: Volatile<number>; npcRange: Volatile<number>; interfaceStyle: Volatile<'new' | 'classic'>; textScale: Volatile<TextScale>; aboveFullscreen: Volatile<boolean>; preferOpeningParagraph: Volatile<boolean>; inlineQuestions: Volatile<boolean>; roam: Volatile<boolean>; diagnostics: Volatile<boolean>; companionship: Volatile<CompanionshipMode>; notifications: Volatile<boolean>;
  quietMode: Volatile<boolean>; systemNotifications: Volatile<boolean>; reminders: Volatile<boolean>; reminderDelayMs: Volatile<number>;
  decisionsReactions: Volatile<boolean>;
  inlineApprovals: Volatile<boolean>;
  decisionsProvider: Volatile<'openai' | 'openrouter'>;
  bubbleDurationMs: Volatile<number>; autoStart: Volatile<boolean>; electronPath?: string; defaultChatTarget: Volatile<'companion' | 'last'>;
}
export const Config = z.object({
  size: z.number().min(90).max(240).default(180).volatile(),
  interfaceStyle: z.union([z.const('new'), z.const('classic')]).default('new').volatile(),
  defaultChatTarget: z.union([z.const('companion'), z.const('last')]).default('companion').volatile(),
  textScale: z.union(TEXT_SCALES.map(value => z.const(value))).default(DEFAULT_TEXT_SCALE).volatile(),
  aboveFullscreen: z.boolean().default(true).volatile(),
  preferOpeningParagraph: z.boolean().default(true).volatile(),
  inlineQuestions: z.boolean().default(true).volatile(),
  inlineApprovals: z.boolean().default(true).volatile(),
  roam: z.boolean().default(true).volatile(),
  diagnostics: z.boolean().default(false).volatile(),
  npcHome: z.number().min(.05).max(.95).step(.01).default(.85).volatile(),
  npcRange: z.number().min(.1).max(.6).step(.01).default(.3).volatile(),
  companionship: z.union(COMPANIONSHIP_MODES.map(value => z.const(value))).default('off').volatile(),
  notifications: z.boolean().default(true).volatile(),
  quietMode: z.boolean().default(false).volatile(),
  decisionsReactions: z.boolean().default(false).volatile(),
  decisionsProvider: z.union([z.const('openai'), z.const('openrouter')]).default('openai').volatile(),
  systemNotifications: z.boolean().default(false).volatile(),
  reminders: z.boolean().default(true).volatile(),
  reminderDelayMs: z.number().step(1).min(60000).max(86400000).default(600000).volatile(),
  bubbleDurationMs: z.number().min(2000).max(60000).default(12000).volatile(),
  autoStart: z.boolean().default(true).volatile(),
  electronPath: z.string(),
});

/** Mounts the pet on public Harness events, delegates approvals, and routes explicit user chat through the public Session Controller. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
  await mountPet(ctx, config, new ElectronBridge());
}

/** Shared assembly used by integration tests with an IPC substitute for the native window. */
export async function mountPet(ctx: Context, options: Config, bridge: PetBridge): Promise<void> {
  const model = new PetModel();
  const chat = new ChatSubmission(ctx);
  const chatLifetime = new AbortController();
  let controls: PetControls | undefined;
  const reactions = new ReactionDecider({
    enabled: () => currentOptions().decisionsReactions === true,
    provider: () => options.decisionsProvider.get(),
    credentials: () => ctx.get('credentials') as CredentialProvider | undefined,
    send: value => bridge.reaction?.(value),
    log: message => ctx.logger.info(message),
    changed: () => controls?.configure(),
  });
  ctx.effect(() => () => reactions.dispose());
  ctx.effect(() => () => chatLifetime.abort());
  ctx.on('credentials/reference-updated', ref => {
    if (ref === 'OPENAI_API_KEY' || ref === 'OPENROUTER_API_KEY') {
      void reactions.refreshStatus();
      controls?.configure();
    }
  });
  const preferences: Partial<Pick<DesktopOptions, 'roam' | 'notifications' | 'quietMode' | 'decisionsReactions' | 'companionship' | 'interfaceStyle' | 'defaultChatTarget'>> = {};
  let savePreference: ((field: 'roam' | 'notifications' | 'quietMode' | 'decisionsReactions' | 'companionship' | 'interfaceStyle' | 'defaultChatTarget', value: boolean | CompanionshipMode | 'new' | 'classic' | 'companion' | 'last') => Promise<void>) | undefined;
  ctx.inject(['settings'], child => { savePreference = (field, value) => child.settings.mutate('dsh-coopanion', [{ op: 'set', path: [field], value }]); });
  const currentOptions = (): DesktopOptions => ({ interfaceStyle: options.interfaceStyle.get(), defaultChatTarget: options.defaultChatTarget.get(), size: options.size.get(), npcHome: options.npcHome.get(), npcRange: options.npcRange.get(), textScale: options.textScale.get(), aboveFullscreen: options.aboveFullscreen.get(), preferOpeningParagraph: options.preferOpeningParagraph.get(), inlineQuestions: options.inlineQuestions.get(), roam: options.roam.get(), diagnostics: options.diagnostics.get(), companionship: options.companionship.get(), notifications: options.notifications.get(), quietMode: options.quietMode.get(), decisionsReactions: options.decisionsReactions.get(), decisionsProvider: options.decisionsProvider.get(), reactionStatus: reactions.status(), bubbleDurationMs: options.bubbleDurationMs.get(), systemNotifications: options.systemNotifications.get(), reminders: options.reminders.get(), reminderDelayMs: options.reminderDelayMs.get(), electronPath: options.electronPath, locale, ...preferences });
  controls = new PetControls(bridge, currentOptions);
  let locale: string | undefined;
  let clientLocale: string | undefined;
  let dedicatedLocale = false;
  let storedLocale: (() => string | undefined) | undefined;
  const syncLocale = () => {
    const preference = storedLocale?.();
    const next = preference ? petLanguage(preference) : clientLocale;
    if (next === locale) return;
    locale = next; controls.configure();
  };
  const adoptClientLocale = (value: string) => { clientLocale = petLanguage(value); syncLocale(); };
  ctx.inject(['settings'], child => {
    const read = () => {
      const value = child.settings.describe({ redactSecrets: true }).find(entry => entry.ns === 'locale')?.value;
      const preference = isRecord(value) && typeof value.preference === 'string' ? value.preference.toLowerCase() : undefined;
      // Only the Client knows additional registered languages and its resolved
      // browser fallback. Bootstrap from the two built-in durable choices.
      return preference === 'zh' || preference === 'en' ? preference : undefined;
    };
    storedLocale = read;
    child.effect(() => () => { if (storedLocale === read) storedLocale = undefined; });
    syncLocale();
  });
  let navigation: { sessionId: string; expires: number } | undefined;
  ctx.provide('coopanion', controls);
  const update = () => {
    // The bridge caches Host truth across native generations. Recovery only
    // rehydrates this view; it must not restore sessions or submit chat again.
    const snapshot = model.snapshot();
    const available = !!ctx.get('sessionController') && !!ctx.get('sessionQuery');
    bridge.update({ ...snapshot, sessions: snapshot.sessions.map(session => ({ ...session, chatAvailable: available })) });
    reactions.observe(snapshot);
  };
  let mounted = false;
  const notificationPrefs = () => notificationPreferencesSchema.parse({ notifications: currentOptions().notifications, quietMode: currentOptions().quietMode, systemNotifications: options.systemNotifications.get(), reminders: options.reminders.get(), reminderDelayMs: options.reminderDelayMs.get() });
  const syncNotifications = () => {
    if (!mounted) return;
    const snapshot = approvalCards.snapshot(inboxAnswers.snapshot(broker.snapshot())); model.interactions(snapshot.interactions); bridge.notificationState?.(snapshot); update();
  };
  const broker = new NotificationBroker({
    changed: syncNotifications, presentRole: (value, runtime) => bridge.presentRole?.(value, runtime) ?? false,
    sessionLabel: id => {
      const session = model.snapshot().sessions.find(item => item.id === id), copy = petCopy(currentOptions().locale);
      return session?.companionRole === 'current' ? String(copy.companionName) : session?.companionRole === 'earlier' ? String(copy.earlierCompanion) : session?.label;
    },
  });
  const inboxAnswers = new InboxQuestions(ctx, () => options.inlineQuestions.get(), () => broker.snapshot(), syncNotifications);
  const approvalCards = new ApprovalCards(() => options.inlineApprovals?.get() !== false, () => broker.snapshot(), syncNotifications);
  ctx.effect(() => { const timer = setInterval(() => approvalCards.expire(), 1000); timer.unref(); return () => { clearInterval(timer); approvalCards.dispose(); }; });
  ctx.effect(() => () => inboxAnswers.dispose());
  broker.preferences(notificationPrefs());
  ctx.effect(() => () => broker.dispose());
  ctx.effect(() => controls.onState(state => broker.runtime(state)));
  let questions: ((session: Session, live?: boolean) => void) | undefined;
  ctx.inject(['sessionProjections', 'userQuestions'], child => {
    const sync = (session: Session, live = true) => {
      try {
        const view = child.sessionProjections.snapshot(session, ['userQuestions']).values.userQuestions;
        if (view) broker.questions(session, view, live);
      } catch (error) { child.logger.warn(`Question projection unavailable: ${String(error).slice(0, 300)}`); }
    };
    questions = sync;
    child.effect(() => () => { if (questions === sync) questions = undefined; });
    // A service is provided before its constructor registers projection units.
    // Fold after that registration turn, including sessions without a live agent.
    queueMicrotask(() => {
      if (!mounted || questions !== sync) return;
      for (const session of child.get('sessions')?.list() ?? ctx.agents.list().map(agent => agent.session)) sync(session, false);
    });
  });
  let testSource: (() => Promise<Session>) | undefined;
  ctx.inject(['sessions', 'sessionController'], child => {
    let source: Promise<Session> | undefined;
    const create = () => source ??= child.sessionController.create({ sessionId: SessionId(`coopanion-notification-test-${randomUUID()}`), cwd: process.cwd() }).then(value => {
      const session = child.sessions.get(value.sessionId); if (!session) throw new Error('Notification test source unavailable'); return session;
    }).catch(error => { source = undefined; throw error; });
    testSource = create; child.effect(() => () => { if (testSource === create) testSource = undefined; });
  });
  let streamUpdate: ReturnType<typeof setTimeout> | undefined;
  ctx.effect(() => () => clearTimeout(streamUpdate));
  ctx.effect(() => () => controls.dispose());
  ctx.effect(() => {
    const timer = setInterval(() => { if (model.settle()) update(); }, 250);
    timer.unref(); return () => clearInterval(timer);
  });
  // The workspace registry exposes the archive set without a change event; poll the in-memory getter.
  ctx.effect(() => {
    const sync = () => { if (model.archives(archivedSessionIds(ctx))) update(); };
    sync();
    const timer = setInterval(sync, 2000);
    timer.unref(); return () => clearInterval(timer);
  });
  ctx.on('settings/document-updated', ns => { if (ns === 'dsh-coopanion') { controls.configure(); broker.preferences(notificationPrefs()); syncNotifications(); } else if (ns === 'locale') syncLocale(); });
  ctx.inject(['connection'], child => {
    const dispatch = async (endpoint: string, payload: unknown, signal: AbortSignal) => {
      try {
        if (signal.aborted) throw new Error('请求已取消');
        if (endpoint === 'locale') {
          const input = wire.object({ locale: wire.enum(['zh', 'en']) }).strict().parse(payload);
          dedicatedLocale = true;
          adoptClientLocale(input.locale); return { ok: true, value: { locale } };
        }
        if (endpoint === 'status') {
          wire.object({}).strict().parse(payload);
          return { ok: true, value: { ...controls.status(), reactionStatus: reactions.status() } };
        }
        if (endpoint === 'navigation') {
          wire.object({}).strict().parse(payload);
          const value = navigation && navigation.expires > Date.now() ? { sessionId: navigation.sessionId } : null;
          navigation = undefined;
          return { ok: true, value };
        }
        if (endpoint === 'approval-cards') return { ok: true, value: approvalCards.poll(payload) };
        if (endpoint === 'notification-state') { const input = notificationRequests.state.parse(payload); if (input.locale && !dedicatedLocale) adoptClientLocale(input.locale); return { ok: true, value: approvalCards.snapshot(inboxAnswers.snapshot(broker.snapshot())) }; }
        if (endpoint === 'notification-claim') { const input = notificationRequests.claim.parse(payload); return { ok: true, value: broker.claim(input.clientId, input.generation) }; }
        if (endpoint === 'notification-receipt') { return { ok: true, value: { accepted: broker.receipt(notificationRequests.receipt.parse(payload)) } }; }
        if (endpoint === 'notification-snooze') { const input = notificationRequests.snooze.parse(payload); if (!broker.snooze(input.interactionId, input.generation)) throw new Error('待处理请求已变化或提醒暂不可用'); return { ok: true, value: { accepted: true } }; }
        if (endpoint === 'notification-test') {
          const input = notificationRequests.test.parse(payload), state = broker.snapshot().runtime, prefs = notificationPrefs();
          if (!testSource || state.phase !== 'running' || state.visible || state.suspended || state.visibilityRevision === 0 || input.generation !== state.generation || !prefs.notifications || prefs.quietMode || !prefs.systemNotifications) throw new Error('请启动并隐藏角色，开启系统通知后测试');
          const session = await testSource();
          if (signal.aborted) throw new Error('请求已取消');
          const latest = broker.snapshot().runtime;
          if (latest.generation !== state.generation || latest.visibilityRevision !== state.visibilityRevision || latest.phase !== 'running' || latest.visible || latest.suspended || notificationPrefs().quietMode) throw new Error('桌宠状态已变化');
          const turn = (session.snapshotEvents().findLast(event => event.type === 'turn/start')?.data as { turn?: number } | undefined)?.turn ?? 0;
          session.append('turn/start', { turn: turn + 1 });
          session.append('turn/end', { turn: turn + 1, reason: { kind: 'completed' } });
          const event = session.snapshotEvents().at(-1)!;
          const claim = broker.claim(input.clientId, input.generation, noticeId(session.id, turn + 1, event.seq, 'reply', 'initial'));
          if (!claim) throw new Error('测试通知未能领取，请稍后重试');
          return { ok: true, value: claim };
        }
        if (endpoint === 'reaction-key-status') {
          wire.object({}).strict().parse(payload);
          return { ok: true, value: await reactions.getCredentialStatus() };
        }
        if (endpoint === 'reaction-key-set') {
          const input = wire.object({
            provider: wire.enum(['openai', 'openrouter']),
            value: wire.string(),
          }).strict().parse(payload);
          const value = await reactions.setKey(input.provider, input.value);
          controls.configure();
          return { ok: true, value };
        }
        if (endpoint === 'reaction-key-clear') {
          const input = wire.object({
            provider: wire.enum(['openai', 'openrouter']),
          }).strict().parse(payload);
          const value = await reactions.clearKey(input.provider);
          controls.configure();
          return { ok: true, value };
        }
        if (endpoint !== 'control') throw new Error('未知的桌宠操作');
        const { command } = wire.object({ command: wire.enum(['start', 'show', 'hide', 'restart', 'stop', 'characters']) }).strict().parse(payload);
        return { ok: true, value: await controls.command(command) };
      } catch (error) { return { ok: false, error: { code: 'coopanion/rejected', message: String(error instanceof Error ? error.message : error).slice(0, 600), details: {} } }; }
    };
    // Exact Connection routes coexist with the Gateway's exclusive /api interceptor.
    // The Connection carrier applies its normal Host/Origin and authentication checks.
    const reactionEndpoints = ['reaction-key-status', 'reaction-key-set', 'reaction-key-clear'] as const;
    for (const endpoint of ['status', 'control', 'navigation', 'locale', 'approval-cards', ...reactionEndpoints, ...notificationEndpoints] as const) {
      child.effect(() => child.connection.fetch.register({
        path: `/api/coopanion/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
        fetch: async request => {
          const parsed = wire.object({ type: wire.literal('client-request'), rpcId: wire.string().min(1).max(128), method: wire.literal(`coopanion/${endpoint}`), payload: wire.unknown() }).strict().safeParse(await request.json().catch(() => undefined));
          if (!parsed.success) return Response.json({ error: 'Invalid desktop pet request' }, { status: 400 });
          return Response.json({ type: 'server-response', rpcId: parsed.data.rpcId, result: await dispatch(endpoint, parsed.data.payload, request.signal) });
        },
      }));
    }
  });
  const restoreSession = (session: Session, running = ctx.agents.list().some(agent => agent.session.id === session.id && agent.status === 'running')) => {
    model.restore(session);
    // A stored open turn is history, not evidence of an Agent running in this Host.
    if (running) model.running(session); else model.idle(session.id);
    broker.restore(session); questions?.(session, false);
  };
  ctx.inject(['sessions'], child => { for (const session of child.sessions.list()) restoreSession(session); syncNotifications(); update(); });
  for (const agent of ctx.agents.list()) restoreSession(agent.session, agent.status === 'running');
  ctx.inject(['sessionController', 'sessionQuery'], child => {
    const lifetime = new AbortController(); child.effect(() => () => lifetime.abort());
    void (async () => {
      const { items } = await child.sessionController.list({}, lifetime.signal);
      for (const item of items.filter(item => item.origin !== 'subagent').slice(0, 100)) {
        if (lifetime.signal.aborted) return;
        const observed = await child.sessionQuery.observeSession(item.sessionId, { signal: lifetime.signal });
        try {
          // A live event may arrive while the read is pending; restore is seq-aware.
          const source = { id: observed.header.id, header: observed.header, snapshotEvents: () => observed.events };
          model.restore(source); broker.restore(source, observed.projections?.values.userQuestions);
          if (!ctx.agents.list().some(agent => agent.session.id === item.sessionId && agent.status === 'running')) model.idle(item.sessionId);
        } finally { observed[Symbol.dispose](); }
      }
      syncNotifications(); update();
    })().catch(error => { if (!lifetime.signal.aborted) child.logger.warn(`Desktop pet history unavailable: ${String(error).slice(0, 300)}`); });
    update();
  });
  ctx.on('session/created', session => { restoreSession(session); syncNotifications(); update(); });
  ctx.on('agent/created', ({ agent }) => { restoreSession(agent.session, agent.status === 'running'); syncNotifications(); update(); return undefined; });
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'running') model.running(agent.session); else model.idle(agent.session.id); update(); });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (!model.stream(agent.session, frame) || streamUpdate) return;
    // Coalesce high-frequency provider deltas; durable events still publish immediately.
    streamUpdate = setTimeout(() => { streamUpdate = undefined; update(); }, 40);
  });
  ctx.on('agent/disposed', ({ agent }) => { model.idle(agent.session.id); model.detached(agent.session.id); update(); });
  ctx.on('session/event', (session, event) => { broker.consume(session, event); model.consume(session, event); questions?.(session); syncNotifications(); update(); });
  ctx.on('session/disposed', session => { broker.remove(session.id); model.idle(session.id); model.detached(session.id); update(); });
  ctx.inject(['userQuestions'], child => {
    child.on('user-questions/request', async (request, next) => {
      const session = request.agent?.session;
      if (!session || session.header.origin === 'subagent') return next();
      model.observe(session);
      const events: readonly NotificationEvent[] = session.snapshotEvents();
      const callId = request.wait?.callId;
      const origin = callId ? events.findLast(event => (event.type === 'tool/call' && event.data.callId === callId) || (event.type === 'tool/ptc-dispatch' && event.data.subCallId === callId)) : undefined;
      const anchor = origin ?? events.at(-1);
      const turnEvent = events.findLast(event => event.type === 'turn/start');
      const nativeId = origin && callId ? callId : randomUUID();
      const finish = broker.question(session, { nativeId, turn: turnEvent?.type === 'turn/start' ? turnEvent.data.turn : 0, seq: anchor?.seq ?? 0, preview: request.questions.map(q => q.question).join('\n'), signal: request.signal, source: origin ? 'event' : 'runtime' });
      questions?.(session); syncNotifications();
      try { return await inboxAnswers.track(interactionId(session.id, 'question', nativeId), request, next); }
      finally { questions?.(session); finish(); syncNotifications(); }
    }, { prepend: true });
  });
  const onAction = (action: unknown) => {
    if (!isRecord(action)) return;
    if (action.type === 'approval-answer') {
      const input = approvalAnswer(action); if (!input) return;
      void approvalCards.submit(input).then(receipt => { if (receipt) bridge.approvalResult?.(receipt); syncNotifications(); });
      return;
    }
    if (action.type === 'question-answer') {
      const receipt = inboxAnswers.submit(action);
      if (receipt) bridge.questionResult?.(receipt);
      syncNotifications(); return;
    }
    if (action.type === 'notification-snooze') {
      const input = notificationRequests.snooze.safeParse({ interactionId: action.interactionId, generation: action.generation });
      const ok = input.success && broker.snooze(input.data.interactionId, input.data.generation);
      if (typeof action.interactionId === 'string') bridge.snoozeResult?.(action.interactionId, ok, ok ? undefined : '待处理请求已变化或提醒暂不可用');
      syncNotifications(); return;
    }
    if (action.type === 'preference' && ((action.field === 'roam' || action.field === 'notifications' || action.field === 'quietMode' || action.field === 'decisionsReactions') && typeof action.value === 'boolean' || action.field === 'companionship' && COMPANIONSHIP_MODES.includes(action.value as CompanionshipMode) || action.field === 'interfaceStyle' && ['new', 'classic'].includes(action.value as string) || action.field === 'defaultChatTarget' && ['companion', 'last'].includes(action.value as string))) {
      const field = action.field as 'roam' | 'notifications' | 'quietMode' | 'decisionsReactions' | 'companionship' | 'interfaceStyle' | 'defaultChatTarget', value = action.value as boolean | CompanionshipMode | 'new' | 'classic' | 'companion' | 'last';
      void (async () => {
        try {
          if (savePreference) await savePreference(field, value); else Object.assign(preferences, { [field]: value });
          // Apply presentation policy before a broker refresh sends any snapshot.
          controls.configure(); broker.preferences(notificationPrefs());
        } catch { bridge.notify({ title: '设置未能保存', body: '请回到 Harness 检查插件设置。', sessionId: model.snapshot().sessionId ?? '' }); }
      })(); return;
    }
    if (action.type === 'select' && typeof action.sessionId === 'string') { model.select(action.sessionId); update(); return; }
    if (action.type === 'read' && typeof action.resultId === 'string') { if (model.read(action.resultId)) update(); return; }
    if (action.type === 'open-session' && typeof action.sessionId === 'string') {
      if (!model.select(action.sessionId)) return;
      navigation = { sessionId: action.sessionId, expires: Date.now() + 30000 };
      bridge.focusHarness?.(); update(); return;
    }
    if (action.type !== 'chat') return;
    void chat.submit(action, chatLifetime.signal).then(receipt => { if (receipt) bridge.chatResult?.(receipt); update(); });
  };
  ctx.effect(() => { bridge.onAction(onAction); return () => bridge.removeAction(onAction); });
  if (bridge instanceof ElectronBridge) {
    const onFailure = (error: Error) => ctx.logger.warn(error.message);
    ctx.effect(() => { bridge.on('failure', onFailure); return () => bridge.off('failure', onFailure); });
  }
  mounted = true; syncNotifications(); update();
  if (options.autoStart.get()) {
    void controls.command('start').then(status => { if (status.error) ctx.logger.warn(status.error); }, error => ctx.logger.warn(String(error).slice(0, 600)));
  }
}

declare module '@deepseek-ai/cordis' { interface Context { coopanion: PetControls; } }
