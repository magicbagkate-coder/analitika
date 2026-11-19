export type TrashStoryStatus = {
  name: string;
  /** true: only chats whose client messages hit the keyword pre-filter go to Claude. */
  needsKeyword: boolean;
};

export type TrashStory = {
  chatId: string;
  clientName: string;
  status: string;
  category: string;
  summary: string;
};
