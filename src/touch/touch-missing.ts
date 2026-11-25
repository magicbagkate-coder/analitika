import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { MissingMedia } from './touch-messages';
import type { ProcessChatResult } from './touch-chat.service';

export function emptyMissingMedia(): MissingMedia {
  return { noArticle: [], noVideo: [] };
}

export function hasMissingMedia(missing: MissingMedia): boolean {
  return missing.noArticle.length + missing.noVideo.length > 0;
}

/** Adds what one chat lacked (no article, or no video for it) to the list the owner gets in one message. */
export function recordMissingMedia(params: { missing: MissingMedia; chat: ChatListItem; result: ProcessChatResult }): void {
  const { missing, chat, result } = params;
  if (result.noArticle) missing.noArticle.push({ chatId: chat.id, clientName: chat.userNickName ?? chat.userName });
  if (result.noVideo) missing.noVideo.push(result.noVideo);
}
