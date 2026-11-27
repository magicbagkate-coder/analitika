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

export type ChatFactsOptions = {
  /** The client's own id (chat.userId): any other unnamed sender is the shop's automatic reply. */
  clientId?: string;
  /** In the new-bot status the shop's automatic reply is what a touch follows (owner, 2026-11-27). */
  botSpeaksForShop?: boolean;
};

/**
 * Same trick as the transcript formatter: an automatic reply has no manager name but carries the account's own
 * `sentBy`, which any named manager message in the chat reveals. Without one, nothing can be told apart,
 * and an unnamed message counts as the client's.
 */
function readParty(params: { message: ChatMessage; accountSentBy: string | undefined; options: ChatFactsOptions }): Party {
  const { message, accountSentBy, options } = params;
  if (message.managerName) return 'manager';
  const bot: Party = options.botSpeaksForShop ? 'manager' : 'bot';
  // The client's id is the surest sign, and it works in a chat where no manager wrote at all.
  if (options.clientId !== undefined) return message.sentBy === options.clientId ? 'client' : bot;
  return accountSentBy !== undefined && message.sentBy === accountSentBy ? bot : 'client';
}

/** What a touch decision needs to know about a chat, read from its visible messages (newest first). */
export function readChatTouchFacts(messagesNewestFirst: ChatMessage[], options: ChatFactsOptions = {}): ChatTouchFacts {
  const accountSentBy = messagesNewestFirst.find((message) => message.managerName)?.sentBy;
  const spoken = messagesNewestFirst.map((message) => ({ message, party: readParty({ message, accountSentBy, options }) }));

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
