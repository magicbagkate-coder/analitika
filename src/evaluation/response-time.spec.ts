import { calculateReplyIntervals, calculateResponseTimes, toResponseTimeStats } from './response-time';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

function kyiv(dateStr: string, h: number, m: number, s = 0): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCHours(h - 3, m, s, 0);
  return d.toISOString();
}

function msg(id: string, sentBy: string, managerName: string | undefined, dateStr: string, h: number, m: number, s = 0): ChatMessage {
  return { id, sentBy, managerName, text: 'text', createdAt: kyiv(dateStr, h, m, s), isViewedByUser: true };
}

// Sitniks gives messages newest-first — every fixture below is written in that order intentionally.
describe('calculateResponseTimes', () => {
  it('returns empty stats for no messages', () => {
    expect(calculateResponseTimes([])).toEqual({ intervalsMinutes: [], medianMinutes: null });
  });

  it('returns empty stats when only the manager ever wrote (no client message to answer)', () => {
    const messages = [msg('1', 'mgr', 'Аня', '2026-09-18', 10, 0)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [], medianMinutes: null });
  });

  it('computes a normal same-day gap in minutes', () => {
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-18', 10, 5), msg('1', 'client', undefined, '2026-09-18', 10, 0)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [5], medianMinutes: 5 });
  });

  it('excludes the closed 00:00-08:00 Kyiv window from an overnight gap', () => {
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-19', 8, 5), msg('1', 'client', undefined, '2026-09-18', 23, 50)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [15], medianMinutes: 15 });
  });

  it('excludes closed hours across a multi-day gap', () => {
    // Monday 20:00 -> Wednesday 09:00: 4h (Mon) + 16h (Tue) + 1h (Wed) = 21h = 1260 min.
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-16', 9, 0), msg('1', 'client', undefined, '2026-09-14', 20, 0)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [1260], medianMinutes: 1260 });
  });

  it('counts a reply inside the same minute as 0, not as missing data (2026-09-18 bug)', () => {
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-18', 10, 0, 20), msg('1', 'client', undefined, '2026-09-18', 10, 0, 0)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [0], medianMinutes: 0 });
  });

  it('treats a manager reply that clock-skews slightly earlier than the client message as 0, not negative', () => {
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-18', 10, 0, 1), msg('1', 'client', undefined, '2026-09-18', 10, 0, 2)];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [0], medianMinutes: 0 });
  });

  it('ignores the Instagram auto-bot (same sentBy as the account, no managerName)', () => {
    const messages: ChatMessage[] = [
      { id: '3', sentBy: 'acct1', managerName: 'Аня', text: 'real reply', createdAt: kyiv('2026-09-18', 10, 10), isViewedByUser: true },
      { id: '2', sentBy: 'acct1', managerName: undefined, text: 'bot auto-reply', createdAt: kyiv('2026-09-18', 10, 1), isViewedByUser: true },
      { id: '1', sentBy: 'client', managerName: undefined, text: 'hi', createdAt: kyiv('2026-09-18', 10, 0), isViewedByUser: true },
    ];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [10], medianMinutes: 10 });
  });

  it('measures from the last of several consecutive client messages, not the first', () => {
    const messages = [
      msg('3', 'mgr', 'Аня', '2026-09-18', 10, 20),
      msg('2', 'client', undefined, '2026-09-18', 10, 15),
      msg('1', 'client', undefined, '2026-09-18', 10, 0),
    ];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [5], medianMinutes: 5 });
  });

  it('only counts the first manager reply after a client message, not a follow-up reply with no new client message', () => {
    const messages = [
      msg('3', 'mgr', 'Аня', '2026-09-18', 10, 15),
      msg('2', 'mgr', 'Аня', '2026-09-18', 10, 5),
      msg('1', 'client', undefined, '2026-09-18', 10, 0),
    ];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [5], medianMinutes: 5 });
  });

  it('computes the median across several intervals in one chat', () => {
    const messages = [
      msg('6', 'mgr', 'Аня', '2026-09-18', 12, 2),
      msg('5', 'client', undefined, '2026-09-18', 12, 0),
      msg('4', 'mgr', 'Аня', '2026-09-18', 11, 20),
      msg('3', 'client', undefined, '2026-09-18', 11, 0),
      msg('2', 'mgr', 'Аня', '2026-09-18', 10, 3),
      msg('1', 'client', undefined, '2026-09-18', 10, 0),
    ];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [3, 20, 2], medianMinutes: 3 });
  });

  it('handles two different managers replying to two different client messages in one chat', () => {
    const messages = [
      msg('4', 'mgr2', 'Оля', '2026-09-18', 11, 8),
      msg('3', 'client', undefined, '2026-09-18', 11, 0),
      msg('2', 'mgr1', 'Аня', '2026-09-18', 10, 4),
      msg('1', 'client', undefined, '2026-09-18', 10, 0),
    ];
    expect(calculateResponseTimes(messages)).toEqual({ intervalsMinutes: [4, 8], medianMinutes: 6 });
  });
});

describe('calculateReplyIntervals', () => {
  it('attributes each reply to the manager who gave it, by message id', () => {
    const messages = [
      msg('4', 'mgr2', 'Оля', '2026-09-18', 11, 8),
      msg('3', 'client', undefined, '2026-09-18', 11, 0),
      msg('2', 'mgr1', 'Аня', '2026-09-18', 10, 4),
      msg('1', 'client', undefined, '2026-09-18', 10, 0),
    ];

    const replies = calculateReplyIntervals(messages);

    expect(replies.map((reply) => [reply.messageId, reply.managerName, reply.minutes])).toEqual([
      ['2', 'Аня', 4],
      ['4', 'Оля', 8],
    ]);
  });

  it('resolves a short-name alias to the canonical manager name, so one person is never split in two', () => {
    const messages = [msg('2', 'mgr', 'Ольга', '2026-09-18', 10, 5), msg('1', 'client', undefined, '2026-09-18', 10, 0)];
    expect(calculateReplyIntervals(messages)[0].managerName).toBe('Ольга Шульц');
  });

  it('keeps the exact instants of the wait, and fractional minutes', () => {
    const messages = [msg('2', 'mgr', 'Аня', '2026-09-18', 10, 0, 30), msg('1', 'client', undefined, '2026-09-18', 10, 0, 0)];

    const [reply] = calculateReplyIntervals(messages);

    expect(reply.clientMessageAt.toISOString()).toBe(kyiv('2026-09-18', 10, 0, 0));
    expect(reply.repliedAt.toISOString()).toBe(kyiv('2026-09-18', 10, 0, 30));
    expect(reply.minutes).toBeCloseTo(0.5, 5);
  });

  it('returns nothing when no manager ever answered a client message', () => {
    expect(calculateReplyIntervals([msg('1', 'client', undefined, '2026-09-18', 10, 0)])).toEqual([]);
  });
});

describe('toResponseTimeStats', () => {
  it('rounds each interval to whole minutes and takes the median', () => {
    const stats = toResponseTimeStats([
      { messageId: '1', managerName: 'Аня', clientMessageAt: new Date(0), repliedAt: new Date(0), minutes: 2.4 },
      { messageId: '2', managerName: 'Аня', clientMessageAt: new Date(0), repliedAt: new Date(0), minutes: 9.6 },
      { messageId: '3', managerName: 'Оля', clientMessageAt: new Date(0), repliedAt: new Date(0), minutes: 4.5 },
    ]);
    expect(stats).toEqual({ intervalsMinutes: [2, 10, 5], medianMinutes: 5 });
  });

  it('is empty for no intervals', () => {
    expect(toResponseTimeStats([])).toEqual({ intervalsMinutes: [], medianMinutes: null });
  });
});
