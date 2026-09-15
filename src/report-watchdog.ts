import { Logger } from '@nestjs/common';
import { TelegramService } from './telegram/telegram.service';

const WATCHDOG_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Runs `work`, but if it hasn't settled within WATCHDOG_TIMEOUT_MS, sends one Telegram warning
 * so a stuck report is never silently discovered hours later (see project memory, 2026-09-14 —
 * two real overnight hangs where a report run simply never came back, no error, nothing). Doesn't
 * cancel `work` — it keeps running in the background and will still send its own messages
 * whenever/if it eventually resolves; this only adds a prompt heads-up that something is off.
 */
export async function runWithWatchdog(work: Promise<void>, label: string, telegramService: TelegramService, logger: Logger): Promise<void> {
  let settled = false;
  work.finally(() => {
    settled = true;
  });

  const watchdog = new Promise<void>((resolve) => {
    setTimeout(() => {
      if (settled) {
        resolve();
        return;
      }
      const minutes = WATCHDOG_TIMEOUT_MS / 60_000;
      logger.error(`${label} is still running after ${minutes} minutes — likely stuck`);
      telegramService
        .sendMessage(`⚠️<b>${label}</b> выполняется дольше ${minutes} минут — похоже, завис. Стоит проверить сервер вручную.`)
        .catch(() => {});
      resolve();
    }, WATCHDOG_TIMEOUT_MS);
  });

  await Promise.race([work, watchdog]);
}
