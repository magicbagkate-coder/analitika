import { CHAT_LINK_LABEL, CHAT_MARKER_PATTERN, SITNIKS_CHAT_URL_BASE } from './chat-link.constants';

/** A clickable piece of a cell: where it starts in the plain text, how long it is and where it leads. */
export type CellLink = { start: number; length: number; url: string };
export type LinkedCellText = { text: string; links: CellLink[] };

export function buildChatUrl(chatId: string): string {
  return `${SITNIKS_CHAT_URL_BASE}${chatId}`;
}

/** Telegram gets no links (owner's wish, 2026-11-13): the markers are removed and the text stays as it was. */
export function stripChatMarkers(text: string): string {
  return text.replace(CHAT_MARKER_PATTERN, '').replace(/ {2,}/g, ' ').trim();
}

/** Spreadsheet cell: markers become the plain label, and the label positions are returned for rich-text links. */
export function splitSheetLinks(text: string): LinkedCellText {
  const links: CellLink[] = [];
  let plain = '';
  let cursor = 0;
  for (const match of text.matchAll(CHAT_MARKER_PATTERN)) {
    plain += text.slice(cursor, match.index);
    links.push({ start: plain.length, length: CHAT_LINK_LABEL.length, url: buildChatUrl(match[1]) });
    plain += CHAT_LINK_LABEL;
    cursor = (match.index ?? 0) + match[0].length;
  }
  return { text: plain + text.slice(cursor), links };
}
