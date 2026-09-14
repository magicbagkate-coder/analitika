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
