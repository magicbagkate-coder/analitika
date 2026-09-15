import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getKyivHourMinute } from '../kyiv-time';
import { ManagerCharacteristicsService } from '../manager-characteristics/manager-characteristics.service';
import { OrderSuccessAnalysisService } from '../order-success-analysis/order-success-analysis.service';
import { runWithWatchdog } from '../report-watchdog';
import { REPORT_TIMES } from '../status-report/status-report.constants';
import { StatusReportService } from '../status-report/status-report.service';
import { TelegramService } from '../telegram/telegram.service';

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Single clock for both twice-daily reports plus the combined manager characteristic that follows
 * them. Owner's explicit instruction (2026-09-15): the three must run strictly back to back, not in
 * parallel — "Замовлення створено" completes fully, THEN "Вибір товару", THEN the per-manager
 * summary reads what both just wrote to evaluation_history — so nothing interleaves in the Telegram
 * group and everything reliably lands together, twice a day. Each still gets its own watchdog (see
 * report-watchdog.ts), so one stalling doesn't silently take the others down with it.
 */
@Injectable()
export class ReportSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReportSchedulerService.name);
  private lastRunKey: string | null = null;

  constructor(
    private readonly orderSuccessAnalysisService: OrderSuccessAnalysisService,
    private readonly statusReportService: StatusReportService,
    private readonly managerCharacteristicsService: ManagerCharacteristicsService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.checkAndRun().catch((error) => this.logger.error(`Scheduled reports failed: ${(error as Error).message}`));
    }, CHECK_INTERVAL_MS);
  }

  /** Checked against Kyiv time explicitly — the host (dev machine or server) may run in any timezone. */
  private async checkAndRun(): Promise<void> {
    const { hour, minute } = getKyivHourMinute();
    const isReportTime = REPORT_TIMES.some((time) => time.hour === hour && time.minute === minute);
    const runKey = `${new Date().toISOString().slice(0, 10)}T${hour}:${minute}`;
    if (!isReportTime || this.lastRunKey === runKey) return;

    this.lastRunKey = runKey;
    await this.runBoth();
  }

  /** Public so a one-off script can invoke the exact production sequence. */
  async runBoth(): Promise<void> {
    // Captured before either report runs, so ManagerCharacteristicsService's evaluation_history
    // query (findSince) picks up every row either one writes during this run, from both statuses.
    const runStartedAt = new Date();
    await runWithWatchdog(this.orderSuccessAnalysisService.runAnalysis(), 'Анализ "Замовлення створено"', this.telegramService, this.logger);
    await runWithWatchdog(this.statusReportService.runReport(), 'Отчёт "Вибір товару"', this.telegramService, this.logger);
    await runWithWatchdog(
      this.managerCharacteristicsService.runSummary(runStartedAt),
      'Характеристика менеджеров',
      this.telegramService,
      this.logger,
    );
  }
}
