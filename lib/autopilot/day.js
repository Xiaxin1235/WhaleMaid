/** Calendar-day key in the host user's local timezone; never a rolling 24-hour budget. */
export function localDay(at) {
    const date = new Date(at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
//# sourceMappingURL=day.js.map