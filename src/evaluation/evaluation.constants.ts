import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

/** Status the scoring pipeline evaluates — sales-rubric scoring only makes sense here. */
export const TARGET_STATUS = 'Вибір товару';

/**
 * How much history Claude actually analyzes and how far back manager names are pulled from.
 * "Вибір товару" chats can span months across shift changes — analyzing (or displaying names
 * from) the whole history muddies the score with stale context and bloats the prompt for no
 * benefit; only the current episode matters.
 */
export const ANALYSIS_WINDOW_HOURS = 72;

/** Prefix for the score tag written to a chat once it's been evaluated, e.g. "оценка-3". */
export const SCORE_TAG_PREFIX = 'оценка-';

/** Prefix for the tag tracking which message a chat was last scored against (see needsEvaluation). */
const LAST_EVALUATED_MESSAGE_TAG_PREFIX = 'msg-';

export function hasScoreTag(tags: string[]): boolean {
  return tags.some((tag) => tag.startsWith(SCORE_TAG_PREFIX));
}

export function buildLastEvaluatedMessageTag(messageId: string): string {
  return `${LAST_EVALUATED_MESSAGE_TAG_PREFIX}${messageId}`;
}

/** Strips both tracking tags, ready to have a fresh pair appended. */
export function withoutTrackingTags(tags: string[]): string[] {
  return tags.filter(
    (tag) => !tag.startsWith(SCORE_TAG_PREFIX) && !tag.startsWith(LAST_EVALUATED_MESSAGE_TAG_PREFIX),
  );
}

function getLastEvaluatedMessageId(tags: string[]): string | null {
  const tag = tags.find((candidate) => candidate.startsWith(LAST_EVALUATED_MESSAGE_TAG_PREFIX));
  return tag ? tag.slice(LAST_EVALUATED_MESSAGE_TAG_PREFIX.length) : null;
}

/**
 * A chat needs (re-)evaluation if it was never scored, or the newest message
 * differs from whatever was newest at the last scoring — "Вибір товару"
 * chats get touched repeatedly for days, so a one-time score would go stale.
 */
export function needsEvaluation(tags: string[], latestMessageId: string | undefined): boolean {
  if (!hasScoreTag(tags)) return true;
  if (!latestMessageId) return false;
  return getLastEvaluatedMessageId(tags) !== latestMessageId;
}

/** Messages from the last `hours` only. Falls back to just the newest message if that's empty. */
export function filterToRecentWindow(messages: ChatMessage[], hours: number): ChatMessage[] {
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const recent = messages.filter((message) => new Date(message.createdAt).getTime() >= cutoffMs);
  return recent.length > 0 ? recent : messages.slice(0, 1);
}
