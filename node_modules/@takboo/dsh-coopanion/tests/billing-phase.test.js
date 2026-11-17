import { describe, expect, it } from 'vitest';
import { billingPhase, billingPhaseAt, billingCountdown, billingBeijingTime } from '../web/billing-phase.js';

const utc = value => new Date(value);

describe('DeepSeek official API peak/off-peak billing times', () => {
  it('switches at exact Beijing weekday boundaries, independent of desktop timezone', () => {
    expect(billingPhaseAt(utc('2026-11-16T00:59:59Z'))).toBe('offpeak'); // Mon 08:59:59
    expect(billingPhaseAt(utc('2026-11-16T01:00:00Z'))).toBe('peak'); // Mon 09:00
    expect(billingPhaseAt(utc('2026-11-16T04:00:00Z'))).toBe('offpeak'); // Mon 12:00
    expect(billingPhaseAt(utc('2026-11-16T06:00:00Z'))).toBe('peak'); // Mon 14:00
    expect(billingPhaseAt(utc('2026-11-16T10:00:00Z'))).toBe('offpeak'); // Mon 18:00
    expect(billingPhase(utc('2026-11-16T00:59:00Z')).nextAt.toISOString()).toBe('2026-11-16T01:00:00.000Z');
    expect(billingPhase(utc('2026-11-16T01:00:00Z')).nextAt.toISOString()).toBe('2026-11-16T04:00:00.000Z');
  });

  it('does not invent weekend peak time, including makeup workdays', () => {
    expect(billingPhaseAt(utc('2026-11-14T02:00:00Z'))).toBe('offpeak');
    expect(billingPhase(utc('2026-11-13T10:00:00Z')).nextAt.toISOString()).toBe('2026-11-16T01:00:00.000Z');
    expect(billingPhaseAt(utc('2027-05-08T02:00:00Z'))).toBe('offpeak'); // Sat makeup workday
  });

  it('skips statutory holidays when finding the next peak', () => {
    expect(billingPhaseAt(utc('2026-10-02T02:00:00Z'))).toBe('offpeak');
    expect(billingPhase(utc('2026-09-30T10:00:00Z')).nextAt.toISOString()).toBe('2026-10-08T01:00:00.000Z');
    expect(billingPhaseAt(utc('2027-02-09T02:00:00Z'))).toBe('offpeak');
    expect(billingPhase(utc('2027-02-04T10:00:00Z')).nextAt.toISOString()).toBe('2027-02-15T01:00:00.000Z');
    expect(billingPhaseAt(utc('2027-09-15T02:00:00Z'))).toBe('offpeak');
  });

  it('avoids guessing holiday rules outside the published years', () => {
    expect(billingPhaseAt(utc('2028-04-04T02:00:00Z'))).toBe('unknown');
    expect(billingPhase(utc('2028-04-04T02:00:00Z')).nextAt).toBeNull();
  });

  it('formats countdown and Beijing date', () => {
    expect(billingCountdown(60_000)).toBe('1m');
    expect(billingCountdown(2 * 60 * 60_000 + 1)).toBe('2h 1m');
    expect(billingCountdown(27 * 60 * 60_000)).toBe('1d 3h');
    expect(billingCountdown(2 * 60 * 60_000 + 1, 'zh')).toBe('2小时1分');
    expect(billingBeijingTime(utc('2026-11-16T01:00:00Z'))).toBe('2026-11-16 09:00');
  });
});
