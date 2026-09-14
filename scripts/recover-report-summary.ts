import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ClaudeSynthesisService } from '../src/claude/claude-synthesis.service';
import { EvaluationHistoryService } from '../src/evaluation-history/evaluation-history.service';
import { getKyivHourMinute } from '../src/kyiv-time';
import { SitniksChatMessagesService } from '../src/sitniks-chat-messages/sitniks-chat-messages.service';
import { formatAttentionBlock, formatSummaryBlock } from '../src/status-report/status-report-formatter';
import { TelegramService } from '../src/telegram/telegram.service';
import type { ChatOutcome } from '../src/status-report/status-report.types';

const DELAY_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-off recovery (2026-09-14): the 15:45 "Вибір товару" report hung mid-run on an untimed-out
 * Sitniks request during critical-candidate verification — every chat had already been evaluated,
 * tagged, and sent as its own Telegram message, only the final ИТОГ summary + "На что обратить
 * внимание" block never got sent. Rebuilds both from today's evaluation_history rows (already
 * real, saved data) instead of re-running the whole evaluation again.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const evaluationHistoryService = app.get(EvaluationHistoryService);
  const claudeSynthesisService = app.get(ClaudeSynthesisService);
  const sitniksChatMessagesService = app.get(SitniksChatMessagesService);
  const telegramService = app.get(TelegramService);

  const since = new Date();
  since.setHours(since.getHours() - 3);
  const rows = (await evaluationHistoryService.findSince(since)).filter((row) => row.source === 'product_selection');
  console.log(`Found ${rows.length} product_selection rows from the last 3 hours`);

  const outcomes: ChatOutcome[] = rows.map((row) => ({
    chatId: row.chatId,
    clientName: row.clientName,
    managerNames: row.managerNames,
    score: row.score,
    purchased: null,
    goodPoints: '',
    closingSummary: '',
    mistakes: row.note,
    recommendation: '',
    isLost: false,
  }));

  const draft = await claudeSynthesisService.synthesizePatterns(
    outcomes.map((outcome) => ({
      clientName: outcome.clientName,
      managerNames: outcome.managerNames,
      score: outcome.score,
      mistakes: outcome.mistakes,
    })),
  );
  console.log(`Patterns: ${draft.patterns}`);
  console.log(`Critical candidates: ${draft.criticalCandidates.join(', ')}`);

  const confirmed: string[] = [];
  for (const name of draft.criticalCandidates) {
    const outcome = outcomes.find((candidate) => candidate.clientName === name);
    if (!outcome) continue;
    const messagesResponse = await sitniksChatMessagesService.listMessages({ chatId: outcome.chatId, limit: 50 });
    const description = await claudeSynthesisService.verifyCriticalChat(name, messagesResponse.data);
    if (description.length > 0) confirmed.push(description);
    await delay(DELAY_MS);
  }
  const critical = confirmed.join(' ');
  console.log(`Critical (verified): ${critical}`);

  await telegramService.sendMessage(formatSummaryBlock(outcomes.length, outcomes));

  const { hour, minute } = getKyivHourMinute();
  const reportTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const attentionBlock = formatAttentionBlock(reportTime, outcomes.length, { critical, patterns: draft.patterns });
  if (attentionBlock.length > 0) await telegramService.sendMessage(attentionBlock);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
