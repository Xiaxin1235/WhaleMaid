import { createElement as h, useEffect, useState } from 'react';
import { PANEL_CHANNEL, PANEL_PREFIX } from '../panel-api/contract.js';
import { CodexPanelSchema, codexCopy } from '../codex/contract.js';
export function CodexView({ connection, locale }) {
    const [data, setData] = useState();
    const [minutes, setMinutes] = useState('15'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const copy = codexCopy(locale);
    useEffect(() => {
        if (data)
            setMinutes(String(data.settings.timeoutMinutes));
    }, [data?.settings.timeoutMinutes]);
    useEffect(() => {
        const abort = new AbortController();
        let timer;
        const load = async () => {
            try {
                const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/codex`, {}, abort.signal);
                if (!reply.ok)
                    throw Error(reply.error.code);
                const value = CodexPanelSchema.parse(reply.value);
                if (!abort.signal.aborted) {
                    setData(value);
                    setError('');
                }
            }
            catch {
                if (!abort.signal.aborted)
                    setError(copy.failed);
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
    }, [connection, copy.failed]);
    const save = async (enabled, timeoutMinutes) => {
        setBusy(true);
        try {
            const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/codex-settings`, {
                enabled,
                timeoutMinutes,
            });
            if (!reply.ok)
                throw Error(reply.error.code);
            const value = CodexPanelSchema.parse(reply.value);
            setData(value);
            setMinutes(String(value.settings.timeoutMinutes));
            setError('');
        }
        catch {
            setError(copy.failed);
        }
        finally {
            setBusy(false);
        }
    };
    return h('section', { 'aria-label': copy.title }, h('h2', null, copy.title), h('p', null, copy.description), error && h('p', { role: 'alert' }, error), h('label', null, h('input', {
        type: 'checkbox',
        checked: data?.settings.enabled ?? false,
        disabled: !data || busy,
        onChange: (e) => {
            void save(e.target.checked, data?.settings.timeoutMinutes ?? 15);
        },
    }), copy.enabled), h('p', null, h('label', null, copy.timeout, ' ', h('input', {
        type: 'number',
        min: 1,
        max: 60,
        value: minutes,
        disabled: busy,
        onChange: (e) => setMinutes(e.target.value),
    })), h('button', {
        disabled: !data ||
            busy ||
            !Number.isInteger(Number(minutes)) ||
            Number(minutes) < 1 ||
            Number(minutes) > 60,
        onClick: () => {
            void save(data?.settings.enabled ?? false, Number(minutes));
        },
    }, copy.save), data && h('small', null, ` ${data.settings.timeoutMinutes} min`)), h('h3', null, copy.history), data?.records.length
        ? h('ul', null, data.records
            .slice(0, 5)
            .map((row) => h('li', { key: row.id }, `${new Date(row.at).toLocaleString(locale)} · ${row.mode} · ${row.status} · ${row.exitCode ?? '—'} · ${Math.round(row.elapsedMs / 1000)}s`, h('p', null, row.task), h('small', null, row.cwd), h('pre', null, row.files.join('\n')), h('code', null, row.logPath))))
        : h('p', null, copy.empty));
}
//# sourceMappingURL=codex.js.map