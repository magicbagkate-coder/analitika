import { SCORE_TAG_PREFIX } from '../evaluation/evaluation.constants';

export const ORDER_CREATED_STATUS = 'Замовлення створено';

// Bumped 2026-09-14 when scoring was added — old "успіх-аналіз" tags (no score) must be treated
// as not-yet-analyzed so every chat gets re-run once under the new criteria.
const SUCCESS_TAG = 'успіх-аналіз-v2';
const LAST_ANALYZED_MESSAGE_TAG_PREFIX = 'succ-msg-';

function buildLastAnalyzedMessageTag(messageId: string): string {
  return `${LAST_ANALYZED_MESSAGE_TAG_PREFIX}${messageId}`;
}

function getLastAnalyzedMessageId(tags: string[]): string | null {
  const tag = tags.find((candidate) => candidate.startsWith(LAST_ANALYZED_MESSAGE_TAG_PREFIX));
  return tag ? tag.slice(LAST_ANALYZED_MESSAGE_TAG_PREFIX.length) : null;
}

/**
 * Same re-evaluation rule as evaluation.constants.needsEvaluation, but its own independent marker
 * — а chat that already has an оценка-N tag from "Вибір товару" still needs this module's own
 * pass (the owner confirmed: re-analyze under the new angle, don't skip), so the marker can't be
 * "has an оценка- tag", it has to be this module's own success-analysis tag.
 */
export function needsSuccessAnalysis(tags: string[], latestMessageId: string | undefined): boolean {
  if (!tags.includes(SUCCESS_TAG)) return true;
  if (!latestMessageId) return false;
  return getLastAnalyzedMessageId(tags) !== latestMessageId;
}

/**
 * Once a deal closes, its score becomes "was there an upsell" (5) or not (4) — this replaces
 * whatever оценка-N tag the chat carried from "Вибір товару" (a provisional process score for a
 * still-open deal); the closed-deal outcome is the more relevant number once the order exists.
 */
export function replaceSuccessTags(existingTags: string[], score: number, latestMessageId: string | undefined): string[] {
  const withoutOwnTags = existingTags.filter(
    (tag) => !tag.startsWith(SCORE_TAG_PREFIX) && tag !== SUCCESS_TAG && !tag.startsWith(LAST_ANALYZED_MESSAGE_TAG_PREFIX),
  );
  const freshTags = [...withoutOwnTags, `${SCORE_TAG_PREFIX}${score}`, SUCCESS_TAG];
  return latestMessageId ? [...freshTags, buildLastAnalyzedMessageTag(latestMessageId)] : freshTags;
}
