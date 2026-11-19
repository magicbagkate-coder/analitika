import type { ResponseTimeStats } from '../evaluation/response-time';

/**
 * Telegram's HTML parse_mode rejects a raw &, < or > anywhere outside an actual tag — dynamic
 * content (Claude's text, client nicknames, manager names from Sitniks) must be escaped before
 * going into a template; only literal <b>/</b> markup written directly in code stays unescaped.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Conservative margin under Telegram's hard 4096-char cap — leaves room for the title/emoji
// overhead so a chunk never needs mid-block truncation (which would cut an HTML tag in half and
// get the whole message rejected, see the 2026-09-16 incident this guards against).
const TELEGRAM_MESSAGE_LIMIT = 3500;

/** Packs titled blocks into as few messages as fit, splitting only at block boundaries (never mid-HTML). */
export function chunkIntoMessages(title: string, blocks: string[]): string[] {
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

/** "Молодший / Касатель" — chronological, or "менеджер невідомий" if Sitniks gave no names at all. */
export function formatManagerNames(managerNames: string[]): string {
  if (managerNames.length === 0) return 'менеджер невідомий';

  return managerNames.map((name) => escapeHtml(name)).join(' / ');
}

/**
 * "⏱ Ответы менеджера: 5 хв, 12 хв, 3 хв (медіана — 5 хв)" — owner's approved format, shared by
 * status-report-formatter.ts and order-success-analysis-formatter.ts. Empty if unmeasurable (no
 * manager reply followed a real client message in this chat).
 */
export function formatResponseTimesLine(responseTimes: ResponseTimeStats): string {
  if (responseTimes.intervalsMinutes.length === 0 || responseTimes.medianMinutes === null) return '';

  const intervals = responseTimes.intervalsMinutes.map((minutes) => `${minutes} хв`).join(', ');
  return `⏱ Ответы менеджера: ${intervals} (медіана — ${responseTimes.medianMinutes} хв)`;
}
