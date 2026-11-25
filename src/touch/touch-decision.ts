import { isInsideTouchWindow } from './touch-time';
import { MAX_TOUCH_AGE_HOURS } from './touch.constants';
import type { ChatTouchFacts } from './touch-chat-facts';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type TouchDecisionInput = {
  facts: ChatTouchFacts;
  /** "regular": the 10-minute check with the hour of waiting. "morning": the 08:00 pass for yesterday's leftovers. */
  pass: 'regular' | 'morning';
  now: Date;
  waitMinutes: number;
  readSeenAt: Date | null;
  /** A touch went out and the client has not written since. */
  hasUnansweredTouch: boolean;
};

/**
 * touch: send it now. start-waiting: the client has just been seen as having read it, so the hour starts now.
 * wait: not yet (the hour has not passed or the touch window is closed). ignore: this chat gets no touch.
 */
export type TouchDecision = 'touch' | 'start-waiting' | 'wait' | 'ignore';

function isEligible(input: TouchDecisionInput): boolean {
  if (input.hasUnansweredTouch) return false;
  if (input.facts.lastParty !== 'manager' || !input.facts.anchorIsRead) return false;
  const lastMessageAt = input.facts.lastMessageAt;
  return lastMessageAt !== null && input.now.getTime() - lastMessageAt.getTime() <= MAX_TOUCH_AGE_HOURS * HOUR_MS;
}

/**
 * Owner's rules (2026-11-20 / 2026-11-25): touch only after a manager's message that the client has read and
 * not answered, an hour after the bot first saw it read, from 09:00 to 23:00. In the morning pass the hour and
 * the window do not apply — those chats waited all night.
 */
export function decideTouch(input: TouchDecisionInput): TouchDecision {
  if (!isEligible(input)) return 'ignore';
  if (input.pass === 'morning') return 'touch';
  if (input.readSeenAt === null) return 'start-waiting';
  if (!isInsideTouchWindow(input.now)) return 'wait';
  return input.now.getTime() - input.readSeenAt.getTime() >= input.waitMinutes * MINUTE_MS ? 'touch' : 'wait';
}
