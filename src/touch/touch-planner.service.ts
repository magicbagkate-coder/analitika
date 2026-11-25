import { Injectable } from '@nestjs/common';
import { ClaudeTouchService } from '../claude/claude-touch.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { pickTouchVideo } from '../touch-articles/pick-touch-video';
import { TouchVideoLibraryService } from '../touch-video-library/touch-video-library.service';
import { NOTES_TO_READ } from './touch.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';
import type { TouchPlan } from '../touch-log/touch-log.types';

export type TouchPlanResult = {
  status: 'ready' | 'no-article' | 'no-video';
  /** What the manager wrote, when an article was written at all. */
  article: string | null;
  plan: TouchPlan | null;
};

export type PlanTouchParams = { chatId: string; clientName: string; messagesNewestFirst: ChatMessage[] };

/**
 * Turns a chat that is due for a touch into what would be sent: the article from the chat's internal notes,
 * the matching video from the folder, and the one message Claude writes from the conversation.
 * Claude is asked last, so a chat with no article or no video costs nothing.
 */
@Injectable()
export class TouchPlannerService {
  constructor(
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly touchVideoLibraryService: TouchVideoLibraryService,
    private readonly claudeTouchService: ClaudeTouchService,
  ) {}

  async planTouch(params: PlanTouchParams): Promise<TouchPlanResult> {
    const notes = await this.sitniksChatMessagesService.listInternalNotes({ chatId: params.chatId, limit: NOTES_TO_READ });
    const videos = await this.touchVideoLibraryService.listVideos();
    const pick = pickTouchVideo({ noteTexts: notes.map((note) => note.text), fileNames: videos.map((video) => video.fileName) });

    const video = videos.find((candidate) => candidate.fileName === pick.fileName);
    if (pick.status !== 'found' || !video || pick.article === null) return { status: pick.status === 'found' ? 'no-video' : pick.status, article: pick.article, plan: null };

    const texts = await this.claudeTouchService.writeTouchTexts({ clientName: params.clientName, messagesNewestFirst: params.messagesNewestFirst });
    const plan: TouchPlan = { article: pick.article, videoFileId: video.fileId, videoFileName: video.fileName, ...texts };
    return { status: 'ready', article: pick.article, plan };
  }
}
