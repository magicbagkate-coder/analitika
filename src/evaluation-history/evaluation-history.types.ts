export type EvaluationSource = 'product_selection' | 'order_created';

export type RecordEvaluationParams = {
  chatId: string;
  clientName: string;
  managerNames: string[];
  score: number;
  source: EvaluationSource;
  note: string;
};
