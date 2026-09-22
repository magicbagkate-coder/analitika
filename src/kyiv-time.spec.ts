import { formatKyivDayMonth, getKyivHourMinute, getKyivWeekday, kyivWallTimeToUtc, startOfKyivDayUtc } from './kyiv-time';

describe('getKyivHourMinute', () => {
  it('converts a UTC instant to Kyiv local hour/minute (UTC+3 in September)', () => {
    expect(getKyivHourMinute(new Date('2026-09-18T12:45:00.000Z'))).toEqual({ hour: 15, minute: 45 });
  });

  it('wraps midnight correctly instead of returning hour 24', () => {
    expect(getKyivHourMinute(new Date('2026-09-17T21:00:00.000Z'))).toEqual({ hour: 0, minute: 0 });
  });
});

describe('startOfKyivDayUtc', () => {
  it('returns the UTC instant of 00:00 Kyiv on the same Kyiv calendar day', () => {
    // 2026-09-18 12:45 UTC is 2026-09-18 15:45 Kyiv, so Kyiv midnight that day is 2026-09-17 21:00 UTC.
    const result = startOfKyivDayUtc(new Date('2026-09-18T12:45:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-17T21:00:00.000Z');
  });

  it('stays on the same Kyiv day for a time just after Kyiv midnight', () => {
    // 2026-09-18 00:30 Kyiv = 2026-09-17 21:30 UTC; Kyiv midnight for that day is still 2026-09-17 21:00 UTC.
    const result = startOfKyivDayUtc(new Date('2026-09-17T21:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-17T21:00:00.000Z');
  });
});

describe('getKyivWeekday', () => {
  it('returns a weekday number in the valid JS range', () => {
    const weekday = getKyivWeekday();
    expect(weekday).toBeGreaterThanOrEqual(0);
    expect(weekday).toBeLessThanOrEqual(6);
  });
});

describe('kyivWallTimeToUtc', () => {
  it('converts a Kyiv wall time to UTC in summer (UTC+3)', () => {
    const dayStartUtc = new Date('2026-09-17T21:00:00.000Z');
    expect(kyivWallTimeToUtc({ dayStartUtc, hour: 15, minute: 45 }).toISOString()).toBe('2026-09-18T12:45:00.000Z');
  });

  it('stays correct on the day the clocks go back (2026-10-25), when midnight is UTC+3 but the afternoon is UTC+2', () => {
    const dayStartUtc = startOfKyivDayUtc(new Date('2026-10-25T12:00:00.000Z'));
    expect(kyivWallTimeToUtc({ dayStartUtc, hour: 15, minute: 45 }).toISOString()).toBe('2026-10-25T13:45:00.000Z');
  });
});

describe('formatKyivDayMonth', () => {
  it('uses the Kyiv calendar day, not the UTC one', () => {
    // 22:30 UTC on the 17th is already 01:30 on the 18th in Kyiv.
    expect(formatKyivDayMonth(new Date('2026-09-17T22:30:00.000Z'))).toBe('18.09');
  });
});
