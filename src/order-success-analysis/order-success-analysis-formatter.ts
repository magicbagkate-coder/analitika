import { escapeHtml, formatManagerNames, formatResponseTimesLine } from '../telegram/telegram-format';
import type { OrderSuccessOutcome } from './order-success-analysis.types';

type ManagerDealStats = { managerName: string; dealsCount: number };

/** Telegram HTML parse_mode — same emoji + bold + blank-line style as status-report-formatter. */
export function formatSuccessBlock(outcome: OrderSuccessOutcome): string {
  const managers = formatManagerNames(outcome.managerNames);
  const responseTimeLine = formatResponseTimesLine(outcome.responseTimes);
  return [
    `✅<b>${escapeHtml(outcome.clientName)}</b> (${managers}) — Оценка: ${outcome.score}/5`,
    `🏆<b>Що спрацювало:</b> ${escapeHtml(outcome.successFactors)}`,
    ...(responseTimeLine ? [responseTimeLine] : []),
  ].join('\n\n');
}

export function formatSuccessSummary(outcomes: OrderSuccessOutcome[]): string {
  const upsellCount = outcomes.filter((outcome) => outcome.score === 5).length;
  const managerLines = groupByManager(outcomes).map(
    (stat) => `${escapeHtml(stat.managerName)}: ${stat.dealsCount} ${pluralizeDeals(stat.dealsCount)}`,
  );
  return [
    `⚡<b>ІТОГ:</b> ${outcomes.length} успішних угод, з них ${upsellCount} з допродажем (5/5)`,
    managerLines.join('\n'),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

/** A chat with 2 managers counts toward both — matches groupByManager in status-report-formatter. */
function groupByManager(outcomes: OrderSuccessOutcome[]): ManagerDealStats[] {
  const byManager = new Map<string, number>();
  for (const outcome of outcomes) {
    for (const managerName of outcome.managerNames) {
      byManager.set(managerName, (byManager.get(managerName) ?? 0) + 1);
    }
  }

  return Array.from(byManager.entries()).map(([managerName, dealsCount]) => ({ managerName, dealsCount }));
}

/** Russian noun agreement for "угода": 1 угода, 2-4 угоди, 5+ угод (with the 11-14 exception). */
function pluralizeDeals(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'угода';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'угоди';
  return 'угод';
}

/**
 * Own standalone Telegram message, same convention as status-report's formatAttentionBlock —
 * owner's instruction (2026-09-14): a "what systemically leads to deals" block for this status too.
 * Returns '' (send nothing) if there's no repeating pattern this run.
 */
export function formatSuccessAttentionBlock(reportTime: string, totalDeals: number, patterns: string): string {
  if (patterns.length === 0) return '';

  const header = `🧭<b>Що системно веде до угод (звіт ${reportTime}, ${totalDeals} угод):</b>`;
  return [header, `💥<b>Повторювані дії, що спрацьовують:</b> ${escapeHtml(patterns)}`].join('\n\n');
}
