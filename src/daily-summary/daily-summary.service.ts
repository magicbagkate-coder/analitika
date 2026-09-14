import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DailyStatsStoreService } from '../daily-stats-store/daily-stats-store.service';
import { TelegramService } from '../telegram/telegram.service';
import type { ManagerDailyStats } from '../daily-stats-store/daily-stats-store.types';

const REPORTS_DIR = join(process.cwd(), 'reports');
const SUMMARY_HOUR = 23;
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * End-of-day per-manager summary: written to a local text file and sent to
 * Telegram. Checks the clock once a minute with plain setInterval (no
 * scheduler package) and fires once per day at SUMMARY_HOUR:00.
 */
@Injectable()
export class DailySummaryService implements OnModuleInit {
  private readonly logger = new Logger(DailySummaryService.name);
  private lastRunDate: string | null = null;

  constructor(
    private readonly dailyStatsStoreService: DailyStatsStoreService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.checkAndRun().catch((error) => this.logger.error(`Daily summary failed: ${(error as Error).message}`));
    }, CHECK_INTERVAL_MS);
  }

  private async checkAndRun(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() !== SUMMARY_HOUR || this.lastRunDate === today) return;

    this.lastRunDate = today;
    await this.writeDailySummary();
  }

  private async writeDailySummary(): Promise<void> {
    const stats = this.dailyStatsStoreService.buildSummaryAndClear();
    if (stats.length === 0) {
      this.logger.log('No evaluations today, skipping summary file');
      return;
    }

    const filePath = await this.writeSummaryFile(stats);
    this.logger.log(`Daily summary written to ${filePath}`);
    await this.trySendToTelegram(this.formatSummary(stats));
  }

  /** Telegram isn't configured yet on every deployment — don't let that break the file report. */
  private async trySendToTelegram(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send daily summary to Telegram: ${(error as Error).message}`);
    }
  }

  private async writeSummaryFile(stats: ManagerDailyStats[]): Promise<string> {
    await mkdir(REPORTS_DIR, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const filePath = join(REPORTS_DIR, `summary-${today}.txt`);
    await writeFile(filePath, this.formatSummary(stats), 'utf-8');

    return filePath;
  }

  private formatSummary(stats: ManagerDailyStats[]): string {
    const lines = stats.map(
      (stat) => `${stat.managerName}: ${stat.chatsEvaluated} чатів, середня оцінка ${stat.averageScore}/5`,
    );
    return ['Підсумок дня — оцінка чатів', ...lines].join('\n');
  }
}
