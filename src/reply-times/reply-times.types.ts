import type { ReplyInterval } from '../evaluation/response-time';
import type { EvaluationSource } from '../evaluation-history/evaluation-history.types';

export type RecordRepliesParams = {
  chatId: string;
  source: EvaluationSource;
  replies: ReplyInterval[];
};
