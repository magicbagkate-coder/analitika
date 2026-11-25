import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatSendService } from '../sitniks-chat-send/sitniks-chat-send.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { buildVideoUrl } from '../touch-video-library/build-video-url';
import { DESCRIPTION_GAP_MS, QUESTION_GAP_MS, VIDEO_CONFIRM_INTERVAL_MS, VIDEO_CONFIRM_MS } from './touch.constants';
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
 * Sends one approved touch the way a person would write it (owner, 2026-11-25): the line "found it, sending you
 * the video" first, then the video, and the closing question the moment the video has appeared in the chat.
 * Sitniks creates the video message only after it has downloaded the file, so the video lands a few seconds after
 * the line and the question must wait for it — never a fixed pause. Owner's rules (2026-11-19/20): never retry
 * anything, never send the question without the video, and any doubt goes to her private chat. The caller has
 * already moved the row to "sending", so two sends of the same touch cannot happen.
 */
@Injectable()
export class TouchSenderService {
  private readonly logger = new Logger(TouchSenderService.name);
  /** Public so a test does not have to wait for real pauses. */
  descriptionGapMs = DESCRIPTION_GAP_MS;
  questionGapMs = QUESTION_GAP_MS;
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

    const description = await this.sendStep({ chatId: attempt.chatId, name: 'описание', body: { text: attempt.descriptionText } });
    if (description.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step: description });

    await this.delay(this.descriptionGapMs);
    const startedAt = new Date(Date.now() - VIDEO_CLOCK_MARGIN_MS);
    const video = await this.sendStep({ chatId: attempt.chatId, name: 'видео', body: { attachments: [buildVideoUrl(attempt.videoFileId)] } });
    if (video.result.outcome === 'rejected' || !(await this.waitForVideo({ chatId: attempt.chatId, since: startedAt }))) {
      return this.finishWithTrouble({ attempt, step: video });
    }

    await this.delay(this.questionGapMs);
    const question = await this.sendStep({ chatId: attempt.chatId, name: 'вопрос', body: { text: attempt.questionText } });
    if (question.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step: question });

    await this.touchLogService.finishSend({ id: attempt.id, state: 'sent' });
    if (params.announce) await this.tryTell(formatTouchSent({ chatId: attempt.chatId, clientName: attempt.clientName, videoFileName: attempt.videoFileName ?? '' }));
  }

  /**
   * The video shows up in the chat once Sitniks has fetched the file — a big one makes its answer a 504 first
   * (2026-11-25). The chat is watched until it does; nothing is sent again here.
   */
  private async waitForVideo(params: { chatId: string; since: Date }): Promise<boolean> {
    for (let waited = 0; waited < this.confirmMs; waited += this.confirmIntervalMs) {
      const response = await this.sitniksChatMessagesService.listMessages({ chatId: params.chatId, limit: MESSAGES_TO_CHECK });
      if (hasAccountVideoSince({ messagesNewestFirst: response.data, since: params.since })) return true;
      await this.delay(this.confirmIntervalMs);
    }
    return false;
  }

  private async sendStep(params: { chatId: string; name: string; body: { text?: string; attachments?: string[] } }): Promise<SendStep> {
    const result = await this.sitniksChatSendService.sendMessage({ chatId: params.chatId, ...params.body });
    return { name: params.name, result };
  }

  /**
   * Only a refused first line means nothing reached the client. Whatever already went out cannot be taken back,
   * so a half-sent touch is "uncertain" and never free to repeat.
   */
  private async finishWithTrouble(params: { attempt: TouchAttemptEntity; step: SendStep }): Promise<void> {
    const nothingSent = params.step.name === 'описание' && params.step.result.outcome === 'rejected';
    await this.touchLogService.finishSend({ id: params.attempt.id, state: nothingSent ? 'rejected' : 'uncertain' });
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
