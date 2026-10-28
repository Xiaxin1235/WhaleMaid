import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Switch, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { COMPANIONSHIP_MODES, type CompanionshipMode } from '../../web/companionship.js';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { PetCommand, PetStatus } from '../controls.ts';
import type { NotificationSettings, NotificationClientStatus } from './notification-client.ts';
import { TEXT_SCALES, textScale, type TextScale } from '../../web/text-scale.js';

export interface Preferences { inlineApprovals?: boolean; decisionsProvider?: 'openai' | 'openrouter'; decisionsReactions?: boolean; size: number; npcHome: number; npcRange: number; textScale: TextScale; aboveFullscreen: boolean; preferOpeningParagraph: boolean; inlineQuestions: boolean; roam: boolean; diagnostics: boolean; companionship: CompanionshipMode; notifications: boolean; quietMode: boolean; systemNotifications: boolean; reminders: boolean; reminderDelayMs: number; bubbleDurationMs: number; autoStart: boolean; defaultChatTarget?: 'companion' | 'last'; }
import { reactionKeyView, type ReactionKeyInfo } from './reaction-key-view.ts';
export type { ReactionKeyInfo } from './reaction-key-view.ts';
export type ReactionKeyStatus = Record<'openai' | 'openrouter', ReactionKeyInfo>;
export interface SettingsFace {
  form: ConfigForm<Preferences>;
  call: (command?: PetCommand, signal?: AbortSignal) => Promise<PetStatus>;
  local: boolean;
  notifier?: NotificationSettings;
  getKeyStatus?: (signal?: AbortSignal) => Promise<ReactionKeyStatus>;
  setKey?: (provider: 'openai' | 'openrouter', value: string, signal?: AbortSignal) => Promise<ReactionKeyStatus>;
  clearKey?: (provider: 'openai' | 'openrouter', signal?: AbortSignal) => Promise<ReactionKeyStatus>;
}
export type SettingsProps = SettingsFace & PropsLocale<'coopanion'>;

function NumberPreference({ value, min, max, label, hint, invalidHint, id, disabled, save }: {
  value: number; min: number; max: number; label: string; hint: string; invalidHint: string; id: string; disabled: boolean; save: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const number = Number(draft);
  const invalid = !draft.trim() || !Number.isFinite(number) || number < min || number > max;
  return <div className="pet-row">
    <div className="pet-label"><label htmlFor={id}>{label}</label><p id={`${id}-hint`}>{hint}</p>{invalid ? <p className="pet-error" id={`${id}-error`}>{invalidHint}</p> : null}</div>
    <Input className="pet-number" id={id} type="number" min={min} max={max} step={1} value={draft} disabled={disabled}
      aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`} aria-invalid={invalid} onChange={event => setDraft(event.target.value)}
      onBlur={() => { if (!invalid && number !== value) save(number); }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
  </div>;
}

const disconnected: NotificationClientStatus = { web: { supported: false, permission: 'unavailable', osAuthorization: 'unknown' }, connected: false };
const noSubscribe = () => () => {};

export function Settings({ form, call, local, notifier, getKeyStatus, setKey, clearKey, t }: SettingsProps) {
  const notification = useSyncExternalStore(notifier?.subscribe ?? noSubscribe, notifier?.getSnapshot ?? (() => disconnected));
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const accepted = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot());
  const [status, setStatus] = useState<PetStatus>();
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'refused'>();
  const [saveFailure, setSaveFailure] = useState('');
  const [keyStatuses, setKeyStatuses] = useState<ReactionKeyStatus>();
  const [keyDraft, setKeyDraft] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keyFeedback, setKeyFeedback] = useState<'saved' | 'cleared'>();
  useEffect(() => {
    if (!local) return;
    let active = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const value = await call(undefined, abort.signal);
        if (active) { setStatus(value); setFailure(''); }
        if (active && getKeyStatus) {
          const keys = await getKeyStatus(abort.signal).catch(() => undefined);
          if (active && keys) setKeyStatuses(keys);
        }
      } catch (error) { if (active) setFailure(String(error instanceof Error ? error.message : error)); }
      finally { if (active) timer = setTimeout(() => void refresh(), 1500); }
    };
    void refresh();
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, [call, getKeyStatus, local]);
  const command = async (value: PetCommand) => {
    if (busy && value !== 'stop') return;
    setBusy(true); setFailure('');
    try { setStatus(await call(value)); }
    catch (error) { setFailure(String(error instanceof Error ? error.message : error)); }
    finally { setBusy(false); }
  };
  const save = async (field: keyof Preferences, value: number | boolean | CompanionshipMode | 'companion' | 'last' | 'openai' | 'openrouter') => {
    setSaving(true); setFeedback(undefined); setSaveFailure('');
    try { setFeedback(await form.set(field, value) ? 'saved' : 'refused'); }
    catch (error) { setSaveFailure(String(error instanceof Error ? error.message : error)); }
    finally { setSaving(false); }
  };
  const permission = async () => {
    if (!notifier || notificationBusy) return;
    setNotificationBusy(true); setNotificationError('');
    try { await notifier.requestPermission(); }
    catch (error) { setNotificationError(String(error instanceof Error ? error.message : error)); }
    finally { setNotificationBusy(false); }
  };
  const enableSystem = async (enabled: boolean) => {
    // Start the permission request in the actual toggle gesture before async persistence.
    if (enabled) await permission();
    await save('systemNotifications', enabled);
  };
  const testNotification = async () => {
    if (!notifier || notificationBusy) return;
    setNotificationBusy(true); setNotificationError('');
    try { await notifier.test(); }
    catch (error) { setNotificationError(String(error instanceof Error ? error.message : error)); }
    finally { setNotificationBusy(false); }
  };
  const ready = accepted.status === 'ready' && accepted.writable && !saving;
  const prefs = accepted.value;
  const reactionProvider = prefs?.decisionsProvider ?? 'openai';
  const running = status?.phase === 'running';
  const disabled = !local || busy || status?.phase === 'starting' || status?.phase === 'stopping';
  const statusText = !status ? t('loading') : status.phase === 'running' ? t(status.visible ? 'running' : 'hidden') : t(status.phase);

  useEffect(() => {
    setKeyDraft('');
    setKeyError('');
    setKeyFeedback(undefined);
  }, [reactionProvider]);

  const handleSaveKey = async () => {
    if (!setKey || keyBusy || !keyDraft.trim()) return;
    setKeyBusy(true); setKeyError(''); setKeyFeedback(undefined);
    try {
      const res = await setKey(reactionProvider, keyDraft.trim());
      setKeyStatuses(res);
      setKeyDraft('');
      setKeyFeedback('saved');
    } catch (error) {
      setKeyError(String(error instanceof Error ? error.message : error));
    } finally {
      setKeyBusy(false);
    }
  };

  const handleClearKey = async () => {
    if (!clearKey || keyBusy) return;
    setKeyBusy(true); setKeyError(''); setKeyFeedback(undefined);
    try {
      const res = await clearKey(reactionProvider);
      setKeyStatuses(res);
      setKeyDraft('');
      setKeyFeedback('cleared');
    } catch (error) {
      setKeyError(String(error instanceof Error ? error.message : error));
    } finally {
      setKeyBusy(false);
    }
  };

  const currentKeyInfo = keyStatuses?.[reactionProvider] ?? (
    status?.reactionStatus?.provider === reactionProvider
      ? {
          configured: status.reactionStatus.keyAvailable,
          source: status.reactionStatus.source,
          writable: status.reactionStatus.writable ?? (status.reactionStatus.source !== 'env'),
        }
      : undefined
  );
  const keyView = reactionKeyView(currentKeyInfo);
  const isConfigured = !!currentKeyInfo?.configured;
  const keyReadOnly = !currentKeyInfo?.writable;
  const keyStatusText = t(({ loading: 'loading', missing: 'reactionKeyNotConfigured', harness: 'reactionKeyConfiguredHarness', env: 'reactionKeyConfiguredEnv', 'env-file': 'reactionKeyConfiguredEnvFile' } as const)[keyView]);
  return <div className="dsh-coopanion-settings" data-testid="coopanion-settings">
    <h2>{t('title')}</h2><p>{t('intro')} {t('languageHint')}</p>
    <section className="pet-card" aria-label={t('runtime')}>
      <div className="pet-row"><h3>{t('runtime')}</h3><span className="pet-status" role="status" data-testid="pet-status"><StateDot state={status?.phase === 'error' ? 'error' : running ? 'done' : status?.phase === 'starting' || status?.phase === 'stopping' ? 'ongoing' : 'idle'} />{statusText}</span></div>
      <p>{t('runtimeHint')}</p>
      <div className="pet-actions">
        <Button variant="outline" disabled={disabled} onClick={() => void command(running ? 'show' : 'start')}>{t(running ? 'show' : 'start')}</Button>
        <Button variant="outline" disabled={disabled || !running} onClick={() => void command('hide')}>{t('hide')}</Button>
        <Button variant="outline" disabled={disabled} onClick={() => void command('restart')}>{t('restart')}</Button>
        <Button disabled={!local || status?.phase === 'stopped' || status?.phase === 'stopping'} onClick={() => void command('stop')}>{t('stop')}</Button>
      </div>
      {status?.recoveryAttempt ? <p role="status">{t('recoveryHint')}: {status.recoveryAttempt} / 3</p> : null}
      {failure || status?.error ? <p className="pet-error" role="alert">{failure || status?.error}</p> : null}
    </section>
    <section className="pet-card" aria-label={t('reactionSettings')}>
      <h3>{t('reactionSettings')}</h3>
      <div className="pet-row"><div className="pet-label"><strong>{t('decisionsReactions')}</strong><p>{t('decisionsReactionsHint')}</p></div>
        <Switch checked={prefs?.decisionsReactions ?? false} disabled={!ready || !local} label={t('decisionsReactions')} onChange={value => void save('decisionsReactions', value)} />
      </div>
      <div className="pet-row"><div className="pet-label"><label htmlFor="coopanion-decisions-provider">{t('decisionsProvider')}</label><p id="coopanion-decisions-provider-hint">{t(reactionProvider === 'openai' ? 'reactionKeyHintOpenai' : 'reactionKeyHintOpenrouter')}</p></div>
        <select id="coopanion-decisions-provider" className="pet-number pet-provider" aria-describedby="coopanion-decisions-provider-hint" value={reactionProvider} disabled={!ready || !local} onChange={event => void save('decisionsProvider', event.target.value as 'openai' | 'openrouter')}>
          <option value="openai">{t('reactionProviderOpenai')}</option><option value="openrouter">{t('reactionProviderOpenrouter')}</option>
        </select>
      </div>
      <div className="pet-row">
        <div className="pet-label">
          <strong>{t('reactionKeyStatusLabel')}</strong>
          <p>{t('reactionKeyStorageHint')}</p>
        </div>
        <span className="pet-status pet-key-status" role="status" data-testid="reaction-key-status">
          <StateDot state={isConfigured ? 'done' : 'idle'} />
          {keyStatusText}
        </span>
      </div>
      <div className="pet-row">
        <div className="pet-label">
          <label htmlFor="coopanion-reaction-key">{t('reactionKeyInputLabel')}</label>
          {keyView === 'env' || keyView === 'env-file' ? <p className="pet-error">{t(keyView === 'env' ? 'reactionKeyEnvReadOnlyHint' : 'reactionKeyEnvFileReadOnlyHint')}</p> : null}
        </div>
        <Input
          id="coopanion-reaction-key"
          className="pet-key-input"
          type="password"
          autoComplete="off"
          placeholder={t('reactionKeyPlaceholder')}
          value={keyDraft}
          disabled={!ready || !local || keyReadOnly || keyBusy}
          onChange={event => {
            setKeyDraft(event.target.value);
            setKeyError('');
            setKeyFeedback(undefined);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && keyDraft.trim() && !keyReadOnly && !keyBusy) {
              void handleSaveKey();
            }
          }}
        />
      </div>
      <div className="pet-actions">
        <Button
          variant="outline"
          disabled={!ready || !local || keyReadOnly || !keyDraft.trim() || keyBusy || !setKey}
          onClick={() => void handleSaveKey()}
        >
          {t('reactionKeySave')}
        </Button>
        <Button
          variant="outline"
          disabled={!ready || !local || keyReadOnly || !isConfigured || keyBusy || !clearKey}
          onClick={() => void handleClearKey()}
        >
          {t('reactionKeyClear')}
        </Button>
      </div>
      {keyFeedback ? <p className="pet-feedback" role="status">{t(keyFeedback === 'saved' ? 'reactionKeySaved' : 'reactionKeyCleared')}</p> : null}
      {keyError ? <p className="pet-error" role="alert">{keyError}</p> : null}
      <p role="status" data-testid="reaction-status">{t('reactionCalls')}: {status?.reactionStatus?.calls ?? 0}</p>
    </section>
    <section className="pet-card" aria-label={t('preferences')}>
      <h3>{t('preferences')}</h3>
      {!accepted.writable || !local ? <p>{t('unavailable')}</p> : null}
      {(['autoStart', 'roam', 'notifications', 'quietMode', 'diagnostics', 'aboveFullscreen', 'preferOpeningParagraph', 'inlineQuestions', 'inlineApprovals'] as const).map(field => <div className="pet-row" key={field}>
        <div className="pet-label"><strong>{t(field)}</strong><p>{t(`${field}Hint`)}</p></div>
        <Switch checked={prefs?.[field] ?? (field === 'aboveFullscreen' || field === 'preferOpeningParagraph' || field === 'inlineQuestions' || field === 'inlineApprovals')} disabled={!ready || !local} label={t(field)} onChange={value => void save(field, value)} />
      </div>)}
      {prefs ? <>
        <div className="pet-row"><div className="pet-label"><label htmlFor="coopanion-companionship">{t('companionship')}</label><p id="coopanion-companionship-hint">{t('companionshipHint')}</p></div>
          <select id="coopanion-companionship" className="pet-number" aria-describedby="coopanion-companionship-hint" value={prefs.companionship ?? 'off'} disabled={!ready || !local} onChange={event => void save('companionship', event.target.value as CompanionshipMode)}>
            {COMPANIONSHIP_MODES.map(value => <option key={value} value={value}>{t(`companionship_${value}`)}</option>)}
          </select></div>
        {(['npcHome', 'npcRange'] as const).map(field => <NumberPreference key={field} id={`coopanion-${field}`} label={t(field)} hint={t(`${field}Hint`)} invalidHint={t('invalid')} value={Math.round((prefs[field] ?? (field === 'npcHome' ? .85 : .3)) * 100)} min={field === 'npcHome' ? 5 : 10} max={field === 'npcHome' ? 95 : 60} disabled={!ready || !local} save={value => void save(field, value / 100)} />)}
        <NumberPreference id="coopanion-size" label={t('size')} hint={t('sizeHint')} invalidHint={t('invalid')} value={prefs.size} min={90} max={240} disabled={!ready || !local} save={value => void save('size', value)} />
        <div className="pet-row">
          <div className="pet-label"><label htmlFor="coopanion-text-scale">{t('textScale')}</label><p id="coopanion-text-scale-hint">{t('textScaleHint')}</p></div>
          <select className="pet-number" id="coopanion-text-scale" aria-describedby="coopanion-text-scale-hint" value={textScale(prefs.textScale)} disabled={!ready || !local}
            onChange={event => void save('textScale', textScale(Number(event.target.value)))}>
            {TEXT_SCALES.map(value => <option key={value} value={value}>{value * 100}%</option>)}
          </select>
        </div>
        <div className="pet-row">
          <div className="pet-label"><label htmlFor="coopanion-default-chat-target">{t('defaultChatTarget')}</label><p id="coopanion-default-chat-target-hint">{t('defaultChatTargetHint')}</p></div>
          <select className="pet-number" id="coopanion-default-chat-target" aria-describedby="coopanion-default-chat-target-hint" value={prefs.defaultChatTarget ?? 'companion'} disabled={!ready || !local}
            onChange={event => void save('defaultChatTarget', event.target.value as 'companion' | 'last')}>
            <option value="companion">{t('chatTargetCompanion')}</option>
            <option value="last">{t('chatTargetLast')}</option>
          </select>
        </div>
        <NumberPreference id="coopanion-duration" label={t('duration')} hint={t('durationHint')} invalidHint={t('invalid')} value={prefs.bubbleDurationMs / 1000} min={2} max={60} disabled={!ready || !local} save={value => void save('bubbleDurationMs', value * 1000)} />
      </> : null}
      <p className="pet-feedback" role="status">{saving ? t('saving') : saveFailure || (feedback ? t(feedback) : '')}</p>
    </section>
    <section className="pet-card" aria-label={t('notificationSettings')}>
      <h3>{t('notificationSettings')}</h3>
      <div className="pet-row"><div className="pet-label"><strong>{t('systemNotifications')}</strong><p>{t('systemNotificationsHint')}</p></div>
        <Switch checked={prefs?.systemNotifications ?? false} disabled={!ready || !local || notificationBusy} label={t('systemNotifications')} onChange={value => void enableSystem(value)} />
      </div>
      <div className="pet-row"><div className="pet-label"><strong>{t('reminders')}</strong><p>{t('remindersHint')}</p></div>
        <Switch checked={prefs?.reminders ?? true} disabled={!ready || !local} label={t('reminders')} onChange={value => void save('reminders', value)} />
      </div>
      {prefs ? <NumberPreference id="coopanion-reminder-delay" label={t('reminderDelay')} hint={t('reminderDelayHint')} invalidHint={t('invalid')} value={(prefs.reminderDelayMs ?? 600000) / 60000} min={1} max={1440} disabled={!ready || !local} save={value => void save('reminderDelayMs', value * 60000)} /> : null}
      <p role="status">{t('webPermission')}: {t(notification.web.permission === 'unavailable' ? 'permissionUnavailable' : notification.web.permission)} · {t('osUnknown')}</p>
      <p>{t('systemSettingsHint')}</p>
      <div className="pet-actions">
        <Button variant="outline" disabled={!local || !notifier || notificationBusy || !notification.web.supported} onClick={() => void permission()}>{t('requestPermission')}</Button>
        <Button variant="outline" disabled={!local || !notifier || notificationBusy || !prefs?.notifications || prefs?.quietMode || !prefs?.systemNotifications || !running || status?.visible !== false || notification.web.permission !== 'granted'} onClick={() => void testNotification()}>{t('testNotification')}</Button>
      </div>
      <p className="pet-feedback" role="status">{notificationBusy ? t('notificationWorking') : notification.delivery ? t(`delivery${notification.delivery}`) : t('testNotificationHint')}</p>
      {notification.receiptAccepted === false ? <p className="pet-error" role="alert">{t('receiptRejected')}</p> : null}
      {notificationError || notification.error ? <p className="pet-error" role="alert">{notificationError || notification.error}</p> : null}
    </section>
    <section className="pet-card" aria-label={t('characters')}>
      <div className="pet-row"><div className="pet-label"><h3>{t('characters')}</h3><p>{t('charactersHint')}</p></div>
        <Button variant="outline" disabled={disabled} onClick={() => void command('characters')}>{t('manage')}</Button></div>
    </section>
  </div>;
}
