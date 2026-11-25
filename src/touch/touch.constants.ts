/** Touch window (owner, 2026-11-20): touches go out from 09:00 until 23:00 Kyiv time, every day. */
export const TOUCH_WINDOW_START_HOUR = 9;
export const TOUCH_WINDOW_END_HOUR = 23;

/** Morning pass (owner, 2026-11-25): at 08:00 Kyiv the previous day is closed out. */
export const MORNING_PASS_HOUR = 8;
/** Chats whose last message came before 22:00 of the previous day are closed in the morning. */
export const CLOSING_CUTOFF_HOUR = 22;

/** A chat whose last message is older than this is not touched — the morning pass closes it instead. */
export const MAX_TOUCH_AGE_HOURS = 24;

/** The owner approves this many touches by hand, then "поставим на поток" (2026-11-20). */
export const APPROVED_TOUCHES_REQUIRED = 30;

export const TICK_INTERVAL_MS = 10 * 60 * 1000;
export const CLOCK_CHECK_MS = 60 * 1000;
export const DELAY_BETWEEN_REQUESTS_MS = 1500;
/** The message follows the video right away (owner, 2026-11-25): only a breath between them. */
export const MESSAGE_GAP_MS = 1000;
/** Sitniks creates the video message only after it has fetched the file; the chat is watched this long, this often. */
export const VIDEO_CONFIRM_MS = 90_000;
export const VIDEO_CONFIRM_INTERVAL_MS = 3000;
export const CHAT_PAGE_SIZE = 50;
export const NOTES_TO_READ = 30;
export const MESSAGES_TO_READ = 50;
