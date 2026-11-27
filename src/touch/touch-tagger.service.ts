import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatService } from '../sitniks-chat/sitniks-chat.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';

/**
 * Puts the statistics tag ("касание 1" / "касание 2", owner 2026-11-27) on a chat that got a touch. Sitniks replaces
 * the whole tag list on update, so the chat's own tags are read first and kept. A failure here is only logged: the
 * touch itself has already gone out and must not be reported as trouble.
 */
@Injectable()
export class TouchTaggerService {
  private readonly logger = new Logger(TouchTaggerService.name);

  constructor(
    private readonly sitniksChatService: SitniksChatService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
  ) {}

  async tagTouch(params: { chatId: string; tag: string }): Promise<void> {
    try {
      const chat = await this.sitniksChatService.getChat(params.chatId);
      const tags = chat.tags ?? [];
      if (tags.includes(params.tag)) return;
      await this.sitniksChatUpdateService.updateChat({ chatId: params.chatId, tags: [...tags, params.tag] });
    } catch (error) {
      this.logger.warn(`Could not put the tag "${params.tag}" on chat ${params.chatId}: ${(error as Error).message}`);
    }
  }
}
