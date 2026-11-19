import { stripChatMarkers } from '../chat-links/chat-link-render';
import { chunkIntoMessages, escapeHtml } from '../telegram/telegram-format';
import type { ManagerCharacteristic } from '../claude/claude-manager-summary.service';

/**
 * Telegram HTML parse_mode, same emoji + bold style as the rest of the run — worst score first.
 * Returns one or more messages: with enough managers, one combined message can exceed Telegram's
 * 4096-char limit (confirmed live, 2026-09-16, 14 managers with detailed notes) — split at
 * manager-block boundaries instead of truncating mid-text, which would corrupt the HTML markup.
 */
export function formatManagerCharacteristics(characteristics: ManagerCharacteristic[]): string[] {
  if (characteristics.length === 0) return [];

  const sorted = [...characteristics].sort((a, b) => a.score - b.score);
  const blocks = sorted.map((characteristic) => formatOneManager(characteristic));
  const title = '👤<b>Характеристика менеджеров (этот прогон, оба статуса):</b>';

  return chunkIntoMessages(title, blocks);
}

function formatOneManager(characteristic: ManagerCharacteristic): string {
  const header = `<b>${escapeHtml(characteristic.managerName)}</b> — ${characteristic.score}/5`;
  if (characteristic.recurringIssues.length === 0) return header;

  const issueLines = characteristic.recurringIssues.map((issue) => `• ${escapeHtml(stripChatMarkers(issue))}`);
  return [header, ...issueLines].join('\n');
}
