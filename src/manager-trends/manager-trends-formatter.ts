import { escapeHtml } from '../telegram/telegram-format';
import type { ScoreTrend } from './manager-trends.types';

/** Telegram HTML parse_mode — same emoji + bold + blank-line style as the other reports. */
export function formatWeeklyDigest(trends: ScoreTrend[], recurringIssues: string): string {
  if (trends.length === 0 && recurringIssues.length === 0) return '';

  const sections = ['📈<b>Еженедельная сводка по менеджерам</b>'];

  const trendLines = trends.map((trend) => formatTrendLine(trend));
  if (trendLines.length > 0) sections.push(['📊<b>Тренды по оценке:</b>', ...trendLines].join('\n'));

  if (recurringIssues.length > 0) {
    sections.push(`🔁<b>Повторяющиеся проблемы:</b>\n${escapeHtml(recurringIssues)}`);
  }

  return sections.join('\n\n');
}

function formatTrendLine(trend: ScoreTrend): string {
  const directionLabel = trend.direction === 'rising' ? 'растёт' : 'падает';
  const scoresPath = trend.weeklyAverages.map((average) => average.toFixed(1)).join(' → ');
  return `${escapeHtml(trend.managerName)}: оценка ${directionLabel} ${trend.weeksInARow} ${pluralizeWeeks(trend.weeksInARow)} подряд (${scoresPath})`;
}

/** Russian noun agreement for "неделя": 1 неделю, 2-4 недели, 5+ недель (with the 11-14 exception). */
function pluralizeWeeks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'неделю';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'недели';
  return 'недель';
}
