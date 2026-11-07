import { t } from '#whalemaid/core';
export function serviceRows(status, locale) {
    return Object.entries(status.services).map(([name, available]) => ({
        name,
        available,
        text: `${available ? '✓' : '✗'} ${t(locale, available ? 'available' : 'unavailable')}`,
    }));
}
export function formatStartedAt(timestamp, locale) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
//# sourceMappingURL=format.js.map