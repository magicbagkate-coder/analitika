import type { ReplyInterval } from '../evaluation/response-time';
import type { EvaluationSource } from '../evaluation-history/evaluation-history.types';

export type RecordRepliesParams = {
  chatId: string;
  source: EvaluationSource;
  replies: ReplyInterval[];
};

export type ReplyTimeRow = {
  chatId: string;
  messageId: string;
  managerName: string;
  source: EvaluationSource;
  clientMessageAt: Date;
  repliedAt: Date;
  minutes: number;
};

/** [since, until) in real instants — replies made inside it belong to one shift. */
export type ShiftWindow = {
  since: Date;
  until: Date;
};

export type ManagerReplySpeed = {
  managerName: string;
  replies: number;
  averageMinutes: number;
};
