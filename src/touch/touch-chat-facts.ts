import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

export type ChatTouchFacts = {
  /** Who spoke last, not counting the shop's automatic replies. */
  lastParty: 'manager' | 'client' | 'none';
  /** The newest named manager message when a manager spoke last — what a touch follows. */
  anchorMessageId: string | null;
  anchorIsRead: boolean;
  lastClientAt: Date | null;
  lastMessageAt: Date | null;
};

type Party = 'manager' | 'client' | 'bot';

/**
 * Same trick as the transcript formatter: an automatic reply has no manager name but carries the account's own
 * `sentBy`, which any named manager message in the chat reveals. Without one, nothing can be told apart,
 * and an unnamed message counts as the client's.
 */
function readParty(params: { message: ChatMessage; accountSentBy: string | undefined }): Party {
  if (params.message.managerName) return 'manager';
  return params.accountSentBy !== undefined && params.message.sentBy === params.accountSentBy ? 'bot' : 'client';
}

/** What a touch decision needs to know about a chat, read from its visible messages (newest first). */
export function readChatTouchFacts(messagesNewestFirst: ChatMessage[]): ChatTouchFacts {
  const accountSentBy = messagesNewestFirst.find((message) => message.managerName)?.sentBy;
  const spoken = messagesNewestFirst.map((message) => ({ message, party: readParty({ message, accountSentBy }) }));

  const last = spoken.find((item) => item.party !== 'bot');
  const lastClient = spoken.find((item) => item.party === 'client');
  const lastParty = last?.party === 'bot' || last === undefined ? 'none' : last.party;

  return {
    lastParty,
    anchorMessageId: lastParty === 'manager' ? (last?.message.id ?? null) : null,
    anchorIsRead: lastParty === 'manager' && last?.message.isViewedByUser === true,
    lastClientAt: lastClient ? new Date(lastClient.message.createdAt) : null,
    lastMessageAt: messagesNewestFirst[0] ? new Date(messagesNewestFirst[0].createdAt) : null,
  };
}
