import { TARGET_STATUS } from '../evaluation/evaluation.constants';
import { escapeHtml, formatManagerNames, formatResponseTimesLine } from '../telegram/telegram-format';
import type { PatternSynthesisResult } from '../evaluation/evaluation.types';
import type { ChatOutcome } from './status-report.types';

const TOP_CHATS_COUNT = 3;
const ALL_SCORE_VALUES = [5, 4, 3, 2, 1];

type ManagerStats = { managerName: string; chatsEvaluated: number; averageScore: number };

/** Telegram HTML parse_mode — emoji + bold labels, blank line between blocks, per the owner's approved mock-up. */
export function formatChatBlock(outcome: ChatOutcome): string {
  const lostFlag = outcome.isLost ? '🔴 <b>ПОТЕРЯНО</b> — ' : '';
  const conflictFlag = outcome.clientConflict ? '⚠️ <b>КОНФЛИКТ С КЛИЕНТОМ</b> — ' : '';
  const closingIcon = outcome.purchased ? '✅' : '‼️';
  const closingLabel = outcome.purchased ? 'Клиента закрыли' : 'Клиента не закрыли';
  const managers = formatManagerNames(outcome.managerNames);
  const responseTimeLine = formatResponseTimesLine(outcome.responseTimes);
  return [
    `${lostFlag}${conflictFlag}⚡<b>${escapeHtml(outcome.clientName)}</b> (${managers}) — Оценка: ${outcome.score}/5`,
    `✔️<b>Что хорошо:</b> ${escapeHtml(outcome.goodPoints)}`,
    `${closingIcon}<b>${closingLabel}:</b> ${escapeHtml(outcome.closingSummary)}`,
    `❌<b>Ошибки менеджера:</b> ${escapeHtml(outcome.mistakes)}`,
    `📍<b>Рекомендация к закрытию:</b> ${escapeHtml(outcome.recommendation)}`,
    ...(responseTimeLine ? [responseTimeLine] : []),
  ].join('\n\n');
}

/**
 * Same emoji + bold + blank-line-separated style as formatChatBlock, per the owner's approved
 * mock-up. `patterns` is the aggregate "what needs your attention" read from
 * ClaudeService.synthesizePatterns — she explicitly asked for this, not just bare best/worst lists.
 */
export function formatSummaryBlock(totalFound: number, outcomes: ChatOutcome[]): string {
  const lostCount = outcomes.filter((outcome) => outcome.isLost).length;
  const headerLines = [`⚡<b>ИТОГ:</b> статус "${TARGET_STATUS}" — ${outcomes.length} из ${totalFound} чатов оценено`];
  if (lostCount > 0) headerLines.push(`🔴 <b>Потеряно:</b> ${lostCount}`);

  const distributionBlock = formatScoreDistribution(outcomes);
  const managerLines = groupByManager(outcomes).map(
    (stat) => `${escapeHtml(stat.managerName)}: ${stat.chatsEvaluated} чатов, средняя оценка ${stat.averageScore}/5`,
  );
  const bestBlock = formatTopChats(outcomes, { direction: 'desc', icon: '🔥', title: 'Лучшие чаты' });
  const worstBlock = formatTopChats(outcomes, { direction: 'asc', icon: '‼️', title: 'Худшие чаты' });

  return [headerLines.join('\n'), distributionBlock, managerLines.join('\n'), bestBlock, worstBlock]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

/**
 * Own standalone Telegram message (owner's instruction, 2026-09-14: "он должен отправляться
 * отдельно... как и было" — reverting the 2026-09-10 merge into formatSummaryBlock).
 * Returns '' (send nothing) if both critical and patterns are empty this run.
 */
export function formatAttentionBlock(reportTime: string, totalChats: number, patterns: PatternSynthesisResult): string {
  const lines: string[] = [];
  if (patterns.critical.length > 0) lines.push(`📍<b>Критично, требует личного внимания:</b> ${escapeHtml(patterns.critical)}`);
  if (patterns.patterns.length > 0) lines.push(`💥<b>Повторяющиеся системные проблемы:</b> ${escapeHtml(patterns.patterns)}`);
  if (lines.length === 0) return '';

  const header = `🧭<b>На что обратить внимание (отчёт ${reportTime}, ${totalChats} чатов):</b>`;
  return [header, ...lines].join('\n\n');
}

/** "Распределение оценок:" as a column, one score value per line, then the average — matches the owner's mock-up. */
function formatScoreDistribution(outcomes: ChatOutcome[]): string {
  if (outcomes.length === 0) return '';

  const counts = new Map<number, number>();
  for (const outcome of outcomes) counts.set(outcome.score, (counts.get(outcome.score) ?? 0) + 1);

  const lines = ALL_SCORE_VALUES.filter((score) => (counts.get(score) ?? 0) > 0).map(
    (score) => `${score}/5 — ${counts.get(score)} ${pluralizeChats(counts.get(score) as number)}`,
  );
  const averageScore = calculateAverageScore(outcomes);

  return ['📊<b>Распределение оценок:</b>', ...lines, '', `Средняя оценка: ${averageScore}/5`].join('\n');
}

/** Russian noun agreement for "чат": 1 чат, 2-4 чата, 5+ чатов (with the 11-14 exception). */
function pluralizeChats(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'чат';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'чата';
  return 'чатов';
}

function calculateAverageScore(outcomes: ChatOutcome[]): number {
  if (outcomes.length === 0) return 0;

  const totalScore = outcomes.reduce((sum, outcome) => sum + outcome.score, 0);
  return Math.round((totalScore / outcomes.length) * 10) / 10;
}

/** Up to TOP_CHATS_COUNT chats sorted by score, for the "best/worst" summary lists. */
function formatTopChats(outcomes: ChatOutcome[], config: { direction: 'asc' | 'desc'; icon: string; title: string }): string {
  const sorted = [...outcomes].sort((a, b) => (config.direction === 'desc' ? b.score - a.score : a.score - b.score));
  const top = sorted.slice(0, TOP_CHATS_COUNT);
  if (top.length === 0) return '';

  const lines = top.map(
    (outcome) => `${escapeHtml(outcome.clientName)} (${formatManagerNames(outcome.managerNames)}) — ${outcome.score}/5`,
  );
  return [`${config.icon}<b>${config.title}:</b>`, ...lines].join('\n');
}

/** A chat with 2 managers counts toward both — more accurate than picking just one "owner". */
function groupByManager(outcomes: ChatOutcome[]): ManagerStats[] {
  const byManager = new Map<string, number[]>();
  for (const outcome of outcomes) {
    for (const managerName of outcome.managerNames) {
      const scores = byManager.get(managerName) ?? [];
      scores.push(outcome.score);
      byManager.set(managerName, scores);
    }
  }

  return Array.from(byManager.entries()).map(([managerName, scores]) => toManagerStats(managerName, scores));
}

function toManagerStats(managerName: string, scores: number[]): ManagerStats {
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  return {
    managerName,
    chatsEvaluated: scores.length,
    averageScore: Math.round((totalScore / scores.length) * 10) / 10,
  };
}
