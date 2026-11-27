/** Touch window (owner, 2026-11-20): touches go out from 09:00 until 23:00 Kyiv time, every day. */
export const TOUCH_WINDOW_START_HOUR = 9;
export const TOUCH_WINDOW_END_HOUR = 23;

/** Morning pass (owner, 2026-11-25): at 08:00 Kyiv the previous day is closed out. */
export const MORNING_PASS_HOUR = 8;
/** Chats whose last message came before 22:00 of the previous day are closed in the morning. */
export const CLOSING_CUTOFF_HOUR = 22;

/** A chat whose last message is older than this is not touched — the morning pass closes it instead. */
export const MAX_TOUCH_AGE_HOURS = 24;

/**
 * Statuses with their own rules (owner, 2026-11-27): the test status is never counted and never needs approval; a client
 * in the new-bot status is touched but never moved to the closed status in the morning.
 */
export const TEST_STATUS = 'ТЕСТ КАТЯ';
export const NEW_BOT_STATUS = 'Новий БОТ';

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

/** Tags that count the touches for the statistics (owner, 2026-11-27): a touch before 16:00 is the first, from 16:00 the second. */
/** A chat that got a touch gets no second one for this long, whatever else says so (owner, 2026-11-27: "никому два раза"). */
export const DOUBLE_TOUCH_WINDOW_HOURS = 24;

export const TOUCH_TAG_FIRST = 'касание 1';
export const TOUCH_TAG_SECOND = 'касание 2';
export const SECOND_TOUCH_START_HOUR = 16;
