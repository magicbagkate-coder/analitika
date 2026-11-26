import { Injectable } from '@nestjs/common';
import { ClaudeTouchService } from '../claude/claude-touch.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { pickTouchVideos } from '../touch-articles/pick-touch-videos';
import { TouchVideoCompressorService } from '../touch-video-library/touch-video-compressor.service';
import { TouchVideoLibraryService } from '../touch-video-library/touch-video-library.service';
import { NOTES_TO_READ } from './touch.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';
import type { PlannedVideo, TouchPlan } from '../touch-log/touch-log.types';

export type TouchPlanResult = {
  status: 'ready' | 'no-article' | 'no-video' | 'skip';
  /** Why the dialog says no touch (Russian, for the owner) when the status is 'skip'. */
  skipReason: string | null;
  /** Articles the manager wrote that have no video — on a "ready" plan they are the ones left out. */
  missing: string[];
  plan: TouchPlan | null;
};

export type PlanTouchParams = { chatId: string; clientName: string; messagesNewestFirst: ChatMessage[] };

/**
 * Turns a chat that is due for a touch into what would be sent: the articles from the chat's internal notes (one
 * video each), and the one message Claude writes from the conversation. Claude is asked last, so a chat with no
 * article or no video costs nothing.
 */
@Injectable()
export class TouchPlannerService {
  constructor(
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly touchVideoLibraryService: TouchVideoLibraryService,
    private readonly touchVideoCompressorService: TouchVideoCompressorService,
    private readonly claudeTouchService: ClaudeTouchService,
  ) {}

  async planTouch(params: PlanTouchParams): Promise<TouchPlanResult> {
    const notes = await this.sitniksChatMessagesService.listInternalNotes({ chatId: params.chatId, limit: NOTES_TO_READ });
    const library = await this.touchVideoLibraryService.listVideos();
    const pick = pickTouchVideos({ noteTexts: notes.map((note) => note.text), fileNames: library.map((file) => file.fileName) });
    if (pick.status !== 'found') return { status: pick.status, skipReason: null, missing: pick.missing, plan: null };

    const videos = pick.found.flatMap((item): PlannedVideo[] => {
      const file = library.find((candidate) => candidate.fileName === item.fileName);
      return file ? [{ fileId: file.fileId, fileName: file.fileName, article: item.article }] : [];
    });
    // Claude reads the dialog first: a chat where the client has said no costs no compression and no video.
    const decision = await this.claudeTouchService.writeTouchTexts({ clientName: params.clientName, messagesNewestFirst: params.messagesNewestFirst, videoCount: videos.length });
    if (!decision.shouldTouch) return { status: 'skip', skipReason: decision.skipReason, missing: [], plan: null };

    // The light copies are made now if the background round has not got to them yet; a failed one is sent as the original.
    for (const video of videos) await this.touchVideoCompressorService.ensureCompressed(video.fileId);
    const article = pick.found.map((item) => item.article).join(', ');
    return { status: 'ready', skipReason: null, missing: pick.missing, plan: { article, videos, messageText: decision.messageText } };
  }
}
