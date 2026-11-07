import { createElement as h, useEffect, useRef, useState } from 'react';
import { DETECTORS, InitiativeLevelSchema, InitiativeSettingsSchema, initiativeFindingCopy, LEVELS, } from '#whalemaid/core';
import { InitiativeEvidenceResponseSchema, InitiativePanelSchema, PANEL_CHANNEL, PANEL_PREFIX, } from '../panel-api/contract.js';
const labels = {
    'zh-CN': {
        title: '主动性',
        findings: '发现',
        settings: '开关',
        stats: '近 7 天统计',
        explanation: 'L0 留在面板，L1 可进入每日简报。建议卡和询问将在下一版本提供。',
        empty: '还没有发现。',
        enabled: '启用主动性',
        brief: '加入每日简报',
        cards: '建议卡（下一版本提供）',
        asks: '询问（下一版本提供）',
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
        kinds: { goal: '目标', task: '任务', verification: '验收', run: '运行', notification: '决定' },
    },
    en: {
        title: 'Initiative',
        findings: 'Findings',
        settings: 'Settings',
        stats: 'Last 7 days',
        explanation: 'L0 stays on this panel. L1 can appear in the daily brief. Suggestion cards and questions are planned for the next version.',
        empty: 'No findings yet.',
        enabled: 'Enable initiative',
        brief: 'Include in daily brief',
        cards: 'Suggestion cards (next version)',
        asks: 'Questions (next version)',
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
        kinds: { goal: 'Goal', task: 'Task', verification: 'Verification', run: 'Run', notification: 'Decision' },
    },
};
async function rpc(connection, method, input, signal) {
    const response = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, input, signal);
    if (!response.ok)
        throw response.error;
    return response.value;
}
function FindingRow({ connection, locale, finding, onOpenGoal, onDelete, }) {
    const c = labels[locale];
    const copy = initiativeFindingCopy(locale, finding.detector);
    const [open, setOpen] = useState(false);
    const [evidence, setEvidence] = useState();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const refs = JSON.stringify(finding.evidence);
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
    return h('li', { 'data-initiative-detector': finding.detector }, h('strong', null, copy.name), h('p', null, copy.summary), h('span', null, `${finding.level} · ${c.score} ${finding.score.toFixed(2)} · `), h('time', { dateTime: new Date(finding.createdAt).toISOString() }, new Date(finding.createdAt).toLocaleString(locale)), finding.status === 'expired' && h('small', null, ' · ' + c.expired), h('details', { onToggle: (event) => setOpen(event.currentTarget.open) }, h('summary', null, c.evidence), !evidence && !error && h('p', null, c.loading), h('ul', null, ...(evidence ?? []).map((row, index) => h('li', { key: `${row.kind}:${row.id}:${index}` }, `${c.kinds[row.kind]} · ${row.missing ? c.missing : (row.title ?? row.status ?? row.id)}`, row.command &&
        h('p', null, h('code', null, row.command), row.exitCode === undefined ? '' : ` · exit ${row.exitCode ?? '—'}`), row.excerpt && h('pre', { style: { whiteSpace: 'pre-wrap' } }, row.excerpt), !row.missing && goalId && h('button', { onClick: () => onOpenGoal(goalId) }, c.openGoal))))), confirming
        ? h('div', null, h('button', {
            disabled: busy,
            onClick: () => {
                setBusy(true);
                void onDelete(finding.id)
                    .catch(() => setError(c.deleteError))
                    .finally(() => setBusy(false));
            },
        }, c.confirm), h('button', { disabled: busy, onClick: () => setConfirming(false) }, c.cancel))
        : h('button', { onClick: () => setConfirming(true) }, c.remove), error && h('p', { role: 'alert' }, error));
}
export function InitiativeView({ connection, locale, onOpenGoal, }) {
    const c = labels[locale];
    const [data, setData] = useState();
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
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
    return h('section', { 'aria-label': c.title, 'data-initiative': '' }, h('h2', null, c.title), h('p', null, c.explanation), h('h3', null, c.findings), groups.size === 0 && h('p', null, data ? c.empty : c.loading), ...[...groups].map(([id, rows]) => h('div', { key: id ?? 'unknown' }, h('h4', null, id
        ? h('button', { onClick: () => onOpenGoal(id) }, rows[0]?.goalTitle || c.unknownGoal)
        : c.unknownGoal), h('ul', null, ...rows.map((finding) => h(FindingRow, { key: finding.id, connection, locale, finding, onOpenGoal, onDelete: remove }))))), h('h3', null, c.settings), data &&
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
            }, ...LEVELS.map((level) => h('option', { key: level, value: level }, level))));
        }), h('div', null, check(c.brief, data.settings.channels.brief, (value) => patch({ kind: 'brief', value }))), h('div', null, check(c.cards, false), check(c.asks, false)), h('button', { disabled: busy, onClick: () => patch({ kind: 'reset' }) }, c.reset)), h('h3', null, c.stats), data &&
        h('dl', null, ...DETECTORS.flatMap((id) => [
            h('dt', { key: id + '-name' }, initiativeFindingCopy(locale, id).name),
            h('dd', { key: id + '-count' }, data.counts[id]),
        ])), error && h('p', { role: 'alert' }, c.error));
}
//# sourceMappingURL=initiative.js.map