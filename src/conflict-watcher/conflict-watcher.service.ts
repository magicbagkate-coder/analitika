import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeSynthesisService } from '../claude/claude-synthesis.service';
import { TARGET_STATUS } from '../evaluation/evaluation.constants';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { TelegramService } from '../telegram/telegram.service';
import { formatConflictAlert } from './conflict-watcher-formatter';
import { buildConflictAlertTag, hasConflictSignal, needsConflictAlert, withoutConflictAlertTags } from './conflict-watcher.constants';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

const POLL_INTERVAL_MS = 10 * 60 * 1000;
// Wider than POLL_INTERVAL_MS so a slow cycle (rate limits, a hung request) can't skip a chat.
const LOOKBACK_MS = 20 * 60 * 1000;
const DELAY_BETWEEN_REQUESTS_MS = 1500;

/**
 * Sitniks has no webhooks, so this polls every ~10 minutes for an explicit client conflict on any
 * currently open "Вибір товару" chat — owner's rule (2026-09-15): a real conflict/complaint must be
 * reported immediately, not wait for the 15:45/23:45 report or its 1.5h quiet gate (see
 * StatusReportService.isQuietLongEnough, which deliberately skips still-active chats).
 *
 * Two-stage, same accuracy principle as ClaudeSynthesisService: a free keyword pre-filter on the
 * newest client message (hasConflictSignal) decides whether it's even worth a Claude call, then
 * verifyCriticalChat re-reads the full recent transcript before anything is actually sent to
 * Telegram — a keyword hit alone isn't proof, e.g. "не потрібно" alone is a normal decline.
 */
@Injectable()
export class ConflictWatcherService implements OnModuleInit {
  private readonly logger = new Logger(ConflictWatcherService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
    private readonly claudeSynthesisService: ClaudeSynthesisService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.pollAndAlert().catch((error) => this.logger.error(`Conflict watch failed: ${(error as Error).message}`));
    }, POLL_INTERVAL_MS);
  }

  async pollAndAlert(): Promise<void> {
    const chats = await this.fetchRecentlyActiveChats();

    for (const chat of chats) {
      await this.tryCheckOneChat(chat);
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  private async fetchRecentlyActiveChats(): Promise<ChatListItem[]> {
    const startDate = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const response = await this.sitniksChatListService.listChats({ status: TARGET_STATUS, startDate, limit: 50 });
    return response.data;
  }

  /** One chat's Sitniks/Claude hiccup shouldn't stop the rest of the poll cycle. */
  private async tryCheckOneChat(chat: ChatListItem): Promise<void> {
    try {
      await this.checkOneChat(chat);
    } catch (error) {
      this.logger.warn(`Could not check chat ${chat.id} for conflict: ${(error as Error).message}`);
    }
  }

  private async checkOneChat(chat: ChatListItem): Promise<void> {
    const messagesResponse = await this.sitniksChatMessagesService.listMessages({ chatId: chat.id, limit: 20 });
    const latestMessage = messagesResponse.data[0];
    if (!latestMessage || latestMessage.managerName) return;
    if (!hasConflictSignal(latestMessage.text)) return;
    if (!needsConflictAlert(chat.tags, latestMessage.id)) return;

    const clientName = chat.userNickName ?? chat.userName;
    const description = await this.claudeSynthesisService.verifyCriticalChat(clientName, messagesResponse.data, true);
    await this.sendAlert(clientName, description);
    await this.markAlerted(chat, latestMessage.id);
  }

  private async sendAlert(clientName: string, description: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(formatConflictAlert(clientName, description));
    } catch (error) {
      this.logger.warn(`Could not send conflict alert for ${clientName}: ${(error as Error).message}`);
    }
  }

  private async markAlerted(chat: ChatListItem, messageId: string): Promise<void> {
    const tags = [...withoutConflictAlertTags(chat.tags), buildConflictAlertTag(messageId)];
    await this.sitniksChatUpdateService.updateChat({ chatId: chat.id, tags });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
