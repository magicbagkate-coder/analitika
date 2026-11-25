import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

/**
 * Did the shop's own video reach the chat after `since`? A big file makes Sitniks answer 504 while it is still
 * downloading it, and the message appears a few seconds later (2026-11-25), so after a doubtful answer the chat
 * itself is the evidence. The shop's account is told from a client by its `sentBy`, which any named manager
 * message in the chat reveals — the same way the transcript formatter does it.
 */
export function hasAccountVideoSince(params: { messagesNewestFirst: ChatMessage[]; since: Date }): boolean {
  const accountSentBy = params.messagesNewestFirst.find((message) => message.managerName)?.sentBy;
  if (accountSentBy === undefined) return false;

  return params.messagesNewestFirst.some(
    (message) => message.messageType === 'video' && !message.managerName && message.sentBy === accountSentBy && new Date(message.createdAt).getTime() >= params.since.getTime(),
  );
}
