export type SheetValue = string | number;

/** A rectangle of cells written to a tab starting at the given zero-based row and column. */
export type SheetBlock = {
  startRow: number;
  startColumn: number;
  values: SheetValue[][];
};

/** The part of an evaluation_history row the shift tabs need. */
export type ScoreRow = {
  managerNames: string[];
  score: number;
  recordedAt: Date;
};

/** One manager's line for one day of a shift tab; null means no data that day. */
export type ManagerDay = {
  managerName: string;
  roleLabel: string;
  chats: number;
  averageScore: number | null;
  averageMinutes: number | null;
  text: string;
};

/** One day of a shift tab: the shift's totals, its problems and the lines of the managers who worked. */
export type ShiftDay = {
  dayKey: string;
  chats: number;
  averageScore: number | null;
  averageMinutes: number | null;
  problemsText: string;
  managers: ManagerDay[];
};
