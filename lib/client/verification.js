import { createElement as h, useState } from 'react';
import { t, verificationText } from '#whalemaid/core';
import { GoalDecisionButtons } from './goal-decisions.js';
const labels = {
    abandon: 'decisionAbandon',
    'change-direction': 'decisionChangeDirection',
    verify: 'retryVerification',
    'resume-goal': 'resumeDecision',
    retry: 'decisionRetry',
    accept: 'decisionAccept',
    rollback: 'decisionRollback',
    'pause-goal': 'pauseGoal',
    'view-diff': 'decisionDiff',
};
/** Evidence viewer uses persisted identities only; no arbitrary host path is sent by the browser. */
export function VerificationView({ detail, locale, saving, write, call, }) {
    const [preview, setPreview] = useState('');
    const text = (key) => t(locale, key);
    const show = async (method, input) => {
        try {
            setPreview(JSON.stringify(await call(method, input), null, 2));
        }
        catch (error) {
            setPreview(String(error));
        }
    };
    return h('section', { className: 'whaledot-verification' }, h('h3', null, text('verification')), ...detail.tasks
        .filter((task) => task.state === 'VERIFYING' || task.state === 'UNKNOWN')
        .map((task) => h('p', { key: task.id }, task.title, ' ', h('button', {
        disabled: saving,
        onClick: () => {
            void write(task.state === 'UNKNOWN' ? 'reconcile-task' : 'verify-task', { taskId: task.id });
        },
    }, text(task.state === 'UNKNOWN' ? 'reconcileTask' : 'verifyTask')))), ...detail.verifications.map((report) => h('article', { key: report.id }, h('strong', null, `${detail.tasks.find((task) => task.id === report.taskId)?.title ?? report.taskId}: ${report.judgment.verdict} · ${text('progress')}: ${verificationText(locale, report.judgment.progress)}`), h('p', null, report.judgment.reasons.map((reason) => verificationText(locale, reason)).join('; ')), h('table', null, h('thead', null, h('tr', null, ...[text('verifyCommands'), text('baseline'), text('current')].map((label) => h('th', { key: label }, label)))), h('tbody', null, ...report.current.map((result, index) => h('tr', { key: index }, h('td', null, result.command), ...['baseline', 'current'].map((phase) => {
        const entry = report[phase][index];
        return h('td', { key: phase }, entry
            ? `${verificationText(locale, entry.status)} · ${entry.durationMs ?? 0} ms · ${entry.counts ? JSON.stringify(entry.counts) : '—'}`
            : '—', entry?.logPath &&
            h('button', {
                onClick: () => {
                    void show('verification-log', { runId: report.id, phase, index });
                },
            }, text('viewLog')));
    }))))))), h('h3', null, text('notifications')), ...detail.notifications
        .filter((item) => item.resolvedAt === undefined)
        .map((item) => h('article', { key: item.id }, h('p', null, [
        ...new Set((item.reason ?? '').split(/: |; /).map((reason) => verificationText(locale, reason))),
    ].join('; ')), h('small', null, `${item.taskId ?? ''} · ${item.runId ?? ''}`), h(GoalDecisionButtons, {
        notification: item,
        goal: detail.goal,
        locale,
        disabled: saving || (item.expiresAt ?? 0) <= Date.now() || !!item.routingSuggestionId,
        submit: (input) => write('resolve-decision', input),
    }), ...(item.choices ?? [])
        .filter((choice) => choice !== 'abandon' && choice !== 'change-direction')
        .map((choice) => h('button', {
        key: choice,
        disabled: saving ||
            (item.expiresAt ?? 0) <= Date.now() ||
            detail.tasks.find((task) => task.id === item.taskId)?.version !== item.taskVersion,
        onClick: () => {
            const input = { notificationId: item.id, choice };
            if (choice === 'view-diff')
                void show('resolve-decision', input);
            else
                void write('resolve-decision', input);
        },
    }, text(labels[choice]))))), preview && h('details', { open: true }, h('summary', null, text('evidence')), h('pre', null, preview)));
}
//# sourceMappingURL=verification.js.map