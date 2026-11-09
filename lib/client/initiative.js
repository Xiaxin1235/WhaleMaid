import { RadarSettingsView } from './radar.js';
import { createElement as h, useEffect, useRef, useState } from 'react';
import { DETECTORS, InitiativeLevelSchema, InitiativeLimitsSchema, InitiativeSettingsSchema, initiativeFindingCopy, LEVELS, } from '#whalemaid/core';
import { InitiativeEvidenceResponseSchema, InitiativePanelSchema, PANEL_CHANNEL, PANEL_PREFIX, } from '../panel-api/contract.js';
const labels = {
    'zh-CN': {
        title: '主动性',
        findings: '发现',
        settings: '开关',
        stats: '主动性效果',
        explanation: '建议卡默认开启，可在这里关闭。发现仍会保留在面板，或加入每日简报。',
        empty: '还没有发现。',
        enabled: '启用主动性',
        brief: '加入每日简报',
        cards: '主动建议卡',
        asks: '主动询问',
        journal: '把有进展的建议写入大肥鱼的经历',
        interval: '同一目标建议间隔（小时）',
        cooldown: '同类发现冷却期（天）',
        save: '保存限制',
        card: '查看建议卡',
        review: '审核目标草案',
        muted: '已静默的提醒',
        columns: ['检测器', '周期', '投递', '采纳率', '无效打扰率', '采纳后进展率', '误触发', '模型成本'],
        days: (n) => `近 ${n} 天`,
        adjusted: (level, score) => `已调整至 ${level} · 最低得分 ${score}`,
        reset: '恢复默认',
        maximum: '最高分级',
        evidence: '证据',
        missing: '记录已删除或改变',
        openGoal: '查看目标详情',
        unknownGoal: '未找到目标',
        remove: '删除这条记录',
        confirm: '确认删除',
        cancel: '取消',
        expired: '已过期',
        error: '无法读取或保存主动性设置',
        score: '得分',
        loading: '加载中',
        deleteError: '无法删除这条记录',
        kinds: {
            goal: '目标',
            task: '任务',
            verification: '验收',
            run: '运行',
            notification: '决定',
            radar: '项目雷达',
        },
    },
    en: {
        title: 'Initiative',
        findings: 'Findings',
        settings: 'Settings',
        stats: 'Initiative effectiveness',
        explanation: 'Suggestion cards are on by default. Turn them off here to keep findings on this panel or in the daily brief.',
        empty: 'No findings yet.',
        enabled: 'Enable initiative',
        brief: 'Include in daily brief',
        cards: 'Proactive suggestion cards',
        asks: 'Proactive questions',
        journal: 'Record suggestions that led to progress in Da Fei Yu’s journal',
        interval: 'Hours between cards for the same goal',
        cooldown: 'Days before repeating the same finding',
        save: 'Save limits',
        card: 'View suggestion card',
        review: 'Review goal draft',
        muted: 'Muted reminders',
        columns: [
            'Detector',
            'Period',
            'Delivered',
            'Acceptance',
            'Unhelpful',
            'Progress after acceptance',
            'Inaccurate',
            'Model cost',
        ],
        days: (n) => `Last ${n} days`,
        adjusted: (level, score) => `Adjusted to ${level} · Minimum score ${score}`,
        reset: 'Restore defaults',
        maximum: 'Maximum level',
        evidence: 'Evidence',
        missing: 'Record removed or changed',
        openGoal: 'Open goal details',
        unknownGoal: 'Goal unavailable',
        remove: 'Delete this finding',
        confirm: 'Confirm deletion',
        cancel: 'Cancel',
        expired: 'Expired',
        error: 'Could not read or save initiative settings',
        score: 'Score',
        loading: 'Loading',
        deleteError: 'Could not delete this finding',
        kinds: {
            goal: 'Goal',
            task: 'Task',
            verification: 'Verification',
            run: 'Run',
            notification: 'Decision',
            radar: 'Project Radar',
        },
    },
};
async function rpc(connection, method, input, signal) {
    const response = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input, signal);
    if (!response.ok)
        throw response.error;
    return response.value;
}
function FindingRow({ connection, locale, finding, onOpenGoal, onDelete, onCard, onDraft, evidenceId, }) {
    const c = labels[locale];
    const copy = initiativeFindingCopy(locale, finding.detector);
    const [open, setOpen] = useState(false);
    const [evidence, setEvidence] = useState();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [remote, setRemote] = useState();
    const [error, setError] = useState('');
    const refs = JSON.stringify(finding.evidence);
    const details = useRef(null);
    useEffect(() => {
        if (evidenceId !== finding.id || !details.current)
            return;
        details.current.open = true;
        setOpen(true);
        details.current.scrollIntoView({ block: 'center' });
    }, [evidenceId, finding.id]);
    useEffect(() => {
        if (!open)
            return;
        const abort = new AbortController();
        setEvidence(undefined);
        void rpc(connection, 'initiative-evidence', { id: finding.id }, abort.signal)
            .then((value) => {
            if (!abort.signal.aborted) {
                setEvidence(InitiativeEvidenceResponseSchema.parse(value));
                setError('');
            }
        })
            .catch(() => {
            if (!abort.signal.aborted)
                setError(c.error);
        });
        return () => abort.abort();
    }, [connection, finding.id, refs, open, c.error]);
    const goalId = finding.subject.goalId;
    const readRemote = async () => {
        setBusy(true);
        try {
            const { excerpt } = (await rpc(connection, 'radar-excerpt', { id: finding.id }));
            setRemote(excerpt || (locale === 'zh-CN' ? '来源没有可显示的摘要。' : 'No excerpt available from this source.'));
            setError('');
        }
        catch {
            setError(locale === 'zh-CN' ? '暂时无法读取来源。' : 'Could not read the source.');
        }
        finally {
            setBusy(false);
        }
    };
    return h('li', { 'data-initiative-detector': finding.detector }, h('strong', null, copy.name), h('p', null, copy.summary), h('span', null, `${finding.level} · ${c.score} ${finding.score.toFixed(2)} · `), h('time', { dateTime: new Date(finding.createdAt).toISOString() }, new Date(finding.createdAt).toLocaleString(locale)), finding.status === 'expired' && h('small', null, ' · ' + c.expired), h('details', {
        ref: details,
        onToggle: (event) => setOpen(event.currentTarget.open),
    }, h('summary', null, c.evidence), !evidence && !error && h('p', null, c.loading), h('ul', null, ...(evidence ?? []).map((row, index) => h('li', { key: `${row.kind}:${row.id}:${index}` }, `${c.kinds[row.kind]} · ${row.missing ? c.missing : (row.title ?? row.status ?? row.id)}`, row.command &&
        h('p', null, h('code', null, row.command), row.exitCode === undefined ? '' : ` · exit ${row.exitCode ?? '—'}`), row.excerpt && h('pre', { style: { whiteSpace: 'pre-wrap' } }, row.excerpt), !row.missing && goalId && h('button', { onClick: () => onOpenGoal(goalId) }, c.openGoal)))), evidence?.some((row) => !row.missing) &&
        (finding.detector === 'radarDependency' || finding.detector === 'radarRelated') &&
        h('button', { type: 'button', disabled: busy, onClick: () => void readRemote() }, locale === 'zh-CN' ? '联网读取来源摘要' : 'Read a source excerpt online'), remote && h('pre', { style: { whiteSpace: 'pre-wrap' } }, remote)), finding.notificationId && h('button', { onClick: () => onCard(finding.notificationId) }, c.card), finding.draft && h('button', { onClick: () => onDraft(finding.draft.id) }, c.review), !finding.notificationId &&
        (confirming
            ? h('div', null, h('button', {
                disabled: busy,
                onClick: () => {
                    setBusy(true);
                    void onDelete(finding.id)
                        .catch(() => setError(c.deleteError))
                        .finally(() => setBusy(false));
                },
            }, c.confirm), h('button', { disabled: busy, onClick: () => setConfirming(false) }, c.cancel))
            : h('button', { onClick: () => setConfirming(true) }, c.remove)), error && h('p', { role: 'alert' }, error));
}
export function InitiativeView({ connection, locale, onOpenGoal, onCard, onDraft, evidenceId, }) {
    const c = labels[locale];
    const [data, setData] = useState();
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [limits, setLimits] = useState();
    const revision = useRef(0);
    useEffect(() => {
        const abort = new AbortController();
        let timer;
        const load = async () => {
            const current = revision.current;
            try {
                const value = await rpc(connection, 'initiative', {}, abort.signal);
                if (!abort.signal.aborted && current === revision.current && current % 2 === 0) {
                    setData(InitiativePanelSchema.parse(value));
                    setError(false);
                }
            }
            catch {
                if (!abort.signal.aborted)
                    setError(true);
            }
            finally {
                if (!abort.signal.aborted)
                    timer = setTimeout(load, 2000);
            }
        };
        void load();
        return () => {
            abort.abort();
            clearTimeout(timer);
        };
    }, [connection]);
    const patch = (value) => {
        revision.current++;
        setBusy(true);
        void rpc(connection, 'initiative-settings', value)
            .then((response) => {
            const settings = InitiativeSettingsSchema.parse(response);
            setData((state) => state && { ...state, settings });
            setError(false);
        })
            .catch(() => setError(true))
            .finally(() => {
            revision.current++;
            setBusy(false);
        });
    };
    const remove = async (id) => {
        await rpc(connection, 'initiative-delete', { id, confirm: true });
        revision.current += 2;
        setData((state) => state && { ...state, findings: state.findings.filter((row) => row.id !== id) });
    };
    const restore = (detector, goalId) => {
        setBusy(true);
        void rpc(connection, 'initiative-restore', { detector, ...(goalId ? { goalId } : {}) })
            .catch(() => setError(true))
            .finally(() => setBusy(false));
    };
    const currentLimits = limits ?? data?.settings.limits;
    const rate = (n, d) => d ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n / d) : '—';
    const check = (label, value, change) => h('label', null, h('input', {
        type: 'checkbox',
        checked: value,
        disabled: busy || !change,
        onChange: change ? (event) => change(event.target.checked) : undefined,
    }), label);
    const groups = new Map();
    for (const finding of data?.findings ?? []) {
        const id = finding.subject.goalId;
        const rows = groups.get(id) ?? [];
        rows.push(finding);
        groups.set(id, rows);
    }
    return h('section', { 'aria-label': c.title, 'data-initiative': '' }, h('h2', null, c.title), h('p', null, c.explanation), data && check(c.cards, data.settings.channels.cards, (value) => patch({ kind: 'cards', value })), data?.radar && h(RadarSettingsView, { connection, locale, settings: data.radar.settings }), data?.radar &&
        h('p', { 'data-radar-metrics': '' }, locale === 'zh-CN' ? '近 7 天检查成功率 ' : '7-day check success ', rate(data.radar.passed, data.radar.checks), ' · ', locale === 'zh-CN' ? '近 7 天请求数 ' : '7-day requests ', data.radar.requests), h('h3', null, c.findings), groups.size === 0 && h('p', null, data ? c.empty : c.loading), ...[...groups].map(([id, rows]) => h('div', { key: id ?? 'unknown' }, h('h4', null, id
        ? h('button', { onClick: () => onOpenGoal(id) }, rows[0]?.goalTitle || c.unknownGoal)
        : c.unknownGoal), h('ul', null, ...rows.map((finding) => h(FindingRow, {
        key: finding.id,
        connection,
        locale,
        finding,
        onOpenGoal,
        onDelete: remove,
        onCard,
        onDraft,
        evidenceId,
    }))))), h('h3', null, c.settings), data &&
        h('div', null, check(c.enabled, data.settings.enabled, (value) => patch({ kind: 'enabled', value })), ...DETECTORS.map((detector) => {
            const name = initiativeFindingCopy(locale, detector).name;
            const setting = data.settings.detectors[detector];
            return h('div', { key: detector }, check(name, setting.enabled, (value) => patch({ kind: 'detector-enabled', detector, value })), h('select', {
                'aria-label': name + ' · ' + c.maximum,
                disabled: busy,
                value: setting.maxLevel,
                onChange: (event) => patch({
                    kind: 'detector-level',
                    detector,
                    value: InitiativeLevelSchema.parse(event.target.value),
                }),
            }, ...LEVELS.filter((level) => level !== 'L3' || detector === 'budgetBurn' || setting.maxLevel === 'L3').map((level) => h('option', { key: level, value: level }, level))));
        }), h('div', null, check(c.brief, data.settings.channels.brief, (value) => patch({ kind: 'brief', value }))), h('div', null, check(c.asks, data.settings.channels.asks, (value) => patch({ kind: 'asks', value }))), h('div', null, check(c.journal, data.settings.companion.journal, (value) => patch({ kind: 'journal', value }))), currentLimits &&
            h('div', null, ...['cardIntervalHours', 'cooldownDays'].map((key) => h('label', { key }, key === 'cardIntervalHours' ? c.interval : c.cooldown, h('input', {
                type: 'number',
                min: 1,
                max: key === 'cardIntervalHours' ? 168 : 30,
                value: currentLimits[key],
                onChange: (event) => setLimits({ ...currentLimits, [key]: Number(event.target.value) }),
            }))), h('button', {
                disabled: busy || !limits || !InitiativeLimitsSchema.safeParse(limits).success,
                onClick: () => {
                    if (limits)
                        patch({ kind: 'limits', value: limits });
                    setLimits(undefined);
                },
            }, c.save)), h('button', { disabled: busy, onClick: () => patch({ kind: 'reset' }) }, c.reset)), h('h3', null, c.stats), data &&
        h('table', null, h('thead', null, h('tr', null, ...c.columns.map((label) => h('th', { key: label, scope: 'col' }, label)))), h('tbody', null, ...data.metrics.flatMap((row) => [7, 30].map((days) => {
            const m = days === 7 ? row.week : row.month;
            return h('tr', { key: `${row.detector}:${days}` }, h('th', { scope: 'row' }, initiativeFindingCopy(locale, row.detector).name, days === 30 &&
                row.adjustment &&
                h('div', null, c.adjusted(row.adjustment.level, row.adjustment.minimumScore), ' ', h('button', { disabled: busy, onClick: () => restore(row.detector) }, c.reset))), ...[
                c.days(days),
                m.delivered,
                rate(m.accepted, m.delivered),
                rate(m.interruptions, m.delivered),
                rate(m.progressed, m.accepted),
                `${m.inaccurate} (${rate(m.inaccurate, m.delivered)})`,
                m.modelCost,
            ].map((value, index) => h('td', { key: index }, value)));
        })))), !!data?.muted.length &&
        h('section', null, h('h3', null, c.muted), ...data.muted.map((row) => h('div', { key: `${row.goalId}:${row.detector}` }, row.title, ' · ', initiativeFindingCopy(locale, row.detector).name, ' ', h('button', { disabled: busy, onClick: () => restore(row.detector, row.goalId) }, c.reset)))), error && h('p', { role: 'alert' }, c.error));
}
//# sourceMappingURL=initiative.js.map