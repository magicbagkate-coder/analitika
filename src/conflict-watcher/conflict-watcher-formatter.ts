import { escapeHtml } from '../telegram/telegram-format';

/** Own standalone Telegram message — deliberately distinct from the twice-daily report's blocks, so it stands out as urgent. */
export function formatConflictAlert(clientName: string, description: string): string {
  return [
    '🚨<b>Конфликт с клиентом — прямо сейчас</b>',
    `<b>${escapeHtml(clientName)}</b>`,
    escapeHtml(description),
  ].join('\n\n');
}
