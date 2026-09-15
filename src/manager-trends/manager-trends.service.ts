import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeTrendsService } from '../claude/claude-trends.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { getKyivHourMinute, getKyivWeekday } from '../kyiv-time';
import { runWithWatchdog } from '../report-watchdog';
import { TelegramService } from '../telegram/telegram.service';
import { formatWeeklyDigest } from './manager-trends-formatter';
import { MIN_WEEKS_FOR_TREND, TREND_LOOKBACK_WEEKS, WEEKLY_DIGEST_TIME, weekIndexOf } from './manager-trends.constants';
import type { ScoreTrend } from './manager-trends.types';
import type { EvaluationHistoryEntity } from '../evaluation-history/evaluation-history.entity';

const CHECK_INTERVAL_MS = 60 * 1000;

type WeeklyBucket = { scores: number[]; notes: string[] };

/**
 * Once a week (WEEKLY_DIGEST_TIME, Kyiv), looks at "Вибір товару" evaluation history from the last
 * TREND_LOOKBACK_WEEKS rolling 7-day buckets and reports what a single twice-daily report can't
 * show: a manager's score rising/falling several weeks running, or one specific mistake repeating
 * across weeks (see ClaudeTrendsService). Deliberately excludes "Замовлення створено" scores —
 * those are a deterministic upsell flag (4 or 5), a different scale that would distort a quality trend.
 */
@Injectable()
export class ManagerTrendsService implements OnModuleInit {
  private readonly logger = new Logger(ManagerTrendsService.name);
  private lastRunKey: string | null = null;

  constructor(
    private readonly evaluationHistoryService: EvaluationHistoryService,
    private readonly claudeTrendsService: ClaudeTrendsService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.checkAndRun().catch((error) => this.logger.error(`Weekly digest failed: ${(error as Error).message}`));
    }, CHECK_INTERVAL_MS);
  }

  private async checkAndRun(): Promise<void> {
    const weekday = getKyivWeekday();
    const { hour, minute } = getKyivHourMinute();
    const isDigestTime = weekday === WEEKLY_DIGEST_TIME.dayOfWeek && hour === WEEKLY_DIGEST_TIME.hour && minute === WEEKLY_DIGEST_TIME.minute;
    const runKey = `${new Date().toISOString().slice(0, 10)}T${hour}:${minute}`;
    if (!isDigestTime || this.lastRunKey === runKey) return;

    this.lastRunKey = runKey;
    await runWithWatchdog(this.runDigest(), 'Еженедельная сводка по менеджерам', this.telegramService, this.logger);
  }

  /** Public so a one-off script can invoke the exact production run without waiting for Monday. */
  async runDigest(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - TREND_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000);
    const rows = await this.evaluationHistoryService.findSince(cutoff);
    const productSelectionRows = rows.filter((row) => row.source === 'product_selection');

    const byManager = this.groupByManagerAndWeek(productSelectionRows, now);
    const trends = this.computeTrends(byManager);
    const recurringIssues = await this.trySynthesizeRecurringIssues(byManager);

    const digest = formatWeeklyDigest(trends, recurringIssues);
    if (digest.length === 0) {
      this.logger.log('Weekly digest: nothing notable this week, not sending');
      return;
    }

    await this.trySend(digest);
  }

  private groupByManagerAndWeek(rows: EvaluationHistoryEntity[], now: Date): Map<string, Map<number, WeeklyBucket>> {
    const byManager = new Map<string, Map<number, WeeklyBucket>>();

    for (const row of rows) {
      const weekIndex = weekIndexOf(row.recordedAt, now);
      for (const managerName of row.managerNames) {
        const weeks = byManager.get(managerName) ?? new Map<number, WeeklyBucket>();
        const bucket = weeks.get(weekIndex) ?? { scores: [], notes: [] };
        bucket.scores.push(row.score);
        bucket.notes.push(row.note);
        weeks.set(weekIndex, bucket);
        byManager.set(managerName, weeks);
      }
    }

    return byManager;
  }

  /** Strictly rising or falling across the most recent consecutive weeks with data, oldest to newest. */
  private computeTrends(byManager: Map<string, Map<number, WeeklyBucket>>): ScoreTrend[] {
    const trends: ScoreTrend[] = [];

    for (const [managerName, weeks] of byManager) {
      const averages: number[] = [];
      for (let weekIndex = 0; weekIndex < TREND_LOOKBACK_WEEKS; weekIndex += 1) {
        const bucket = weeks.get(weekIndex);
        if (!bucket) break;
        averages.unshift(this.average(bucket.scores));
      }

      const trend = this.detectTrend(managerName, averages);
      if (trend) trends.push(trend);
    }

    return trends;
  }

  private detectTrend(managerName: string, weeklyAveragesOldestFirst: number[]): ScoreTrend | null {
    if (weeklyAveragesOldestFirst.length < MIN_WEEKS_FOR_TREND) return null;

    const recent = weeklyAveragesOldestFirst.slice(-MIN_WEEKS_FOR_TREND);
    const isRising = recent.every((value, index) => index === 0 || value > recent[index - 1]);
    const isFalling = recent.every((value, index) => index === 0 || value < recent[index - 1]);
    if (!isRising && !isFalling) return null;

    return {
      managerName,
      direction: isRising ? 'rising' : 'falling',
      weeksInARow: recent.length,
      weeklyAverages: recent,
    };
  }

  private average(scores: number[]): number {
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /** A synthesis-call hiccup shouldn't drop the score-trend half of the digest. */
  private async trySynthesizeRecurringIssues(byManager: Map<string, Map<number, WeeklyBucket>>): Promise<string> {
    const managers = Array.from(byManager.entries())
      .map(([managerName, weeks]) => ({
        managerName,
        weeks: Array.from(weeks.entries()).map(([weekIndex, bucket]) => ({ weekIndex, notes: bucket.notes })),
      }))
      .filter((manager) => manager.weeks.length >= MIN_WEEKS_FOR_TREND - 1);

    try {
      return await this.claudeTrendsService.synthesizeRecurringIssues(managers);
    } catch (error) {
      this.logger.warn(`Could not synthesize recurring issues: ${(error as Error).message}`);
      return '';
    }
  }

  private async trySend(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send weekly digest to Telegram: ${(error as Error).message}`);
    }
  }
}
