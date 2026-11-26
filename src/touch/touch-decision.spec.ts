import { decideTouch, type TouchDecisionInput } from './touch-decision';

// 12:00 Kyiv on 25.11.2026 (UTC+2).
const NOON = new Date('2026-11-25T10:00:00.000Z');

function input(overrides: Partial<TouchDecisionInput> = {}): TouchDecisionInput {
  return {
    facts: { lastParty: 'manager', anchorMessageId: 'm1', anchorIsRead: true, lastClientAt: null, lastMessageAt: new Date('2026-11-25T08:30:00.000Z') },
    pass: 'regular',
    now: NOON,
    waitMinutes: 60,
    readSeenAt: new Date('2026-11-25T08:50:00.000Z'),
    hasUnansweredTouch: false,
    initialSource: 'telegram_private',
    ...overrides,
  };
}

describe('decideTouch', () => {
  it('touches an hour after the read was first seen', () => {
    expect(decideTouch(input())).toBe('touch');
  });

  it('waits while the hour has not passed', () => {
    expect(decideTouch(input({ readSeenAt: new Date('2026-11-25T09:30:00.000Z') }))).toBe('wait');
  });

  it('starts waiting when the read has just been seen', () => {
    expect(decideTouch(input({ readSeenAt: null }))).toBe('start-waiting');
  });

  it('ignores a chat where the client has not read the message', () => {
    expect(decideTouch(input({ facts: { ...input().facts, anchorIsRead: false } }))).toBe('ignore');
  });

  it('ignores a chat where the client wrote last, or nobody did', () => {
    expect(decideTouch(input({ facts: { ...input().facts, lastParty: 'client', anchorMessageId: null, anchorIsRead: false } }))).toBe('ignore');
    expect(decideTouch(input({ facts: { ...input().facts, lastParty: 'none', anchorMessageId: null, anchorIsRead: false } }))).toBe('ignore');
  });

  it('never touches twice: a touch already waits for the client\'s answer', () => {
    expect(decideTouch(input({ hasUnansweredTouch: true }))).toBe('ignore');
  });

  it('waits outside the 09:00-23:00 window even when the hour has passed', () => {
    expect(decideTouch(input({ now: new Date('2026-11-25T21:30:00.000Z'), readSeenAt: new Date('2026-11-25T08:50:00.000Z') }))).toBe('wait');
  });

  it('ignores a chat whose last message is older than a day', () => {
    const facts = { ...input().facts, lastMessageAt: new Date('2026-11-24T08:00:00.000Z') };
    expect(decideTouch(input({ facts }))).toBe('ignore');
  });

  it('ignores an Instagram client who last wrote more than a week ago (Meta refuses it)', () => {
    const facts = { ...input().facts, lastClientAt: new Date(NOON.getTime() - 169 * 3600_000) };
    expect(decideTouch(input({ facts, initialSource: 'instagram' }))).toBe('ignore');
    expect(decideTouch(input({ facts, initialSource: 'telegram_private' }))).toBe('touch');
  });

  it('in the morning pass touches at once, without the hour or the window', () => {
    const early = new Date('2026-11-25T06:05:00.000Z'); // 08:05 Kyiv
    const facts = { ...input().facts, lastMessageAt: new Date('2026-11-24T21:40:00.000Z') };
    expect(decideTouch(input({ pass: 'morning', now: early, readSeenAt: null, facts }))).toBe('touch');
  });
});
