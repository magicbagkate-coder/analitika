import { weekIndexOf } from './manager-trends.constants';

describe('weekIndexOf', () => {
  const now = new Date('2026-09-18T00:00:00.000Z');

  it('is 0 for something recorded within the last 7 days', () => {
    const recordedAt = new Date('2026-09-15T00:00:00.000Z');
    expect(weekIndexOf(recordedAt, now)).toBe(0);
  });

  it('is 1 for something recorded 8-14 days ago', () => {
    const recordedAt = new Date('2026-09-10T00:00:00.000Z');
    expect(weekIndexOf(recordedAt, now)).toBe(1);
  });

  it('is 4 for something recorded right at the 5-week lookback boundary', () => {
    const recordedAt = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    expect(weekIndexOf(recordedAt, now)).toBe(4);
  });
});
