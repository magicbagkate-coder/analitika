import { escapeHtml } from '../telegram/telegram-format';
import type { ManagerCharacteristic } from '../claude/claude-manager-summary.service';

// Conservative margin under Telegram's hard 4096-char cap — leaves room for the title/emoji
// overhead so a chunk never needs mid-block truncation (which would cut an HTML tag in half and
// get the whole message rejected, see the 2026-09-16 incident this guards against).
const TELEGRAM_MESSAGE_LIMIT = 3500;

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

function chunkIntoMessages(title: string, blocks: string[]): string[] {
  const messages: string[] = [];
  let current: string[] = [title];
  let currentLength = title.length;

  for (const block of blocks) {
    if (currentLength + block.length + 2 > TELEGRAM_MESSAGE_LIMIT && current.length > 1) {
      messages.push(current.join('\n\n'));
      current = [];
      currentLength = 0;
    }
    current.push(block);
    currentLength += block.length + 2;
  }
  if (current.length > 0) messages.push(current.join('\n\n'));

  return messages;
}

function formatOneManager(characteristic: ManagerCharacteristic): string {
  const header = `<b>${escapeHtml(characteristic.managerName)}</b> — ${characteristic.score}/5`;
  if (characteristic.recurringIssues.length === 0) return header;

  const issueLines = characteristic.recurringIssues.map((issue) => `• ${escapeHtml(issue)}`);
  return [header, ...issueLines].join('\n');
}
