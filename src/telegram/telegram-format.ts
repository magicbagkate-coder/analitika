import type { ResponseTimeStats } from '../evaluation/response-time';

/**
 * Telegram's HTML parse_mode rejects a raw &, < or > anywhere outside an actual tag — dynamic
 * content (Claude's text, client nicknames, manager names from Sitniks) must be escaped before
 * going into a template; only literal <b>/</b> markup written directly in code stays unescaped.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
