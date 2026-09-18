const KYIV_TIME_ZONE = 'Europe/Kyiv';

/**
 * Hour/minute in Kyiv time for the given instant (current time by default), regardless of the host
 * machine's own timezone — the process may run on a Windows dev machine set to Kyiv time, or a
 * UTC-configured VPS, and any fixed schedule or timestamp in this project is always meant as Kyiv
 * local time either way.
 */
export function getKyivHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  // hour12: false can format midnight as "24" instead of "0" in some engines/locales — normalize.
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/**
 * The UTC instant of 00:00 Kyiv time on the same Kyiv calendar day as `date` — lets callers walk
 * day-by-day in Kyiv local time (see response-time.ts, which excludes the 00:00-08:00 closed window
 * from elapsed time) without assuming a fixed UTC offset. The offset is derived fresh from `date`
 * itself, so it stays correct across whatever DST-style transition Kyiv observes in a given year.
 */
export function startOfKyivDayUtc(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const wallAsUtcMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const kyivOffsetMs = wallAsUtcMs - date.getTime();
  const midnightWallAsUtcMs = Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0);
  return new Date(midnightWallAsUtcMs - kyivOffsetMs);
}

/** Current weekday in Kyiv time, JS convention (0 = Sunday .. 6 = Saturday), host-timezone independent. */
export function getKyivWeekday(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');
  // Reconstructed as UTC midnight for that Kyiv calendar date — only the weekday is used.
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
