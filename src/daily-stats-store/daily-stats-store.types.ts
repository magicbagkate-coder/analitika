export type RecordedEvaluation = {
  managerId: number;
  managerName: string;
  score: number;
  evaluatedAt: Date;
};

export type ManagerDailyStats = {
  managerId: number;
  managerName: string;
  chatsEvaluated: number;
  averageScore: number;
};
