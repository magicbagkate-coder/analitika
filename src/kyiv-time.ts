const KYIV_TIME_ZONE = 'Europe/Kyiv';

/**
 * Current hour/minute in Kyiv time, regardless of the host machine's own timezone — the process
 * may run on a Windows dev machine set to Kyiv time, or a UTC-configured VPS, and any fixed
 * schedule in this project is always meant as Kyiv local time either way.
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
