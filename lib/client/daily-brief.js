import { createElement as h, useEffect, useState } from 'react';
import { dailyBriefCopy } from '#whalemaid/core';
import { DailyBriefPanelSchema, PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js';
export function DailyBriefView({ connection, locale, onDecision, }) {
    const [data, setData] = useState();
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const c = dailyBriefCopy(locale);
    useEffect(() => {
        const abort = new AbortController();
        let timer;
        const load = async () => {
            try {
                const r = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/daily-brief`, {}, abort.signal);
                if (!r.ok)
                    throw r.error;
                if (!abort.signal.aborted) {
                    setData(DailyBriefPanelSchema.parse(r.value));
                    setError('');
                }
            }
            catch (e) {
                if (!abort.signal.aborted)
                    setError(String(e));
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
    const record = (v) => h('div', { key: v.date }, h('time', { dateTime: new Date(v.generatedAt).toISOString() }, new Date(v.generatedAt).toLocaleString(locale)), h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit' } }, v.text), ...v.decisions.map((d) => h('button', { key: d.id, onClick: () => onDecision(d.id) }, `${c.waiting}：${d.title}`)));
    return h('section', { 'aria-label': c.title, 'data-daily-brief': true }, h('h2', null, c.title), h('label', null, h('input', {
        type: 'checkbox',
        checked: data?.enabled ?? true,
        disabled: busy || !data,
        onChange: () => {
            const enabled = !data.enabled;
            setBusy(true);
            void connection.rpc
                .call(PANEL_CHANNEL, `${PANEL_PREFIX}/daily-brief-settings`, { enabled })
                .then((r) => {
                if (!r.ok)
                    throw r.error;
                setData((v) => v && { ...v, enabled });
                setError('');
            })
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
    }), c.enabled), data && !data.enabled && h('p', null, c.disabled), data?.today ? record(data.today) : h('p', null, c.empty), h('details', null, h('summary', null, c.history), ...(data?.records.map(record) ?? [])), error && h('p', { role: 'alert' }, error));
}
//# sourceMappingURL=daily-brief.js.map