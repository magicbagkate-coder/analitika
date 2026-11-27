import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { TelegramOwnerBotService } from '../telegram/telegram-owner-bot.service';
import { TelegramService } from '../telegram/telegram.service';
import { listChatsInStatus } from './list-chats-in-status';
import { DELAY_BETWEEN_REQUESTS_MS, MAX_TOUCH_AGE_HOURS } from './touch.constants';
import { TouchChatService } from './touch-chat.service';
import { sendMissingMediaReport } from './send-missing-media-report';
import { emptyMissingMedia, hasMissingMedia, recordMissingMedia } from './touch-missing';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The 10-minute check: every chat of the target status that had a message in the last day is looked at once.
 * Older chats cannot be touched anyway (see decideTouch) — the morning pass closes them.
 */
@Injectable()
export class TouchTickService {
  private readonly logger = new Logger(TouchTickService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly touchChatService: TouchChatService,
    private readonly telegramService: TelegramService,
    private readonly ownerBot: TelegramOwnerBotService,
  ) {}

  async runTick(): Promise<void> {
    const chats: ChatListItem[] = [];
    for (const status of this.appConfig.getTouchTargetStatuses()) {
      const inStatus = await listChatsInStatus({ chatListService: this.sitniksChatListService, status, lastMessageAfter: new Date(Date.now() - MAX_TOUCH_AGE_HOURS * HOUR_MS) });
      chats.push(...inStatus);
    }

    const missing = emptyMissingMedia();
    let failed = 0;
    for (const chat of chats) {
      try {
        const result = await this.touchChatService.processChat({ chat, pass: 'regular' });
        recordMissingMedia({ missing, chat, result });
      } catch (error) {
        failed += 1;
        this.logger.warn(`Touch check failed for chat ${chat.id}: ${(error as Error).message}`);
      }
      await this.pause(DELAY_BETWEEN_REQUESTS_MS);
    }

    this.logger.log(`Touch check done: ${chats.length} chats, ${failed} failed`);
    if (hasMissingMedia(missing)) await sendMissingMediaReport({ missing, telegramService: this.telegramService, ownerBot: this.ownerBot });
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
