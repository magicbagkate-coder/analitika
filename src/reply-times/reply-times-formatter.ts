import { escapeHtml } from '../telegram/telegram-format';
import { formatShiftWindow } from './shift-window';
import type { ManagerReplySpeed, ShiftWindow } from './reply-times.types';

/** "4,2" — one decimal, comma, as it is read in Russian text. */
function formatMinutes(minutes: number): string {
  return minutes.toFixed(1).replace('.', ',');
}

/**
 * Own standalone Telegram message after the full report (owner's instruction, 2026-09-21): average
 * reply time per manager for the shift. '' (send nothing) if nobody replied in the shift.
 */
export function formatShiftSpeedBlock(window: ShiftWindow, speeds: ManagerReplySpeed[]): string {
  if (speeds.length === 0) return '';

  const lines = speeds.map((speed) => `• <b>${escapeHtml(speed.managerName)}</b> — в среднем ${formatMinutes(speed.averageMinutes)} хв (ответов: ${speed.replies})`);
  return [`⏱<b>Скорость ответа менеджеров за смену</b> (${formatShiftWindow(window)})`, lines.join('\n')].join('\n\n');
}
