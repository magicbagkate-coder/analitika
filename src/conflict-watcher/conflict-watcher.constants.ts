/**
 * Cheap free pre-filter on raw client message text, checked before any Claude call — owner's rule
 * (2026-09-15): an explicit client conflict must be reported immediately, not wait for the
 * twice-daily report. Deliberately over-inclusive (false positives just cost one extra Claude
 * verification call, see ConflictWatcherService) — missing a real conflict is the worse failure.
 */
export const CONFLICT_KEYWORDS: string[] = [
  'зупиніться',
  'зупинись',
  'досить',
  'не пишіть',
  'не пиши',
  'перестань',
  "нав'язлив",
  'навязчив',
  'бомбит',
  'бомбите',
  'скрипт',
  'скарг',
  'скарж',
  'скрін',
  'скриншот',
  'скрин',
  'скриншо',
  'жалоб',
  'пожалу',
  'заблокую',
  'заблокирую',
  'блокир',
  'поліці',
  'полиц',
  'достал',
  'заманал',
  'дратує',
  'бесит',
  'бісить',
  'токсич',
  'хамств',
  'грубо',
  'тролін',
  'тролл',
];

/** Prefix for the tag tracking which client message already triggered an alert (see needsConflictAlert). */
const ALERTED_MESSAGE_TAG_PREFIX = 'conflict-alert-msg-';

export function hasConflictSignal(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CONFLICT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/** A chat needs a fresh alert if this exact client message hasn't already triggered one. */
export function needsConflictAlert(tags: string[], latestMessageId: string): boolean {
  return !tags.includes(`${ALERTED_MESSAGE_TAG_PREFIX}${latestMessageId}`);
}

export function buildConflictAlertTag(messageId: string): string {
  return `${ALERTED_MESSAGE_TAG_PREFIX}${messageId}`;
}

/** Strips any previous alert tag, ready to have a fresh one appended — keeps tags from piling up. */
export function withoutConflictAlertTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith(ALERTED_MESSAGE_TAG_PREFIX));
}
