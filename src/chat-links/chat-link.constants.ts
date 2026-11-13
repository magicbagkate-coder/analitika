/** Web address of a Sitniks dialog; 3911 is the owner's account number (she gave a sample link on 2026-09-16). */
export const SITNIKS_CHAT_URL_BASE = 'https://web.sitniks.com/3911/chats/dialog/';

export const CHAT_LINK_LABEL = '(чат)';

/** `[chat:<id>]` — how a text carries its chat until it is shown in Telegram or the spreadsheet. */
export const CHAT_MARKER_PATTERN = /\[chat:([A-Za-z0-9_-]+)\]/g;
