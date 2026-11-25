import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

/**
 * Did the shop's own video reach the chat after `since`? A big file makes Sitniks answer 504 while it is still
 * downloading it, and the message appears a few seconds later (2026-11-25), so after a doubtful answer the chat
 * itself is the evidence. The shop's account is told from a client by its `sentBy`, which any named manager
 * message in the chat reveals. In a chat where no manager has written yet (only the automatic bot) it cannot be
 * told, and any new video of an unnamed sender counts: a client sending a video in the same minute and a half
 * is far less likely than this being ours (the mak_provodnik test chat, 2026-11-25).
 */
export function hasAccountVideoSince(params: { messagesNewestFirst: ChatMessage[]; since: Date }): boolean {
  const accountSentBy = params.messagesNewestFirst.find((message) => message.managerName)?.sentBy;
  const isOurs = (message: ChatMessage): boolean => !message.managerName && (accountSentBy === undefined || message.sentBy === accountSentBy);

  return params.messagesNewestFirst.some(
    (message) => message.messageType === 'video' && isOurs(message) && new Date(message.createdAt).getTime() >= params.since.getTime(),
  );
}
