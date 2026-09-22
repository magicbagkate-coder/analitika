import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { withHardTimeout } from '../claude/anthropic-client';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { getKyivHourMinute } from '../kyiv-time';
import { ManagerCharacteristicsService } from '../manager-characteristics/manager-characteristics.service';
import { OrderSuccessAnalysisService } from '../order-success-analysis/order-success-analysis.service';
import { formatShiftSpeedBlock } from '../reply-times/reply-times-formatter';
import { ReplyTimesService } from '../reply-times/reply-times.service';
import { getShiftWindow } from '../reply-times/shift-window';
import { ReportRunStatusService } from '../report-run-status/report-run-status.service';
import { runWithWatchdog } from '../report-watchdog';
import { REPORT_TIMES } from '../status-report/status-report.constants';
import { StatusReportService } from '../status-report/status-report.service';
import { TelegramService } from '../telegram/telegram.service';

const CHECK_INTERVAL_MS = 60 * 1000;
const PROGRESS_PING_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Single clock for both twice-daily reports plus the combined manager characteristic that follows
 * them. Owner's explicit instruction (2026-09-15): the three must run strictly back to back, not in
 * parallel — "Замовлення створено" completes fully, THEN "Вибір товару", THEN the per-manager
 * summary reads what both just wrote to evaluation_history — so nothing interleaves in the Telegram
 * group and everything reliably lands together, twice a day. Each still gets its own watchdog (see
 * report-watchdog.ts), so one stalling doesn't silently take the others down with it.
 *
 * Contractor's rule (2026-09-16): while this runs, ReportRunStatusService marks the whole app "busy"
 * so ConflictWatcherService's independent 10-minute timer skips its cycle entirely — the two hitting
 * the same Sitniks API at once caused a confirmed 429 collision (2026-09-15). Also sends one
 * "started" notice and an hourly progress ping (chats recorded so far) so a long run — the backlog
 * was 233 chats on 2026-09-16 — reads as "still working", not silence.
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
    private readonly reportRunStatusService: ReportRunStatusService,
    private readonly evaluationHistoryService: EvaluationHistoryService,
    private readonly replyTimesService: ReplyTimesService,
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
    this.reportRunStatusService.start();
    await this.trySend('🔄<b>Начинаем формирование отчёта</b> (Замовлення створено → Вибір товару → Характеристика менеджерів)...');

    const progressTimer = setInterval(() => {
      this.sendProgressPing(runStartedAt).catch((error) => this.logger.warn(`Progress ping failed: ${(error as Error).message}`));
    }, PROGRESS_PING_INTERVAL_MS);

    let reportCompleted = false;
    try {
      await runWithWatchdog(this.orderSuccessAnalysisService.runAnalysis(), 'Анализ "Замовлення створено"', this.telegramService, this.logger);
      await runWithWatchdog(this.statusReportService.runReport(), 'Отчёт "Вибір товару"', this.telegramService, this.logger);
      await runWithWatchdog(
        this.managerCharacteristicsService.runSummary(runStartedAt),
        'Характеристика менеджеров',
        this.telegramService,
        this.logger,
      );
      reportCompleted = true;
      const elapsedMinutes = Math.round((Date.now() - runStartedAt.getTime()) / 60_000);
      this.logger.log(`Report run finished cleanly, started ${runStartedAt.toISOString()}, took ${elapsedMinutes} min`);
      await this.trySend(`✅<b>Отчёт полностью сформирован</b> (${elapsedMinutes} мин).`);
    } finally {
      clearInterval(progressTimer);
      this.reportRunStatusService.finish();
      // Owner's instruction (2026-09-21): reply times are saved only after the report is out, and
      // not awaited — a stalled DB must never hold up anything here.
      void this.saveReplyTimes({ runStartedAt, sendShiftSpeed: reportCompleted });
    }
  }

  /**
   * Saves the replies queued during the run, then — only after a fully clean report — sends the
   * per-manager speed for the shift as its own message. Never throws: it runs unawaited.
   */
  private async saveReplyTimes(params: { runStartedAt: Date; sendShiftSpeed: boolean }): Promise<void> {
    try {
      await this.replyTimesService.flush();
      if (params.sendShiftSpeed) await this.sendShiftSpeed(params.runStartedAt);
    } catch (error) {
      this.logger.warn(`Could not save or report reply times: ${(error as Error).message}`);
    }
  }

  /** Windowed by the run START, not the moment this is sent — a long run must not slide into the next shift. */
  private async sendShiftSpeed(runStartedAt: Date): Promise<void> {
    const window = getShiftWindow(runStartedAt);
    const speeds = await withHardTimeout(this.replyTimesService.findSpeedByManager(window), 'ReplyTimesService.findSpeedByManager');
    const block = formatShiftSpeedBlock(window, speeds);
    if (block.length > 0) await this.trySend(block);
  }

  /** Calmer than the per-step watchdog alert — a routine "still working" heads-up, not "looks stuck". */
  private async sendProgressPing(runStartedAt: Date): Promise<void> {
    const rows = await this.evaluationHistoryService.findSince(runStartedAt);
    const elapsedMinutes = Math.round((Date.now() - runStartedAt.getTime()) / 60_000);
    await this.trySend(`⏳<b>Отчёт всё ещё формируется</b> (идёт уже ${elapsedMinutes} мин, обработано чатов: ${rows.length}) — это нормально при большом числе чатов, не ошибка.`);
  }

  private async trySend(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send status message: ${(error as Error).message}`);
    }
  }
}
