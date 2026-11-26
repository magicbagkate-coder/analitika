const DAY_MS = 24 * 60 * 60 * 1000;
// Meta lets a page write to a client for 7 days after the client's last message; the margin keeps a send from
// landing on the very edge (a chat at 168.2 h was refused with a 400, 2026-11-26).
const META_WINDOW_MS = 7 * DAY_MS - 6 * 60 * 60 * 1000;
const META_SOURCES = ['instagram', 'facebook'];

/**
 * Can the shop still write to this client? Instagram and Facebook only allow it within 7 days of the client's
 * last message; other channels (Telegram, Viber) have no such limit. A client message nowhere in the messages
 * we read counts as too old on those two channels.
 */
export function isInsideMessagingWindow(params: { initialSource: string | undefined; lastClientAt: Date | null; now: Date }): boolean {
  const isMeta = META_SOURCES.some((source) => params.initialSource?.startsWith(source));
  if (!isMeta) return true;
  return params.lastClientAt !== null && params.now.getTime() - params.lastClientAt.getTime() <= META_WINDOW_MS;
}
