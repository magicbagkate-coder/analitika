import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatSendService } from '../sitniks-chat-send/sitniks-chat-send.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { buildVideoUrl } from '../touch-video-library/build-video-url';
import { VIDEO_CONFIRM_INTERVAL_MS, VIDEO_CONFIRM_MS, VIDEO_SETTLE_MS } from './touch.constants';
import { formatSendTrouble, formatTouchSent } from './touch-messages';
import { hasAccountVideoSince } from './touch-video-confirm';
import type { SendChatMessageResult } from '../sitniks-chat-send/sitniks-chat-send.types';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

const VIDEO_CLOCK_MARGIN_MS = 5000;
const MESSAGES_TO_CHECK = 20;

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
  confirmMs = VIDEO_CONFIRM_MS;
  confirmIntervalMs = VIDEO_CONFIRM_INTERVAL_MS;

  constructor(
    private readonly sitniksChatSendService: SitniksChatSendService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly touchLogService: TouchLogService,
    private readonly telegramService: TelegramService,
  ) {}

  async sendTouch(params: SendTouchParams): Promise<void> {
    const { attempt } = params;
    if (!attempt.videoFileId || !attempt.descriptionText || !attempt.questionText) throw new Error(`Touch ${attempt.id} has no plan to send`);

    const startedAt = new Date(Date.now() - VIDEO_CLOCK_MARGIN_MS);
    const video = await this.sendStep({ chatId: attempt.chatId, name: 'видео', body: { attachments: [buildVideoUrl(attempt.videoFileId)] } });
    if (video.result.outcome !== 'sent' && !(await this.videoReachedChat({ video, chatId: attempt.chatId, since: startedAt }))) return this.finishWithTrouble({ attempt, step: video, state: video.result.outcome === 'rejected' ? 'rejected' : 'uncertain' });

    await this.delay(this.settleMs);
    for (const [name, text] of [['описание', attempt.descriptionText], ['вопрос', attempt.questionText]]) {
      const step = await this.sendStep({ chatId: attempt.chatId, name, body: { text } });
      if (step.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step, state: 'uncertain' });
    }

    await this.touchLogService.finishSend({ id: attempt.id, state: 'sent' });
    if (params.announce) await this.tryTell(formatTouchSent({ chatId: attempt.chatId, clientName: attempt.clientName, videoFileName: attempt.videoFileName ?? '' }));
  }

  /**
   * A big video makes Sitniks answer 504 while it still downloads the file, and the message shows up in the chat a
   * few seconds later (2026-11-25). After such a doubtful answer — never after a refusal — the chat is watched for
   * a minute and a half; a video that appears counts as sent. Nothing is ever sent again here.
   */
  private async videoReachedChat(params: { video: SendStep; chatId: string; since: Date }): Promise<boolean> {
    if (params.video.result.outcome !== 'uncertain') return false;

    for (let waited = 0; waited < this.confirmMs; waited += this.confirmIntervalMs) {
      await this.delay(this.confirmIntervalMs);
      const response = await this.sitniksChatMessagesService.listMessages({ chatId: params.chatId, limit: MESSAGES_TO_CHECK });
      if (hasAccountVideoSince({ messagesNewestFirst: response.data, since: params.since })) return true;
    }
    return false;
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
