import { createElement as h, useEffect, useState, useRef } from 'react';
import { MemoryProposals } from './memory-proposals.js';
import { t, notificationMessages, NotificationPreferencesSchema } from '#whalemaid/core';
import { NotificationCenterSchema, RouteResultSchema, PANEL_CHANNEL, PANEL_PREFIX, } from '../panel-api/contract.js';
import { GoalDecisionButtons } from './goal-decisions.js';
/** Native inbox and panel use the same stored choices; free-text notes are displayed as text nodes. */
export function NotificationCenter({ connection, locale, onOpenGoal, goalId, notificationId, }) {
    const [data, setData] = useState();
    const focused = useRef();
    useEffect(() => {
        if (!notificationId || focused.current === notificationId)
            return;
        const entry = document.getElementById(`whaledot-notification-${notificationId}`);
        if (entry) {
            entry.scrollIntoView({ block: 'center' });
            entry.focus({ preventScroll: true });
            focused.current = notificationId;
        }
    }, [data, notificationId]);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, refresh] = useState(0), [preview, setPreview] = useState('');
    const [muted, setMuted] = useState(false), [start, setStart] = useState(''), [end, setEnd] = useState(''), [limit, setLimit] = useState(4), [editing, setEditing] = useState(false);
    const text = (key) => t(locale, key);
    const call = async (method, input, signal) => {
        const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input, signal);
        if (!reply.ok)
            throw reply.error;
        return reply.value;
    };
    useEffect(() => {
        const controller = new AbortController();
        let timer;
        const load = async () => {
            try {
                const next = NotificationCenterSchema.parse(await call('notification-center', goalId ? { goalId } : {}, controller.signal));
                if (!controller.signal.aborted) {
                    setData(next);
                    setError('');
                    if (!editing) {
                        setMuted(next.preferences.muted);
                        setLimit(next.preferences.maxPerHour);
                        setStart(next.preferences.quietHours?.start ?? '');
                        setEnd(next.preferences.quietHours?.end ?? '');
                    }
                }
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(String(e));
            }
            finally {
                if (!controller.signal.aborted)
                    timer = setTimeout(load, 2000);
            }
        };
        void load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [connection, goalId, revision, editing]);
    const write = async (method, input) => {
        setBusy(true);
        try {
            const value = await call(method, input);
            if (method === 'route-suggestion') {
                const r = RouteResultSchema.parse(value);
                if (!r.ok)
                    throw new Error(r.reason ?? 'option-rejected');
                if (r.stat !== undefined)
                    setPreview(r.stat || text('noFileDifferences'));
                else if (r.openPanel && r.goalId)
                    onOpenGoal(r.goalId);
            }
            setError('');
            refresh((v) => v + 1);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    const save = async () => {
        try {
            const prefs = NotificationPreferencesSchema.parse({
                muted,
                maxPerHour: limit,
                ...(start || end ? { quietHours: { start, end } } : {}),
            });
            await write('notification-preferences', prefs);
            setEditing(false);
        }
        catch (e) {
            setError(String(e));
        }
    };
    const phrases = locale === 'zh-CN'
        ? {
            generated: '已生成提问',
            held: '暂缓投递',
            started: '开始提问',
            answered: '已作答',
            unanswered: '未作答，等待手动提醒',
            cancelled: '系统取消',
            failed: '投递失败',
            superseded: '已取代',
            expired: '已失效',
            history: '投递经过',
            next: '下次可提问',
            muted: '静音中，解除后再问',
            'quiet-hours': '勿扰时段，结束后再问',
            'hourly-limit': '已达每小时上限',
            'duplicate-unresolved': '同类决策仍待处理',
            'retry-backoff': '投递失败，等待重试',
            snoozed: '稍后提醒',
            'manual-reminder': '已请求提醒',
            'host-stopped': '宿主已停止',
            'host-restarted': '宿主已重启',
            'task-version-refreshed': '任务版本更新，已更新选项',
            'decision-handled': '已在另一界面操作',
            'owner-reminded': '用户请求了新的提醒',
            'authorization-invalid': '授权已失效或被撤销',
            'decision-no-longer-current': '目标、任务状态或执行记录已变化',
            'inbox-preparation-failed': '通知会话准备失败',
            'question-service-failed': '提问服务失败',
            'response-processing-failed': '已收到回答，处理时出错',
            'provider-aborted': '提问渠道中止，未确认收到答复',
            'user-unanswered': '关闭或提交时没有作答',
            'legacy-attempt': '旧版已尝试投递，接收情况未知',
        }
        : {
            generated: 'Question created',
            held: 'Delivery held',
            started: 'Asking',
            answered: 'Answered',
            unanswered: 'Unanswered. Waiting for a manual reminder.',
            cancelled: 'Cancelled by the system',
            failed: 'Delivery failed',
            superseded: 'Superseded',
            expired: 'Expired',
            history: 'Delivery history',
            next: 'Next eligible time',
            muted: 'Muted. Asking can resume when unmuted.',
            'quiet-hours': 'Asking can resume after quiet hours.',
            'hourly-limit': 'Hourly limit reached',
            'duplicate-unresolved': 'A matching decision is still pending',
            'retry-backoff': 'Delivery failed. Waiting to retry.',
            snoozed: 'Snoozed',
            'manual-reminder': 'Reminder requested',
            'host-stopped': 'Host stopped',
            'host-restarted': 'Host restarted',
            'task-version-refreshed': 'Options refreshed for the current task version',
            'decision-handled': 'An action was taken in another interface',
            'owner-reminded': 'Owner requested another reminder',
            'authorization-invalid': 'Authorization is invalid or revoked',
            'decision-no-longer-current': 'Goal, task state or run changed',
            'inbox-preparation-failed': 'Could not prepare the notification chat',
            'question-service-failed': 'Question service failed',
            'response-processing-failed': 'Answer received. Processing failed.',
            'provider-aborted': 'Question channel ended without a confirmed answer',
            'user-unanswered': 'Closed or submitted without an answer',
            'legacy-attempt': 'Earlier delivery attempt. Receipt unknown.',
        };
    const reasonText = (reason) => (reason ? phrases[reason] : undefined);
    const dateText = (at) => new Date(at).toLocaleString(locale);
    const delivery = (item) => {
        const n = item.notification;
        if (item.deliveries) {
            const state = n.decisionDelivery?.outcome;
            const reason = reasonText(n.deliveryReason);
            const next = n.nextDeliveryAt;
            return [
                n.resolvedChoice
                    ? phrases.answered
                    : n.resolvedReason
                        ? [phrases[n.resolvedReason], reason].filter(Boolean).join(' · ')
                        : state === 'unanswered' && next === undefined
                            ? phrases.unanswered
                            : (reason ?? (state === 'asking' ? phrases.started : text('notifyQueued'))),
                n.resolvedAt === undefined && next !== undefined ? phrases.next + ' ' + dateText(next) : undefined,
            ]
                .filter(Boolean)
                .join(' · ');
        }
        return text(n.deliveryState === 'muted'
            ? 'notifyMuted'
            : n.deliveryState === 'failed'
                ? 'notifyFailed'
                : n.deliveryState === 'cancelled'
                    ? 'notifyCancelled'
                    : n.deliveryReason === 'quiet-hours'
                        ? 'heldQuiet'
                        : n.deliveryReason === 'hourly-limit'
                            ? 'heldHourly'
                            : n.deliveryReason === 'snoozed'
                                ? 'heldSnooze'
                                : n.deliveredAt !== undefined
                                    ? 'deliveredInbox'
                                    : 'notifyQueued');
    };
    const field = (label, type, value, onChange) => h('label', null, label, ' ', h('input', {
        type,
        value,
        onChange: (e) => {
            setEditing(true);
            onChange(e.target.value);
        },
    }));
    return h('section', { className: 'whaledot-notifications' }, h('h2', null, text('notificationCenter')), h(MemoryProposals, { connection, locale, goalId }), error && h('p', { role: 'alert' }, error), h('details', null, h('summary', null, text('notifyPreferences')), h('label', null, h('input', {
        type: 'checkbox',
        checked: muted,
        onChange: (e) => {
            setEditing(true);
            setMuted(e.target.checked);
        },
    }), text('muteNotifications')), field(text('quietStart'), 'time', start, setStart), field(text('quietEnd'), 'time', end, setEnd), field(text('maxPerHour'), 'number', limit, (v) => setLimit(Number(v))), h('button', {
        disabled: busy,
        onClick: () => {
            void save();
        },
    }, text('savePreferences'))), h('div', { className: 'whaledot-notification-columns' }, ...['pending', 'handled', 'digest'].map((group) => {
        const items = (data?.items ?? []).filter((item) => group === 'handled'
            ? item.notification.resolvedAt !== undefined
            : group === 'digest'
                ? item.notification.resolvedAt === undefined &&
                    (item.notification.kind === 'info' || item.notification.deliveryState === 'digest')
                : item.notification.resolvedAt === undefined &&
                    item.notification.kind !== 'info' &&
                    item.notification.deliveryState !== 'digest');
        return h('section', { key: group }, h('h3', null, text(group === 'pending' ? 'notifyPending' : group === 'handled' ? 'notifyHandled' : 'notifyDigest')), ...(group === 'digest'
            ? [...new Set(items.map((i) => i.notification.goalId))].map((id) => h('details', { key: id }, h('summary', null, items.find((i) => i.notification.goalId === id).copy.detail), ...items
                .filter((i) => i.notification.goalId === id)
                .map((i) => h('p', { key: i.notification.id }, i.copy.question))))
            : items.map((item) => h('article', {
                key: item.notification.id,
                id: `whaledot-notification-${item.notification.id}`,
                tabIndex: -1,
            }, h('strong', null, item.copy.header), h('p', null, item.copy.question), h('small', null, item.copy.detail), h('p', null, delivery(item)), item.deliveries?.length
                ? h('details', null, h('summary', null, phrases.history), h('ul', null, ...item.deliveries.map((entry) => h('li', { key: entry.id }, [
                    entry.endedAt === undefined
                        ? dateText(entry.at)
                        : dateText(entry.at) +
                            ' ' +
                            phrases.started +
                            ' → ' +
                            dateText(entry.endedAt),
                    phrases[entry.result],
                    reasonText(entry.detail),
                    entry.generation === undefined ? undefined : '#' + entry.generation,
                ]
                    .filter(Boolean)
                    .join(' · ')))))
                : null, ...item.notes.map((note) => h('p', { key: note.id }, text('userNote'), ': ', note.text)), ...item.choices.map((c) => h('p', { key: c.id }, text('choiceSource'), ': ', text(c.source === 'inbox' ? 'choiceInbox' : 'choicePanel'), ' · ', notificationMessages[locale][c.action]?.[0] ??
                c.action, ' · ', text(c.result === 'succeeded'
                ? 'choiceSucceeded'
                : c.result === 'failed'
                    ? 'choiceFailed'
                    : 'choicePending'), c.detail ? ' · ' + c.detail : '')), ...item.suggestions
                .filter((s) => (item.notification.suggestionIds ?? []).includes(s.id) &&
                !(s.intent.type === 'panel-decision' &&
                    ['abandon', 'change-direction'].includes(s.intent.choice)))
                .map((s) => h('button', {
                key: s.id,
                title: s.description,
                disabled: busy ||
                    group === 'handled' ||
                    s.consumedAt !== undefined ||
                    s.expiresAt <= Date.now() ||
                    !!item.notification.routingSuggestionId,
                onClick: () => {
                    void write('route-suggestion', { suggestionId: s.id });
                },
            }, s.label, h('small', null, ' — ', s.description))), group === 'pending' &&
                item.goal &&
                h(GoalDecisionButtons, {
                    notification: item.notification,
                    goal: item.goal,
                    locale,
                    disabled: busy || !!item.notification.routingSuggestionId,
                    submit: (input) => write('resolve-decision', input),
                }), group === 'pending' &&
                h('button', {
                    disabled: busy || !!item.notification.routingSuggestionId,
                    onClick: () => {
                        void write('remind-notification', { notificationId: item.notification.id });
                    },
                }, text('remindAgain'))))));
    })), preview && h('pre', null, preview));
}
//# sourceMappingURL=notifications.js.map