import { isInsideMessagingWindow } from './messaging-window';

const NOW = new Date('2026-11-26T10:00:00.000Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3600_000);

describe('isInsideMessagingWindow', () => {
  it('allows Instagram and Facebook within the week', () => {
    expect(isInsideMessagingWindow({ initialSource: 'instagram', lastClientAt: hoursAgo(159.5), now: NOW })).toBe(true);
    expect(isInsideMessagingWindow({ initialSource: 'facebook', lastClientAt: hoursAgo(20), now: NOW })).toBe(true);
  });

  it('refuses them after the week, with a margin (the 168.2 h chat was refused by Meta)', () => {
    expect(isInsideMessagingWindow({ initialSource: 'instagram', lastClientAt: hoursAgo(168.2), now: NOW })).toBe(false);
    expect(isInsideMessagingWindow({ initialSource: 'facebook', lastClientAt: hoursAgo(165), now: NOW })).toBe(false);
  });

  it('has no limit on Telegram and Viber', () => {
    expect(isInsideMessagingWindow({ initialSource: 'telegram_private', lastClientAt: hoursAgo(481), now: NOW })).toBe(true);
    expect(isInsideMessagingWindow({ initialSource: 'viber_private', lastClientAt: hoursAgo(1.6), now: NOW })).toBe(true);
  });

  it('counts a client message nowhere in sight as too old on Instagram', () => {
    expect(isInsideMessagingWindow({ initialSource: 'instagram', lastClientAt: null, now: NOW })).toBe(false);
  });
});
