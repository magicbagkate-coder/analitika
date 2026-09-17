import { Logger } from '@nestjs/common';
import { TelegramService } from './telegram/telegram.service';

const WATCHDOG_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Runs `work` to actual completion (doesn't move on early), but if it hasn't settled within
 * WATCHDOG_TIMEOUT_MS, sends one Telegram warning so a stuck report is never silently discovered
 * hours later (see project memory, 2026-09-14 — two real overnight hangs where a report run simply
 * never came back, no error, nothing).
 *
 * Previous version (2026-09-15 incident) raced `work` against the timeout via `Promise.race` and
 * returned as soon as EITHER settled — meaning after the 10-minute alert fired, the caller (e.g.
 * ReportSchedulerService.runBoth) moved on to the NEXT step while `work` kept running orphaned in
 * the background with only a `.finally()` attached. If that orphaned `work` later rejected, nothing
 * had a `.catch` on it — an unhandled rejection that crashed the entire Node process (Node 15+
 * terminates by default), which also killed whatever the next step was doing mid-flight. Fixed by
 * always `await`-ing `work` itself for the real result; the timer only ever sends a heads-up, it
 * never lets the caller proceed early or substitutes for the real outcome.
 */
export async function runWithWatchdog(work: Promise<void>, label: string, telegramService: TelegramService, logger: Logger): Promise<void> {
  const timer = setTimeout(() => {
    const minutes = WATCHDOG_TIMEOUT_MS / 60_000;
    logger.error(`${label} is still running after ${minutes} minutes — likely stuck`);
    telegramService
      .sendMessage(`⚠️<b>${label}</b> выполняется дольше ${minutes} минут — похоже, завис. Стоит проверить сервер вручную.`)
      .catch(() => {});
  }, WATCHDOG_TIMEOUT_MS);

  try {
    await work;
  } finally {
    clearTimeout(timer);
  }
}
