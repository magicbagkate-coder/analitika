import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { TARGET_STATUS } from '../evaluation/evaluation.constants';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { APPROVED_TOUCHES_REQUIRED, MESSAGES_TO_READ } from './touch.constants';
import { readChatTouchFacts, type ChatTouchFacts } from './touch-chat-facts';
import { decideTouch, type TouchDecision } from './touch-decision';
import { formatDryRunTouch, type MissingVideoChat } from './touch-messages';
import { TouchApprovalService } from './touch-approval.service';
import { TouchPlannerService } from './touch-planner.service';
import { TouchSenderService } from './touch-sender.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

export type TouchPass = 'regular' | 'morning';

export type ProcessChatParams = { chat: ChatListItem; pass: TouchPass };

export type ProcessChatResult = {
  /** A touch went out earlier and the client has not written since — the morning pass closes such a chat. */
  hasUnansweredTouch: boolean;
  /** A touch was sent, asked for approval or (in a dry run) would have been made. */
  touched: boolean;
  noArticle: boolean;
  noVideo: MissingVideoChat | null;
};

const NOTHING_HAPPENED = { touched: false, noArticle: false, noVideo: null } as const;

/**
 * One chat, one look: reads its messages, decides whether a touch is due (see decideTouch) and, if so, plans
 * it and either asks the owner, sends it, or — in a dry run — only describes it to her.
 */
@Injectable()
export class TouchChatService {
  private readonly describedInDryRun = new Set<string>();

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly touchLogService: TouchLogService,
    private readonly touchPlannerService: TouchPlannerService,
    private readonly touchApprovalService: TouchApprovalService,
    private readonly touchSenderService: TouchSenderService,
    private readonly telegramService: TelegramService,
  ) {}

  async processChat(params: ProcessChatParams): Promise<ProcessChatResult> {
    const response = await this.sitniksChatMessagesService.listMessages({ chatId: params.chat.id, limit: MESSAGES_TO_READ });
    const facts = readChatTouchFacts(response.data);
    const hasUnansweredTouch = await this.hasUnansweredTouch({ chatId: params.chat.id, facts });
    await this.retireOutdatedAttempts({ chatId: params.chat.id, currentAnchor: facts.anchorMessageId });
    if (facts.anchorMessageId === null) return { hasUnansweredTouch, ...NOTHING_HAPPENED };

    const attempt = await this.touchLogService.findForAnchor({ chatId: params.chat.id, anchorMessageId: facts.anchorMessageId });
    const decision = decideTouch({
      facts,
      pass: params.pass,
      now: new Date(),
      waitMinutes: this.appConfig.getTouchWaitMinutes(),
      readSeenAt: attempt?.readSeenAt ?? null,
      hasUnansweredTouch,
    });
    const outcome = await this.act({ decision, chat: params.chat, anchorMessageId: facts.anchorMessageId, attempt, messages: response.data });
    return { hasUnansweredTouch, ...outcome };
  }

  private async act(params: ActParams): Promise<Omit<ProcessChatResult, 'hasUnansweredTouch'>> {
    if (params.decision === 'start-waiting') {
      await this.startWaiting(params);
      return NOTHING_HAPPENED;
    }
    if (params.decision !== 'touch') return NOTHING_HAPPENED;
    return this.touchChat(params);
  }

  /** The hour starts when the bot first sees "read": Sitniks gives no read time of its own. */
  private async startWaiting(params: ActParams): Promise<void> {
    if (params.attempt) return this.touchLogService.markReadSeen({ id: params.attempt.id, readSeenAt: new Date() });
    await this.createAttempt({ ...params, readSeenAt: new Date() });
  }

  private async touchChat(params: ActParams): Promise<Omit<ProcessChatResult, 'hasUnansweredTouch'>> {
    const attempt = params.attempt ?? (await this.createAttempt({ ...params, readSeenAt: null }));
    if (attempt.state !== 'watching') return NOTHING_HAPPENED;

    const clientName = attempt.clientName;
    const planned = await this.touchPlannerService.planTouch({ chatId: attempt.chatId, clientName, messagesNewestFirst: params.messages });
    if (planned.status !== 'ready' || !planned.plan) return this.reportMissing({ attempt, article: planned.article });

    await this.touchLogService.savePlan({ id: attempt.id, plan: planned.plan });
    const saved = (await this.touchLogService.findById(attempt.id)) ?? attempt;
    await this.deliver(saved);
    return { touched: true, noArticle: false, noVideo: null };
  }

  /** Dry run only describes; live asks the owner for the first 30 touches, then sends by itself. */
  private async deliver(attempt: TouchAttemptEntity): Promise<void> {
    if (this.appConfig.getTouchMode() === 'dry-run') return this.describeDryRun(attempt);
    if (await this.needsApproval(attempt)) return this.touchApprovalService.requestApproval(attempt);

    const won = await this.touchLogService.claimState({ id: attempt.id, from: ['watching'], to: 'sending' });
    if (won) await this.touchSenderService.sendTouch({ attempt, announce: false });
  }

  private async needsApproval(attempt: TouchAttemptEntity): Promise<boolean> {
    if (attempt.sourceStatus !== TARGET_STATUS) return true;
    return (await this.touchLogService.countMadeTouches(TARGET_STATUS)) < APPROVED_TOUCHES_REQUIRED;
  }

  private async describeDryRun(attempt: TouchAttemptEntity): Promise<void> {
    const key = `${attempt.chatId}:${attempt.anchorMessageId}`;
    if (this.describedInDryRun.has(key)) return;
    this.describedInDryRun.add(key);
    await this.telegramService.sendOwnerMessage(
      formatDryRunTouch({
        chatId: attempt.chatId,
        clientName: attempt.clientName,
        plan: {
          article: attempt.article ?? '',
          videoFileId: attempt.videoFileId ?? '',
          videoFileName: attempt.videoFileName ?? '',
          descriptionText: attempt.descriptionText ?? '',
          questionText: attempt.questionText ?? '',
        },
      }),
    );
  }

  /** Each chat is named to the owner once per anchor; the caller sends all names together. */
  private async reportMissing(params: { attempt: TouchAttemptEntity; article: string | null }): Promise<Omit<ProcessChatResult, 'hasUnansweredTouch'>> {
    if (params.attempt.missingAlertedAt) return NOTHING_HAPPENED;
    await this.touchLogService.markMissingAlerted(params.attempt.id);

    const chat = { chatId: params.attempt.chatId, clientName: params.attempt.clientName };
    return { touched: false, noArticle: params.article === null, noVideo: params.article === null ? null : { ...chat, article: params.article } };
  }

  private async createAttempt(params: ActParams & { readSeenAt: Date | null }): Promise<TouchAttemptEntity> {
    return this.touchLogService.createWatching({
      chatId: params.chat.id,
      anchorMessageId: params.anchorMessageId,
      clientName: params.chat.userNickName ?? params.chat.userName,
      sourceStatus: params.chat.status,
      readSeenAt: params.readSeenAt,
    });
  }

  private async hasUnansweredTouch(params: { chatId: string; facts: ChatTouchFacts }): Promise<boolean> {
    const latest = await this.touchLogService.findLatestMadeTouch(params.chatId);
    if (!latest?.touchedAt) return false;
    return params.facts.lastClientAt === null || params.facts.lastClientAt.getTime() < latest.touchedAt.getTime();
  }

  /** A touch that waited for an hour or for the owner is void once the chat has moved on. */
  private async retireOutdatedAttempts(params: { chatId: string; currentAnchor: string | null }): Promise<void> {
    const open = await this.touchLogService.findOpenForChat(params.chatId);
    for (const attempt of open.filter((item) => item.anchorMessageId !== params.currentAnchor)) {
      await this.touchLogService.setState({ id: attempt.id, state: 'stale' });
    }
  }
}

type ActParams = {
  decision: TouchDecision;
  chat: ChatListItem;
  anchorMessageId: string;
  attempt: TouchAttemptEntity | null;
  messages: Parameters<TouchPlannerService['planTouch']>[0]['messagesNewestFirst'];
};
