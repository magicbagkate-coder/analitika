import type { ManagerReplySpeed } from '../reply-times/reply-times.types';

export type SheetValue = string | number;

/** One tab of the spreadsheet: a title and a rectangular block of cells starting at A1. */
export type SheetTable = {
  title: string;
  values: SheetValue[][];
};

/** The part of an evaluation_history row the tables need. */
export type ScoreRow = {
  managerNames: string[];
  score: number;
  recordedAt: Date;
};

/** Reply speed per manager for one shift, identified by the nominal report time that closed it. */
export type SlotSpeed = {
  slot: Date;
  speeds: ManagerReplySpeed[];
};
