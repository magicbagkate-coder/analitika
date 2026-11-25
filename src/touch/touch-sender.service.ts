import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatSendService } from '../sitniks-chat-send/sitniks-chat-send.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { buildVideoUrl } from '../touch-video-library/build-video-url';
import { VIDEO_SETTLE_MS } from './touch.constants';
import { formatSendTrouble, formatTouchSent } from './touch-messages';
import type { SendChatMessageResult } from '../sitniks-chat-send/sitniks-chat-send.types';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

type SendStep = { name: string; result: SendChatMessageResult };

export type SendTouchParams = {
  attempt: TouchAttemptEntity;
  /** Tell the owner when it is done — while she still watches the first touches. */
  announce: boolean;
};

/**
 * Sends one approved touch: the video first, then — only if the video was accepted — the description and the
 * closing question. Owner's rules (2026-11-19/20): never retry after an error, never send the question without
 * the video, and any doubt about delivery goes to her private chat. The caller has already moved the row to
 * "sending", so two sends of the same touch cannot happen.
 */
@Injectable()
export class TouchSenderService {
  private readonly logger = new Logger(TouchSenderService.name);
  /** Public so a test does not have to wait half a minute. */
  settleMs = VIDEO_SETTLE_MS;

  constructor(
    private readonly sitniksChatSendService: SitniksChatSendService,
    private readonly touchLogService: TouchLogService,
    private readonly telegramService: TelegramService,
  ) {}

  async sendTouch(params: SendTouchParams): Promise<void> {
    const { attempt } = params;
    if (!attempt.videoFileId || !attempt.descriptionText || !attempt.questionText) throw new Error(`Touch ${attempt.id} has no plan to send`);

    const video = await this.sendStep({ chatId: attempt.chatId, name: 'видео', body: { attachments: [buildVideoUrl(attempt.videoFileId)] } });
    if (video.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step: video, state: video.result.outcome === 'rejected' ? 'rejected' : 'uncertain' });

    await this.delay(this.settleMs);
    for (const [name, text] of [['описание', attempt.descriptionText], ['вопрос', attempt.questionText]]) {
      const step = await this.sendStep({ chatId: attempt.chatId, name, body: { text } });
      if (step.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step, state: 'uncertain' });
    }

    await this.touchLogService.finishSend({ id: attempt.id, state: 'sent' });
    if (params.announce) await this.tryTell(formatTouchSent({ chatId: attempt.chatId, clientName: attempt.clientName, videoFileName: attempt.videoFileName ?? '' }));
  }

  private async sendStep(params: { chatId: string; name: string; body: { text?: string; attachments?: string[] } }): Promise<SendStep> {
    const result = await this.sitniksChatSendService.sendMessage({ chatId: params.chatId, ...params.body });
    return { name: params.name, result };
  }

  private async finishWithTrouble(params: { attempt: TouchAttemptEntity; step: SendStep; state: 'rejected' | 'uncertain' }): Promise<void> {
    await this.touchLogService.finishSend({ id: params.attempt.id, state: params.state });
    await this.tryTell(
      formatSendTrouble({
        chatId: params.attempt.chatId,
        clientName: params.attempt.clientName,
        step: params.step.name,
        outcome: params.step.result.outcome,
        detail: params.step.result.detail,
      }),
    );
  }

  private async tryTell(text: string): Promise<void> {
    try {
      await this.telegramService.sendOwnerMessage(text);
    } catch (error) {
      this.logger.warn(`Could not tell the owner about a touch: ${(error as Error).message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
