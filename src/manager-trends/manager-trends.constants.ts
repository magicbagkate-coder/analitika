/** Weekly digest fires once, Kyiv time — Monday morning, a natural start-of-week moment. */
export const WEEKLY_DIGEST_TIME = { dayOfWeek: 1, hour: 10, minute: 0 };

/** How many trailing 7-day buckets to pull from evaluation_history for the digest. */
export const TREND_LOOKBACK_WEEKS = 5;

/** Minimum consecutive most-recent weeks of data needed before calling something a trend. */
export const MIN_WEEKS_FOR_TREND = 3;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** 0 = the last 7 days, 1 = the 7 days before that, etc. — rolling buckets, not calendar weeks. */
export function weekIndexOf(recordedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - recordedAt.getTime()) / MS_PER_WEEK);
}
