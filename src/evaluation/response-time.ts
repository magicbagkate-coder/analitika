import { startOfKyivDayUtc } from '../kyiv-time';
import { getCanonicalManagerName } from './manager-roles.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const CLOSED_WINDOW_MINUTES = 8 * 60; // store is closed 00:00-08:00 Kyiv
const DAY_MINUTES = 24 * 60;

export type ResponseTimeStats = { intervalsMinutes: number[]; medianMinutes: number | null };

/** One manager reply to a waiting client message — the unit stored per manager in reply_times. */
export type ReplyInterval = {
  messageId: string;
  managerName: string;
  clientMessageAt: Date;
  repliedAt: Date;
  minutes: number;
};

const EMPTY_STATS: ResponseTimeStats = { intervalsMinutes: [], medianMinutes: null };

/**
 * How long the client actually waited for each manager reply, in open-hours minutes — the store is
 * closed 00:00-08:00 Kyiv, and an overnight gap shouldn't read as an hours-long delay. Only counts
 * a real client message as the "trigger": an automated Instagram-bot auto-reply (see
 * transcript-formatter.ts for the same sentBy-matching trick) neither starts nor resets the wait,
 * since it isn't staff responding and the client didn't have to wait for it.
 */
export function calculateResponseTimes(messages: ChatMessage[]): ResponseTimeStats {
  return toResponseTimeStats(calculateReplyIntervals(messages));
}

/** Each reply keeps WHO gave it — the per-chat median alone can't say whose speed it was. */
export function calculateReplyIntervals(messages: ChatMessage[]): ReplyInterval[] {
  const chronological = [...messages].reverse(); // Sitniks gives newest-first
  const accountSentBy = chronological.find((message) => message.managerName)?.sentBy;

  const intervals: ReplyInterval[] = [];
  let pendingClientMessageAt: Date | null = null;

  for (const message of chronological) {
    const kind = classify(message, accountSentBy);
    if (kind === 'client') {
      pendingClientMessageAt = new Date(message.createdAt);
      continue;
    }
    if (kind === 'manager' && pendingClientMessageAt && message.managerName) {
      // A reply inside the same minute is real, valuable data (the fastest possible service), not
      // noise — dropping it used to hide exactly the managers doing best (found 2026-09-18 on a chat
      // with 5-20 second replies). Sitniks' own timestamps also aren't always strictly monotonic
      // between a client's and a manager's message a moment apart (different clocks), which briefly
      // goes negative and gets zeroed by openMinutesBetween — still a real near-instant reply.
      const repliedAt = new Date(message.createdAt);
      intervals.push({
        messageId: message.id,
        managerName: getCanonicalManagerName(message.managerName),
        clientMessageAt: pendingClientMessageAt,
        repliedAt,
        minutes: openMinutesBetween(pendingClientMessageAt, repliedAt),
      });
      pendingClientMessageAt = null;
    }
  }

  return intervals;
}

export function toResponseTimeStats(intervals: ReplyInterval[]): ResponseTimeStats {
  const intervalsMinutes = intervals.map((interval) => Math.round(interval.minutes));
  return intervalsMinutes.length > 0 ? { intervalsMinutes, medianMinutes: median(intervalsMinutes) } : EMPTY_STATS;
}

function classify(message: ChatMessage, accountSentBy: string | undefined): 'client' | 'manager' | 'bot' {
  if (message.managerName) return 'manager';
  if (accountSentBy && message.sentBy === accountSentBy) return 'bot';
  return 'client';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Elapsed minutes between two instants, with each day's 00:00-08:00 Kyiv closed window subtracted. */
function openMinutesBetween(start: Date, end: Date): number {
  if (end <= start) return 0;

  let closedMinutes = 0;
  let dayStart = startOfKyivDayUtc(start);
  while (dayStart < end) {
    const closedStart = dayStart;
    const closedEnd = new Date(dayStart.getTime() + CLOSED_WINDOW_MINUTES * 60_000);
    const overlapStart = start > closedStart ? start : closedStart;
    const overlapEnd = end < closedEnd ? end : closedEnd;
    if (overlapEnd > overlapStart) closedMinutes += (overlapEnd.getTime() - overlapStart.getTime()) / 60_000;
    dayStart = new Date(dayStart.getTime() + DAY_MINUTES * 60_000);
  }

  const totalMinutes = (end.getTime() - start.getTime()) / 60_000;
  return Math.max(0, totalMinutes - closedMinutes);
}
