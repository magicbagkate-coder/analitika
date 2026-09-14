const KYIV_TIME_ZONE = 'Europe/Kyiv';

/** Exact Kyiv-local times (24h) the report schedulers fire at — checked to the minute, not just the hour. */
export const REPORT_TIMES = [
  { hour: 15, minute: 45 },
  { hour: 23, minute: 45 },
];

/**
 * Current hour/minute in Kyiv time, regardless of the host machine's own timezone — the process
 * may run on a Windows dev machine set to Kyiv time, or a UTC-configured VPS, and REPORT_TIMES
 * above is always meant as Kyiv local time either way.
 */
export function getKyivHourMinute(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TIME_ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  // hour12: false can format midnight as "24" instead of "0" in some engines/locales — normalize.
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/**
 * Only evaluate chats quiet for at least this long (hours, fractional allowed) —
 * long enough to judge whether the manager actually followed through, short
 * enough to actually catch something given the ~hourly touch cadence on
 * "Вибір товару" (see the touch-schedule rules).
 */
export const QUIET_HOURS_BEFORE_EVALUATING = 1.5;
