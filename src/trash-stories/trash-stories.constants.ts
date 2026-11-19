import type { TrashStoryStatus } from './trash-stories.types';

/**
 * Owner's choice (2026-11-19): "Трэш истории" are looked for in exactly these three statuses. Returns and
 * service requests are judged whenever they have a new message; "Вибір товару" holds hundreds of
 * ordinary sales chats, so there a chat only reaches Claude after the free keyword pre-filter below.
 */
export const TRASH_STORY_STATUSES: TrashStoryStatus[] = [
  { name: 'Повернення', needsKeyword: false },
  { name: 'Сервісне звернення', needsKeyword: false },
  { name: 'Вибір товару', needsKeyword: true },
];

/** Chats whose last message is older than this are not looked at — keeps the first run from reading months of history. */
export const TRASH_LOOKBACK_HOURS = 72;

/**
 * Free pre-filter for "Вибір товару" only, checked on the client's messages before any Claude call.
 * Deliberately over-inclusive: a false hit costs one Claude call, a miss loses a story.
 */
export const TRASH_KEYWORDS: string[] = [
  'поверн',
  'возврат',
  'верніть',
  'верните',
  'повернут',
  'брак',
  'не шкір',
  'не кожан',
  'некожан',
  'шкірзам',
  'кожзам',
  'розріз',
  'порізан',
  'порез',
  'зламан',
  'сломан',
  'підпал',
  'поджиг',
  'претензі',
  'скарг',
  'скарж',
  'жалоб',
  'пожалу',
  'обман',
  'шахра',
  'мошен',
  'захист прав',
  'защит',
  'прокурат',
  'поліці',
  'полиц',
  'суд',
  'кошти назад',
  'гроші назад',
  'деньги назад',
];

/** Prefix of the tag holding the id of the newest message a chat was already judged against. */
const CHECKED_MESSAGE_TAG_PREFIX = 'trash-msg-';

export function hasTrashSignal(texts: string[]): boolean {
  return texts.some((text) => TRASH_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword)));
}

/** A chat is judged again only when a message newer than the one it was last judged against has arrived. */
export function needsTrashCheck(tags: string[], latestMessageId: string): boolean {
  return !tags.includes(buildTrashCheckedTag(latestMessageId));
}

export function buildTrashCheckedTag(messageId: string): string {
  return `${CHECKED_MESSAGE_TAG_PREFIX}${messageId}`;
}

/** Strips any earlier marker, ready to have a fresh one appended — keeps tags from piling up. */
export function withoutTrashCheckedTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith(CHECKED_MESSAGE_TAG_PREFIX));
}
