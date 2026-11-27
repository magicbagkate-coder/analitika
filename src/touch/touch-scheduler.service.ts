import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { formatKyivDateKey, getKyivHourMinute } from '../kyiv-time';
import { ReportRunStatusService } from '../report-run-status/report-run-status.service';
import { TelegramService } from '../telegram/telegram.service';
import { CLOCK_CHECK_MS, MORNING_PASS_HOUR, TICK_INTERVAL_MS } from './touch.constants';
import { formatTouchError } from './touch-messages';
import { TouchApprovalService } from './touch-approval.service';
import { TouchForceService } from './touch-force.service';
import { TouchMorningService } from './touch-morning.service';
import { TouchTickService } from './touch-tick.service';

/**
 * The only clock of the touch bot. With TOUCH_MODE unset ("off") it starts nothing at all. Otherwise: the 08:00
 * morning pass once a day (Kyiv time, every day — the shop has no days off), and the 10-minute check the rest of
 * the time. Never two at once, and the check yields while the twice-daily report runs (contractor's rule,
 * 2026-09-16: no second timer on the Sitniks API during the report). See schedule.md.
 */
@Injectable()
export class TouchSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TouchSchedulerService.name);
  private running = false;
  private lastTickAt = 0;
  private lastMorningDay: string | null = null;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly reportRunStatusService: ReportRunStatusService,
    private readonly touchTickService: TouchTickService,
    private readonly touchMorningService: TouchMorningService,
    private readonly touchApprovalService: TouchApprovalService,
    private readonly touchForceService: TouchForceService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    const mode = this.appConfig.getTouchMode();
    if (mode === 'off') {
      this.logger.log('Touch bot is off (TOUCH_MODE is not set to dry-run or live) — nothing is scheduled');
      return;
    }
    this.logger.log(`Touch bot starts in "${mode}" mode, target statuses "${this.appConfig.getTouchTargetStatuses().join(', ')}"`);
    this.touchApprovalService.startListening({ onForce: (attemptId) => this.touchForceService.forceTouch(attemptId) });
    setInterval(() => {
      this.checkClock().catch((error) => this.logger.error(`Touch clock failed: ${(error as Error).message}`));
    }, CLOCK_CHECK_MS);
  }

  private async checkClock(): Promise<void> {
    if (this.running) return;

    const dayKey = formatKyivDateKey(new Date());
    if (getKyivHourMinute().hour === MORNING_PASS_HOUR && this.lastMorningDay !== dayKey) {
      this.lastMorningDay = dayKey;
      await this.runGuarded('Утренний разбор', () => this.touchMorningService.runMorningPass());
      return;
    }
    if (Date.now() - this.lastTickAt < TICK_INTERVAL_MS) return;
    if (this.reportRunStatusService.isBusy()) {
      this.logger.log('Skipping the touch check — the twice-daily report is running');
      return;
    }
    this.lastTickAt = Date.now();
    await this.runGuarded('Проверка касаний', () => this.touchTickService.runTick());
  }

  /** A failed run must not stop the clock, and the owner should hear about it. */
  private async runGuarded(title: string, job: () => Promise<void>): Promise<void> {
    this.running = true;
    try {
      await job();
    } catch (error) {
      const message = `${title}: ${(error as Error).message}`;
      this.logger.error(message);
      await this.telegramService.sendOwnerMessage(formatTouchError(message)).catch(() => undefined);
    } finally {
      this.running = false;
    }
  }
}
