// DeepSeek official API pricing windows: Asia/Shanghai (UTC+08:00),
// weekdays 09:00-12:00 and 14:00-18:00, excluding Chinese public holidays.
// Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
// Holiday ranges: PRC State Council 2026 (2025 No.7) and 2027 (2026 No.10).
// Makeup working weekends are still off-peak under DeepSeek's weekend rule.
const HOLIDAYS = {
  2026: [
    ['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
    ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'],
    ['10-01', '10-07'],
  ],
  2027: [
    ['01-01', '01-03'], ['02-05', '02-13'], ['04-03', '04-05'],
    ['05-01', '05-05'], ['06-09', '06-09'], ['09-15', '09-15'],
    ['10-01', '10-07'],
  ],
};
const CST_MS = 8 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const stamp = value => String(value).padStart(2, '0');

/** The phase is independent of the desktop's own timezone. */
export function billingPhaseAt(instant) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  const cn = new Date(date.getTime() + CST_MS);
  const year = cn.getUTCFullYear();
  if (!Object.hasOwn(HOLIDAYS, year)) return 'unknown';
  const weekday = cn.getUTCDay();
  if (weekday === 0 || weekday === 6) return 'offpeak';
  const day = `${stamp(cn.getUTCMonth() + 1)}-${stamp(cn.getUTCDate())}`;
  if (HOLIDAYS[year].some(([start, end]) => day >= start && day <= end)) return 'offpeak';
  const minute = cn.getUTCHours() * 60 + cn.getUTCMinutes();
  return (minute >= 9 * 60 && minute < 12 * 60) ||
    (minute >= 14 * 60 && minute < 18 * 60) ? 'peak' : 'offpeak';
}

/** Find an actual phase change, skipping weekends and multi-day holidays. */
export function billingPhase(instant = new Date()) {
  const date = new Date(instant);
  const phase = billingPhaseAt(date);
  if (phase === 'unknown') return { phase, nextAt: null, remainingMs: null };
  const now = date.getTime();
  const cn = new Date(now + CST_MS);
  const midnightCstAsUtc = Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate());
  for (let offset = 0; offset < 21; offset++) {
    for (const hour of [9, 12, 14, 18]) {
      const at = midnightCstAsUtc + offset * 24 * 60 * MINUTE_MS + hour * 60 * MINUTE_MS - CST_MS;
      if (at <= now) continue;
      const nextAt = new Date(at);
      if (billingPhaseAt(nextAt) !== phase && billingPhaseAt(nextAt) !== 'unknown') {
        return { phase, nextAt, remainingMs: at - now };
      }
    }
  }
  return { phase, nextAt: null, remainingMs: null };
}

export function billingCountdown(ms, language = 'en') {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const totalMinutes = Math.ceil(ms / MINUTE_MS);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (language === 'zh') {
    if (days) return `${days}天${hours}小时`;
    if (hours) return `${hours}小时${minutes}分`;
    return `${minutes}分`;
  }
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function billingBeijingTime(instant) {
  const cn = new Date(new Date(instant).getTime() + CST_MS);
  return `${cn.getUTCFullYear()}-${stamp(cn.getUTCMonth() + 1)}-${stamp(cn.getUTCDate())} ${stamp(cn.getUTCHours())}:${stamp(cn.getUTCMinutes())}`;
}
