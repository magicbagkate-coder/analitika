export type ScoreTrend = {
  managerName: string;
  direction: 'rising' | 'falling';
  weeksInARow: number;
  /** Oldest to newest, one average per week in the streak. */
  weeklyAverages: number[];
};
