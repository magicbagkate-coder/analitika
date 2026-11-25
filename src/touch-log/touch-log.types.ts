/**
 * watching: the bot waits for the hour after "read". pending_approval: the owner was asked.
 * sending: a send is in progress. sent / uncertain: a touch was made (uncertain = delivery unknown).
 * rejected: Sitniks refused the video, nothing reached the client. skipped: the owner said no.
 * stale: the chat moved on (the client wrote, or another manager message came) before the touch.
 */
export type TouchState = 'watching' | 'pending_approval' | 'sending' | 'sent' | 'uncertain' | 'rejected' | 'skipped' | 'stale';

export type NewTouchAttempt = {
  chatId: string;
  anchorMessageId: string;
  clientName: string;
  sourceStatus: string;
  readSeenAt: Date | null;
};

/** What the bot decided to send, saved before asking the owner or sending. */
export type TouchPlan = {
  article: string;
  videoFileId: string;
  videoFileName: string;
  messageText: string;
};
