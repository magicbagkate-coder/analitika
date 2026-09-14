/**
 * One chat from "Замовлення створено" — the deal is already closed, so this captures what worked.
 * score is deterministic, not Claude's judgment call: 5 if the deal included a confirmed upsell, 4
 * otherwise — see order-success-analysis.service.ts.
 */
export type OrderSuccessOutcome = {
  chatId: string;
  clientName: string;
  managerNames: string[];
  successFactors: string;
  score: number;
};
