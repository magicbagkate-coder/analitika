import { formatKyivDayMonth, getKyivHourMinute, kyivWallTimeToUtc, startOfKyivDayUtc } from '../kyiv-time';
import { REPORT_TIMES } from '../status-report/status-report.constants';
import type { ShiftWindow } from './reply-times.types';

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DAYS_TO_LOOK_BACK = 3;

/** Midnights (UTC instants) of today's Kyiv day and the days before it, newest first. */
function recentKyivMidnights(now: Date): Date[] {
  const midnights = [startOfKyivDayUtc(now)];
  for (let day = 1; day < DAYS_TO_LOOK_BACK; day++) {
    // Half a day before a midnight is always inside the previous Kyiv day, even on a clock-change day.
    midnights.push(startOfKyivDayUtc(new Date(midnights[day - 1].getTime() - HALF_DAY_MS)));
  }
  return midnights;
}

/**
 * The shift a report covers: the period between the two most recent scheduled report times (REPORT_TIMES,
 * Kyiv) that are not after `now`. Nominal times rather than the actual run start, so two consecutive
 * shifts never overlap or leave a gap, however long the report itself took.
 */
export function getShiftWindow(now: Date): ShiftWindow {
  const boundaries = recentKyivMidnights(now)
    .flatMap((dayStartUtc) => REPORT_TIMES.map((time) => kyivWallTimeToUtc({ dayStartUtc, hour: time.hour, minute: time.minute })))
    .filter((boundary) => boundary.getTime() <= now.getTime())
    .sort((first, second) => second.getTime() - first.getTime());

  return { until: boundaries[0], since: boundaries[1] };
}

/** "21.09, с 23:45 до 15:45" — Kyiv time, for the header of the shift message. */
export function formatShiftWindow(window: ShiftWindow): string {
  return `${formatKyivDayMonth(window.until)}, с ${formatClock(window.since)} до ${formatClock(window.until)}`;
}

function formatClock(instant: Date): string {
  const { hour, minute } = getKyivHourMinute(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
