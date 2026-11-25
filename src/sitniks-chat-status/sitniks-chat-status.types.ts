export type ChangeChatStatusParams = {
  chatId: string;
  /** Plain status name; Sitniks does not validate it, so a typo would create a new status. */
  status: string;
};
