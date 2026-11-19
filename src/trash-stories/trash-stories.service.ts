import { Injectable, Logger } from '@nestjs/common';
import { ChatFailureTracker } from '../chat-failure-tracker';
import { ClaudeTrashStoriesService } from '../claude/claude-trash-stories.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { formatShiftWindow, getShiftWindow } from '../reply-times/shift-window';
import { escapeHtml } from '../telegram/telegram-format';
import { TelegramService } from '../telegram/telegram.service';
import { formatTrashStories } from './trash-stories-formatter';
import {
  TRASH_LOOKBACK_HOURS,
  TRASH_STORY_STATUSES,
  buildTrashCheckedTag,
  hasTrashSignal,
  needsTrashCheck,
  withoutTrashCheckedTags,
} from './trash-stories.constants';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { TrashStory, TrashStoryStatus } from './trash-stories.types';

const DELAY_BETWEEN_REQUESTS_MS = 1500;
const PAGE_SIZE = 50;
const MESSAGES_LIMIT = 50;

/**
 * "Трэш истории" block of the twice-daily report, sent right before the manager characteristics (owner's
 * instruction, 2026-11-19). Runs inside ReportSchedulerService, strictly after the status report — no
 * timer of its own. A chat is judged once per newest message: the id of that message goes into a
 * `trash-msg-` tag, so the next run skips the chat until it has something new. Sent after every shift,
 * including "nothing found" (owner's instruction, 2026-11-19).
 */
@Injectable()
export class TrashStoriesService {
  private readonly logger = new Logger(TrashStoriesService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
    private readonly claudeTrashStoriesService: ClaudeTrashStoriesService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Never throws: this block is an extra, and a Sitniks hiccup here must not stop the manager
   * characteristics that follow it in the same run — she gets a warning in the group instead.
   */
  async runStories(runStartedAt: Date): Promise<void> {
    try {
      await this.findAndSendStories(runStartedAt);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Trash stories block failed: ${message}`);
      await this.trySend(`⚠️<b>Трэш истории:</b> блок не сформирован — ${escapeHtml(message.slice(0, 200))}`);
    }
  }

  private async findAndSendStories(runStartedAt: Date): Promise<void> {
    const failures = new ChatFailureTracker();
    const stories: TrashStory[] = [];
    let attempted = 0;

    for (const status of TRASH_STORY_STATUSES) {
      const chats = await this.fetchRecentChats(status);
      attempted += chats.length;
      for (const chat of chats) {
        const story = await this.tryJudgeOneChat({ chat, status, failures });
        if (story) stories.push(story);
        await this.delay(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    this.logger.log(`Trash stories: ${stories.length} found among ${attempted} chats`);
    const shiftLabel = formatShiftWindow(getShiftWindow(runStartedAt));
    for (const message of formatTrashStories({ stories, shiftLabel })) await this.trySend(message);

    const warning = failures.formatWarning('Трэш истории', attempted);
    if (warning.length > 0) await this.trySend(warning);
  }

  /** Only chats with a message inside the lookback window — the rest of a status can be months of history. */
  private async fetchRecentChats(status: TrashStoryStatus): Promise<ChatListItem[]> {
    const cutoffMs = Date.now() - TRASH_LOOKBACK_HOURS * 60 * 60 * 1000;
    const all: ChatListItem[] = [];

    for (let skip = 0; ; skip += PAGE_SIZE) {
      const response = await this.sitniksChatListService.listChats({ status: status.name, skip, limit: PAGE_SIZE });
      all.push(...response.data);
      if (response.data.length < PAGE_SIZE) break;
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return all.filter((chat) => new Date(chat.lastMessageCreatedAt).getTime() >= cutoffMs);
  }

  /** One chat's Sitniks/Claude hiccup shouldn't stop the rest of the block. */
  private async tryJudgeOneChat(params: { chat: ChatListItem; status: TrashStoryStatus; failures: ChatFailureTracker }): Promise<TrashStory | null> {
    try {
      return await this.judgeOneChat(params.chat, params.status);
    } catch (error) {
      params.failures.record(error);
      this.logger.warn(`Could not judge chat ${params.chat.id} for a trash story: ${(error as Error).message}`);
      return null;
    }
  }

  private async judgeOneChat(chat: ChatListItem, status: TrashStoryStatus): Promise<TrashStory | null> {
    const response = await this.sitniksChatMessagesService.listMessages({ chatId: chat.id, limit: MESSAGES_LIMIT });
    const latestMessageId = response.data[0]?.id;
    if (!latestMessageId || !needsTrashCheck(chat.tags, latestMessageId)) return null;

    const clientTexts = response.data.filter((message) => !message.managerName).map((message) => message.text);
    if (status.needsKeyword && !hasTrashSignal(clientTexts)) return null;

    const clientName = chat.userNickName ?? chat.userName;
    const verdict = await this.claudeTrashStoriesService.assessChat({ clientName, status: status.name, messages: response.data });
    await this.markChecked(chat, latestMessageId);
    if (!verdict.isTrashStory) return null;

    return { chatId: chat.id, clientName, status: status.name, category: verdict.category, summary: verdict.summary };
  }

  private async markChecked(chat: ChatListItem, messageId: string): Promise<void> {
    const tags = [...withoutTrashCheckedTags(chat.tags), buildTrashCheckedTag(messageId)];
    await this.sitniksChatUpdateService.updateChat({ chatId: chat.id, tags });
  }

  private async trySend(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send trash stories to Telegram: ${(error as Error).message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
