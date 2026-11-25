export type SendChatMessageParams = {
  chatId: string;
  text?: string;
  /** Public file URLs, up to 3; Sitniks downloads them itself and tells the type from the URL ending. */
  attachments?: string[];
};

/**
 * "sent": Sitniks accepted it. "rejected": Sitniks refused it, so nothing reached the client.
 * "uncertain": a server error or a timeout — the message may or may not have been delivered
 * (a 500 was delivered to Telegram once, 2026-11-19), so it must never be sent again blindly.
 */
export type SendOutcome = 'sent' | 'rejected' | 'uncertain';

export type SendChatMessageResult = {
  outcome: SendOutcome;
  detail: string;
};
