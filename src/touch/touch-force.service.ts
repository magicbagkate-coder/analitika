import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatService } from '../sitniks-chat/sitniks-chat.service';
import { TelegramService } from '../telegram/telegram.service';
import { escapeHtml } from '../telegram/telegram-format';
import { TouchLogService } from '../touch-log/touch-log.service';
import { TouchChatService } from './touch-chat.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

/**
 * The "touch anyway" button under a skipped client (owner, 2026-11-26): the bot prepares the touch against its own
 * decision and sends the usual "Send / Skip" request. The button answers at once; the preparation (the video
 * may need compressing) runs in the background and the result — the request, or why there is none — comes as a
 * message.
 */
@Injectable()
export class TouchForceService {
  private readonly logger = new Logger(TouchForceService.name);

  constructor(
    private readonly touchLogService: TouchLogService,
    private readonly sitniksChatService: SitniksChatService,
    private readonly touchChatService: TouchChatService,
    private readonly telegramService: TelegramService,
  ) {}

  /** The short answer shown on the pressed button. */
  async forceTouch(attemptId: string): Promise<string> {
    const attempt = await this.touchLogService.findById(attemptId);
    if (!attempt) return 'Не найдено';
    if (attempt.state !== 'skipped') return 'Уже обработано';

    void this.prepare({ clientName: attempt.clientName, chatId: attempt.chatId }).catch((error) => this.logger.error(`Touch anyway failed: ${(error as Error).message}`));
    return 'Готовлю касание…';
  }

  private async prepare(params: { clientName: string; chatId: string }): Promise<void> {
    try {
      const details = await this.sitniksChatService.getChat(params.chatId);
      const chat: ChatListItem = {
        id: details.id,
        status: details.status,
        tags: details.tags,
        lastMessageCreatedAt: details.lastMessageCreatedAt ?? '',
        userName: details.userName ?? params.clientName,
        userNickName: details.userNickName,
        initialSource: details.initialSource,
      };
      const result = await this.touchChatService.processChat({ chat, pass: 'morning', force: true });
      if (!result.touched) await this.tell(`⚠️ Не вышло подготовить касание для ${escapeHtml(params.clientName)}: ${this.explain(result.noArticle, result.noVideo.length)}`);
    } catch (error) {
      await this.tell(`⚠️ Не вышло подготовить касание для ${escapeHtml(params.clientName)}: ${escapeHtml((error as Error).message)}`);
    }
  }

  private explain(noArticle: boolean, noVideoCount: number): string {
    if (noArticle) return 'в чате нет заметки с артикулом.';
    if (noVideoCount > 0) return 'для артикула из заметки нет видео в папке.';
    return 'чат изменился (клиентка ответила или не прочитала сообщение менеджера).';
  }

  private async tell(text: string): Promise<void> {
    await this.telegramService.sendOwnerMessage(text);
  }
}
