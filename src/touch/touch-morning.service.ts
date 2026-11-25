import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatStatusService } from '../sitniks-chat-status/sitniks-chat-status.service';
import { TelegramService } from '../telegram/telegram.service';
import { listChatsInStatus } from './list-chats-in-status';
import { DELAY_BETWEEN_REQUESTS_MS } from './touch.constants';
import { TouchChatService } from './touch-chat.service';
import { formatMissingMedia, formatMorningSummary, type MorningSummary } from './touch-messages';
import { emptyMissingMedia, hasMissingMedia, recordMissingMedia } from './touch-missing';
import { getClosingCutoff } from './touch-time';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

/**
 * The 08:00 pass (owner, 2026-11-25). First every chat whose last message came before 22:00 of the previous
 * day is moved to the closed status. Then the rest, which were still talking late in the evening: where a touch
 * already went out and the client stayed silent, the chat is closed too; where none did, the touch is made now.
 * In a dry run nothing is changed — the owner only gets the numbers.
 */
@Injectable()
export class TouchMorningService {
  private readonly logger = new Logger(TouchMorningService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatStatusService: SitniksChatStatusService,
    private readonly touchChatService: TouchChatService,
    private readonly telegramService: TelegramService,
  ) {}

  async runMorningPass(): Promise<void> {
    const cutoff = getClosingCutoff(new Date());
    const chats = await listChatsInStatus({ chatListService: this.sitniksChatListService, status: this.appConfig.getTouchTargetStatus() });
    const isOld = (chat: ChatListItem): boolean => new Date(chat.lastMessageCreatedAt).getTime() < cutoff.getTime();

    const summary: MorningSummary = { closed: 0, touched: 0, failed: 0, dryRun: this.appConfig.getTouchMode() === 'dry-run' };
    for (const chat of chats.filter(isOld)) await this.closeChat({ chat, summary });

    const missing = emptyMissingMedia();
    for (const chat of chats.filter((item) => !isOld(item))) await this.handleRecentChat({ chat, summary, missing });

    await this.telegramService.sendOwnerMessage(formatMorningSummary(summary));
    if (hasMissingMedia(missing)) await this.telegramService.sendOwnerMessage(formatMissingMedia(missing));
  }

  private async handleRecentChat(params: { chat: ChatListItem; summary: MorningSummary; missing: ReturnType<typeof emptyMissingMedia> }): Promise<void> {
    try {
      const result = await this.touchChatService.processChat({ chat: params.chat, pass: 'morning' });
      if (result.touched) params.summary.touched += 1;
      recordMissingMedia({ missing: params.missing, chat: params.chat, result });
      if (result.hasUnansweredTouch) await this.closeChat({ chat: params.chat, summary: params.summary });
    } catch (error) {
      params.summary.failed += 1;
      this.logger.warn(`Morning pass failed for chat ${params.chat.id}: ${(error as Error).message}`);
    }
  }

  private async closeChat(params: { chat: ChatListItem; summary: MorningSummary }): Promise<void> {
    if (params.summary.dryRun) {
      params.summary.closed += 1;
      return;
    }
    try {
      await this.sitniksChatStatusService.changeStatus({ chatId: params.chat.id, status: this.appConfig.getTouchClosedStatus() });
      params.summary.closed += 1;
    } catch (error) {
      params.summary.failed += 1;
      this.logger.warn(`Could not close chat ${params.chat.id}: ${(error as Error).message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }
}
