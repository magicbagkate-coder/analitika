import { getKyivHourMinute, kyivWallTimeToUtc, startOfKyivDayUtc } from '../kyiv-time';
import { CLOSING_CUTOFF_HOUR, SECOND_TOUCH_START_HOUR, TOUCH_TAG_FIRST, TOUCH_TAG_SECOND, TOUCH_WINDOW_END_HOUR, TOUCH_WINDOW_START_HOUR } from './touch.constants';

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/** 09:00 up to (not including) 23:00 Kyiv time. */
export function isInsideTouchWindow(now: Date): boolean {
  const { hour } = getKyivHourMinute(now);
  return hour >= TOUCH_WINDOW_START_HOUR && hour < TOUCH_WINDOW_END_HOUR;
}

/** The statistics tag of a touch made at `now`: before 16:00 Kyiv time the first, from 16:00 the second. */
export function getTouchTag(now: Date): string {
  return getKyivHourMinute(now).hour < SECOND_TOUCH_START_HOUR ? TOUCH_TAG_FIRST : TOUCH_TAG_SECOND;
}

/** 22:00 Kyiv time of the day before `now`'s Kyiv day — the morning pass closes everything older than this. */
export function getClosingCutoff(now: Date): Date {
  const todayStart = startOfKyivDayUtc(now);
  const yesterdayStart = startOfKyivDayUtc(new Date(todayStart.getTime() - HALF_DAY_MS));
  return kyivWallTimeToUtc({ dayStartUtc: yesterdayStart, hour: CLOSING_CUTOFF_HOUR, minute: 0 });
}
