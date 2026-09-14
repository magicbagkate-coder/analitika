/** Exact local times (24h) StatusReportService fires at — checked to the minute, not just the hour. */
export const REPORT_TIMES = [
  { hour: 15, minute: 45 },
  { hour: 23, minute: 45 },
];

/**
 * Only evaluate chats quiet for at least this long (hours, fractional allowed) —
 * long enough to judge whether the manager actually followed through, short
 * enough to actually catch something given the ~hourly touch cadence on
 * "Вибір товару" (see the touch-schedule rules).
 */
export const QUIET_HOURS_BEFORE_EVALUATING = 1.5;
