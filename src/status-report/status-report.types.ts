/**
 * One evaluated chat, ready to be formatted into the Telegram report and the
 * local file backup. `managerNames` are real names pulled from each
 * message's `managerName` field, oldest to newest — Sitniks' `assignedManagerId`
 * doesn't reliably resolve to a name via /open-api/managers, so it's not used for display.
 */
export type ChatOutcome = {
  chatId: string;
  clientName: string;
  managerNames: string[];
  score: number;
  purchased: boolean | null;
  goodPoints: string;
  closingSummary: string;
  mistakes: string;
  recommendation: string;
  isLost: boolean;
};
