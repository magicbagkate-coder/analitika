import { formatWeeklyDigest } from './manager-trends-formatter';
import type { ScoreTrend } from './manager-trends.types';

describe('formatWeeklyDigest', () => {
  it('returns an empty string when there are no trends and no recurring issues', () => {
    expect(formatWeeklyDigest([], '')).toBe('');
  });

  it('formats a rising trend with the direction word and score path', () => {
    const trend: ScoreTrend = { managerName: 'Аня', direction: 'rising', weeksInARow: 3, weeklyAverages: [3, 3.5, 4.2] };
    const digest = formatWeeklyDigest([trend], '');
    expect(digest).toContain('Аня: оценка растёт 3 недели подряд (3.0 → 3.5 → 4.2)');
  });

  it('formats a falling trend with the correct direction word', () => {
    const trend: ScoreTrend = { managerName: 'Оля', direction: 'falling', weeksInARow: 4, weeklyAverages: [4, 3.5, 3, 2.5] };
    const digest = formatWeeklyDigest([trend], '');
    expect(digest).toContain('падает 4 недели подряд');
  });

  it('pluralizes "неделю" for a single week', () => {
    const trend: ScoreTrend = { managerName: 'Аня', direction: 'rising', weeksInARow: 1, weeklyAverages: [4] };
    expect(formatWeeklyDigest([trend], '')).toContain('1 неделю подряд');
  });

  it('pluralizes "недель" for 5+ weeks', () => {
    const trend: ScoreTrend = { managerName: 'Аня', direction: 'rising', weeksInARow: 5, weeklyAverages: [1, 2, 3, 4, 5] };
    expect(formatWeeklyDigest([trend], '')).toContain('5 недель подряд');
  });

  it('includes the recurring-issues section when present, even with no trends', () => {
    const digest = formatWeeklyDigest([], 'Аня: не знає асортимент, 3 тижні поспіль');
    expect(digest).toContain('Повторяющиеся проблемы');
    expect(digest).toContain('Аня: не знає асортимент');
  });
});
