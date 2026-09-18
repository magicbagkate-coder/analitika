import { Injectable, Logger } from '@nestjs/common';
import { ClaudeSuccessService } from '../claude/claude-success.service';
import { collectManagerNames } from '../claude/manager-context';
import { ANALYSIS_WINDOW_HOURS, filterToRecentWindow } from '../evaluation/evaluation.constants';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { getKyivHourMinute } from '../kyiv-time';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { TelegramService } from '../telegram/telegram.service';
import { formatSuccessAttentionBlock, formatSuccessBlock, formatSuccessSummary } from './order-success-analysis-formatter';
import { ORDER_CREATED_STATUS, needsSuccessAnalysis, replaceSuccessTags } from './order-success-analysis.constants';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { OrderSuccessOutcome } from './order-success-analysis.types';

const DELAY_BETWEEN_REQUESTS_MS = 1500;
const PAGE_SIZE = 50;
const SCORE_WITH_UPSELL = 5;
const SCORE_WITHOUT_UPSELL = 4;

/**
 * Looks at every chat in ORDER_CREATED_STATUS — the deal there is already won, so the useful
 * question is different from StatusReportService's quality score: not "was this handled well" but
 * "what specifically made this sale happen, so it can be repeated". Scheduling (twice a day,
 * strictly before StatusReportService — owner's instruction, 2026-09-15, so the two reports never
 * interleave) lives in ReportSchedulerService, not here — this service only runs on demand.
 */
@Injectable()
export class OrderSuccessAnalysisService {
  private readonly logger = new Logger(OrderSuccessAnalysisService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
    private readonly claudeSuccessService: ClaudeSuccessService,
    private readonly telegramService: TelegramService,
    private readonly evaluationHistoryService: EvaluationHistoryService,
  ) {}

  async runAnalysis(): Promise<void> {
    const chats = await this.fetchChatsInStatus();
    const outcomes = await this.analyzeAll(chats);

    this.logger.log(`Order-success analysis: ${outcomes.length}/${chats.length} chats analyzed`);
    await this.sendToTelegram(chats.length, outcomes);
  }

  private async fetchChatsInStatus(): Promise<ChatListItem[]> {
    const all: ChatListItem[] = [];
    let skip = 0;

    for (;;) {
      const response = await this.sitniksChatListService.listChats({ status: ORDER_CREATED_STATUS, skip, limit: PAGE_SIZE });
      all.push(...response.data);
      if (response.data.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return all;
  }

  private async analyzeAll(chats: ChatListItem[]): Promise<OrderSuccessOutcome[]> {
    const outcomes: OrderSuccessOutcome[] = [];

    for (const chat of chats) {
      const outcome = await this.tryAnalyzeOneChat(chat);
      if (outcome) outcomes.push(outcome);
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return outcomes;
  }

  /** One chat's failure (Sitniks/Claude error) shouldn't stop the rest of the batch. */
  private async tryAnalyzeOneChat(chat: ChatListItem): Promise<OrderSuccessOutcome | null> {
    try {
      return await this.analyzeOneChat(chat);
    } catch (error) {
      this.logger.warn(`Could not analyze chat ${chat.id}: ${(error as Error).message}`);
      return null;
    }
  }

  private async analyzeOneChat(chat: ChatListItem): Promise<OrderSuccessOutcome | null> {
    const messagesResponse = await this.sitniksChatMessagesService.listMessages({ chatId: chat.id, limit: 50 });
    if (messagesResponse.data.length === 0) return null;

    const latestMessageId = messagesResponse.data[0]?.id;
    if (!needsSuccessAnalysis(chat.tags, latestMessageId)) return null;

    const recentMessages = filterToRecentWindow(messagesResponse.data, ANALYSIS_WINDOW_HOURS);
    const clientName = chat.userNickName ?? chat.userName;
    const managerNames = collectManagerNames(recentMessages);
    const result = await this.claudeSuccessService.analyzeSuccessFactors(recentMessages, clientName);
    const score = result.hadUpsell ? SCORE_WITH_UPSELL : SCORE_WITHOUT_UPSELL;

    await this.publish(chat, score, latestMessageId);
    await this.evaluationHistoryService.tryRecord({
      chatId: chat.id,
      clientName,
      managerNames,
      score,
      source: 'order_created',
      note: result.successFactors,
      // Response-time tracking is scoped to "Вибір товару" consultations, not closed-deal chats here.
      medianResponseMinutes: null,
    });

    return {
      chatId: chat.id,
      clientName,
      managerNames,
      successFactors: result.successFactors,
      score,
    };
  }

  /** Owner's instruction (2026-09-14): tag only here, for tracking — notes stay Вибір-товару-only. */
  private async publish(chat: ChatListItem, score: number, latestMessageId: string | undefined): Promise<void> {
    const tags = replaceSuccessTags(chat.tags, score, latestMessageId);
    await this.sitniksChatUpdateService.updateChat({ chatId: chat.id, tags });
  }

  /**
   * Chat blocks, then ИТОГ, then — as its own separate message, same convention as
   * StatusReportService's "На что обратить внимание" (owner's instruction, 2026-09-14) — a
   * cross-deal "what systemically works" block, skipped if nothing repeats this run.
   */
  private async sendToTelegram(totalFound: number, outcomes: OrderSuccessOutcome[]): Promise<void> {
    if (outcomes.length === 0) return;

    await this.trySend(`🏆<b>Успішні угоди — статус "${ORDER_CREATED_STATUS}"</b> (${outcomes.length} з ${totalFound})`);
    for (const outcome of outcomes) {
      await this.trySend(formatSuccessBlock(outcome));
    }
    await this.trySend(formatSuccessSummary(outcomes));

    const patterns = await this.trySynthesizeSuccessPatterns(outcomes);
    const attentionBlock = formatSuccessAttentionBlock(this.formatReportTime(), outcomes.length, patterns);
    if (attentionBlock.length > 0) await this.trySend(attentionBlock);
  }

  /** A synthesis-call hiccup shouldn't drop the rest of an otherwise-complete report. */
  private async trySynthesizeSuccessPatterns(outcomes: OrderSuccessOutcome[]): Promise<string> {
    try {
      return await this.claudeSuccessService.synthesizeSuccessPatterns(outcomes);
    } catch (error) {
      this.logger.warn(`Could not synthesize success patterns: ${(error as Error).message}`);
      return '';
    }
  }

  /** "HH:MM" in Kyiv time — matches StatusReportService.formatReportTime, regardless of host timezone. */
  private formatReportTime(): string {
    const { hour, minute } = getKyivHourMinute();
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /** Telegram hiccups shouldn't break the analysis/tagging that already succeeded. */
  private async trySend(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send success analysis to Telegram: ${(error as Error).message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
