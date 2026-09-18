import { startOfKyivDayUtc } from '../kyiv-time';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const CLOSED_WINDOW_MINUTES = 8 * 60; // store is closed 00:00-08:00 Kyiv
const DAY_MINUTES = 24 * 60;

export type ResponseTimeStats = { intervalsMinutes: number[]; medianMinutes: number | null };

const EMPTY_STATS: ResponseTimeStats = { intervalsMinutes: [], medianMinutes: null };

/**
 * How long the client actually waited for each manager reply, in open-hours minutes — the store is
 * closed 00:00-08:00 Kyiv, and an overnight gap shouldn't read as an hours-long delay. Only counts
 * a real client message as the "trigger": an automated Instagram-bot auto-reply (see
 * transcript-formatter.ts for the same sentBy-matching trick) neither starts nor resets the wait,
 * since it isn't staff responding and the client didn't have to wait for it.
 */
export function calculateResponseTimes(messages: ChatMessage[]): ResponseTimeStats {
  const chronological = [...messages].reverse(); // Sitniks gives newest-first
  const accountSentBy = chronological.find((message) => message.managerName)?.sentBy;

  const intervalsMinutes: number[] = [];
  let pendingClientMessageAt: Date | null = null;

  for (const message of chronological) {
    const kind = classify(message, accountSentBy);
    if (kind === 'client') {
      pendingClientMessageAt = new Date(message.createdAt);
      continue;
    }
    if (kind === 'manager' && pendingClientMessageAt) {
      const minutes = Math.round(openMinutesBetween(pendingClientMessageAt, new Date(message.createdAt)));
      if (minutes > 0) intervalsMinutes.push(minutes);
      pendingClientMessageAt = null;
    }
  }

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
