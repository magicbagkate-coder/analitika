/**
 * Weekly digest fires once, Kyiv time — Tuesday 10:00 (owner's explicit instruction, 2026-09-14:
 * "анализируй со вторника по вторник по утрам во вторник в 10:00"). dayOfWeek uses JS's
 * Date#getDay() convention (0 = Sunday .. 6 = Saturday), so Tuesday = 2. The rolling 7-day buckets
 * in weekIndexOf() already align to this automatically — firing every Tuesday means bucket 0 is
 * "the Tuesday-to-Tuesday just ended", with no separate week-boundary logic needed.
 */
export const WEEKLY_DIGEST_TIME = { dayOfWeek: 2, hour: 10, minute: 0 };

/** How many trailing 7-day buckets to pull from evaluation_history for the digest. */
export const TREND_LOOKBACK_WEEKS = 5;

/** Minimum consecutive most-recent weeks of data needed before calling something a trend. */
export const MIN_WEEKS_FOR_TREND = 3;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** 0 = the last 7 days, 1 = the 7 days before that, etc. — rolling buckets, not calendar weeks. */
export function weekIndexOf(recordedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - recordedAt.getTime()) / MS_PER_WEEK);
}
