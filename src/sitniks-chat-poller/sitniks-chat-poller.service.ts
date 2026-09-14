import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DailyStatsStoreService } from '../daily-stats-store/daily-stats-store.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksManagersService } from '../sitniks-managers/sitniks-managers.service';
import { TARGET_STATUS, needsEvaluation } from '../evaluation/evaluation.constants';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

const QUIET_MINUTES_BEFORE_EVALUATING = 30;
const LOOKBACK_HOURS = 24;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sitniks has no webhooks, so this polls instead: every few minutes, look at
 * recently-active chats and evaluate the ones that have gone quiet for a
 * while and don't have a score tag yet. "Quiet + untagged" stands in for
 * "closed", since we don't rely on a specific Sitniks status value.
 */
@Injectable()
export class SitniksChatPollerService implements OnModuleInit {
  private readonly logger = new Logger(SitniksChatPollerService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly sitniksManagersService: SitniksManagersService,
    private readonly evaluationService: EvaluationService,
    private readonly dailyStatsStoreService: DailyStatsStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    setInterval(() => {
      this.pollAndEvaluate().catch((error) => this.logger.error(`Poll failed: ${(error as Error).message}`));
    }, POLL_INTERVAL_MS);
  }

  async pollAndEvaluate(): Promise<void> {
    const candidates = await this.findChatsReadyToEvaluate();
    if (candidates.length === 0) return;

    const managerNameById = await this.sitniksManagersService.loadNameById();

    for (const chat of candidates) {
      await this.tryEvaluateOneChat(chat, managerNameById);
    }
  }

  /** One chat's failure (Sitniks/Claude error) shouldn't stop the rest of the batch. */
  private async tryEvaluateOneChat(chat: ChatListItem, managerNameById: Map<number, string>): Promise<void> {
    try {
      await this.evaluateOneChat(chat, managerNameById);
    } catch (error) {
      this.logger.error(`Could not evaluate chat ${chat.id}: ${(error as Error).message}`);
    }
  }

  private async findChatsReadyToEvaluate(): Promise<ChatListItem[]> {
    const now = new Date();
    const startDate = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - QUIET_MINUTES_BEFORE_EVALUATING * 60 * 1000);

    const response = await this.sitniksChatListService.listChats({
      status: TARGET_STATUS,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 50,
    });

    return response.data;
  }

  private async evaluateOneChat(chat: ChatListItem, managerNameById: Map<number, string>): Promise<void> {
    const messagesResponse = await this.sitniksChatMessagesService.listMessages({ chatId: chat.id, limit: 50 });
    if (messagesResponse.data.length === 0) return;
    if (!needsEvaluation(chat.tags, messagesResponse.data[0]?.id)) return;

    if (chat.assignedManagerId === undefined || chat.assignedManagerId === null) return;
    const managerName = managerNameById.get(chat.assignedManagerId) ?? `#${chat.assignedManagerId}`;

    const evaluation = await this.evaluationService.evaluateAndPublish({
      chatId: chat.id,
      existingTags: chat.tags,
      clientName: chat.userNickName ?? chat.userName,
      managerNames: [managerName],
      messages: messagesResponse.data,
    });

    this.dailyStatsStoreService.record({
      managerId: chat.assignedManagerId,
      managerName,
      score: evaluation.score,
    });

    this.logger.log(`Chat ${chat.id} evaluated: ${evaluation.score}/5`);
  }
}
