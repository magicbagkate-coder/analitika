import { Injectable, Logger } from '@nestjs/common';
import { ClaudeService } from '../claude/claude.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { SitniksChatNotesService } from '../sitniks-chat-notes/sitniks-chat-notes.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { SCORE_TAG_PREFIX, buildLastEvaluatedMessageTag, withoutTrackingTags } from './evaluation.constants';
import { calculateResponseTimes } from './response-time';
import type { ChatEvaluationOutcome, EvaluateChatParams } from './evaluation.types';

/** Orchestrates one chat: Claude evaluation → tag + note written back to Sitniks, plus history for trends. */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly claudeService: ClaudeService,
    private readonly sitniksChatNotesService: SitniksChatNotesService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
    private readonly evaluationHistoryService: EvaluationHistoryService,
  ) {}

  async evaluateAndPublish(params: EvaluateChatParams): Promise<ChatEvaluationOutcome> {
    const evaluation = await this.claudeService.evaluateChat(params.messages, params.clientName);
    // messages is newest-first (Sitniks API order) — [0] is what this score is actually based on.
    const latestMessageId = params.messages[0]?.id;
    const tags = this.replaceScoreTag(params.existingTags, evaluation.score, latestMessageId);
    // Pure arithmetic on timestamps already in `messages` — no Claude call, no extra API cost.
    const responseTimes = calculateResponseTimes(params.messages);

    await this.sitniksChatUpdateService.updateChat({ chatId: params.chatId, tags });
    // Only the recommendation goes to Sitniks — the rest is Telegram-only (see status-report.service.ts).
    await this.tryCreateNote(params.chatId, evaluation.recommendation);
    await this.evaluationHistoryService.tryRecord({
      chatId: params.chatId,
      clientName: params.clientName,
      managerNames: params.managerNames,
      score: evaluation.score,
      source: 'product_selection',
      note: evaluation.mistakes,
      medianResponseMinutes: responseTimes.medianMinutes,
    });

    this.logger.log(`Evaluated chat ${params.chatId}: ${evaluation.score}/5`);
    return { ...evaluation, responseTimes };
  }

  /** A single Sitniks/Claude hiccup shouldn't abort the whole evaluation. */
  private async tryCreateNote(chatId: string, note: string): Promise<void> {
    try {
      await this.sitniksChatNotesService.createNote({ chatId, note });
    } catch (error) {
      this.logger.warn(`Could not write note for chat ${chatId}: ${(error as Error).message}`);
    }
  }

  private replaceScoreTag(existingTags: string[], score: number, latestMessageId: string | undefined): string[] {
    const freshTags = [...withoutTrackingTags(existingTags), `${SCORE_TAG_PREFIX}${score}`];
    return latestMessageId ? [...freshTags, buildLastEvaluatedMessageTag(latestMessageId)] : freshTags;
  }
}
