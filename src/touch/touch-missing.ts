import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { MissingMedia } from './touch-messages';
import type { ProcessChatResult } from './touch-chat.service';

export function emptyMissingMedia(): MissingMedia {
  return { noArticle: [], noVideo: [], skipped: [] };
}

export function hasMissingMedia(missing: MissingMedia): boolean {
  return missing.noArticle.length + missing.noVideo.length + missing.skipped.length > 0;
}

/** Adds what one chat lacked (no article, no video for it, or a touch the dialog itself ruled out) to the list the owner gets in one message. */
export function recordMissingMedia(params: { missing: MissingMedia; chat: ChatListItem; result: ProcessChatResult }): void {
  const { missing, chat, result } = params;
  if (result.noArticle) missing.noArticle.push({ chatId: chat.id, clientName: chat.userNickName ?? chat.userName });
  missing.noVideo.push(...result.noVideo);
  if (result.skipped) missing.skipped.push(result.skipped);
}
