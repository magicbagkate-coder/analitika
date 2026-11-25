import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { TelegramService } from '../telegram/telegram.service';
import { listChatsInStatus } from './list-chats-in-status';
import { DELAY_BETWEEN_REQUESTS_MS, MAX_TOUCH_AGE_HOURS } from './touch.constants';
import { TouchChatService } from './touch-chat.service';
import { formatMissingMedia } from './touch-messages';
import { emptyMissingMedia, hasMissingMedia, recordMissingMedia } from './touch-missing';

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
  ) {}

  async runTick(): Promise<void> {
    const chats = await listChatsInStatus({
      chatListService: this.sitniksChatListService,
      status: this.appConfig.getTouchTargetStatus(),
      lastMessageAfter: new Date(Date.now() - MAX_TOUCH_AGE_HOURS * HOUR_MS),
    });

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
    if (hasMissingMedia(missing)) await this.telegramService.sendOwnerMessage(formatMissingMedia(missing));
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
