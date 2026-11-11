import { getCanonicalManagerName } from '../evaluation/manager-roles.constants';
import { formatKyivDayMonth, getKyivHourMinute, startOfKyivDayUtc } from '../kyiv-time';
import { getShiftWindow } from '../reply-times/shift-window';
import {
  AVERAGE_COLUMN_TITLE,
  CHATS_COLUMN_TITLE,
  DAY_COLUMN_TITLE,
  MANAGER_SCORES_TAB,
  MANAGER_SPEED_TAB,
  REPORT_COLUMN_TITLE,
  SCORE_COLUMN_PREFIX,
  SCORE_VALUES,
  SHIFTS_TAB,
} from './sheet-tabs.constants';
import type { ScoreRow, SheetTable, SheetValue, SlotSpeed } from './sheets-export.types';

type SpeedTotals = { replies: number; weightedMinutes: number };

/** The report (nominal time, UTC instant) that evaluated something recorded at `recordedAt`. */
export function getReportSlot(recordedAt: Date): Date {
  return getShiftWindow(recordedAt).until;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function averageOf(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSlotLabel(slot: Date): string {
  const { hour, minute } = getKyivHourMinute(slot);
  return `${formatKyivDayMonth(slot)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function kyivDayKey(slot: Date): number {
  return startOfKyivDayUtc(slot).getTime();
}

function groupByKey<Item>(items: Item[], keyOf: (item: Item) => number): Map<number, Item[]> {
  const groups = new Map<number, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function sortedKeys<Value>(groups: Map<number, Value>): number[] {
  return [...groups.keys()].sort((first, second) => first - second);
}

/** One row per report: how many chats were scored, the average, and how many got each score 1-5. */
export function buildShiftsTable(rows: ScoreRow[]): SheetTable {
  const bySlot = groupByKey(rows, (row) => getReportSlot(row.recordedAt).getTime());
  const header = [REPORT_COLUMN_TITLE, CHATS_COLUMN_TITLE, AVERAGE_COLUMN_TITLE, ...SCORE_VALUES.map((score) => `${SCORE_COLUMN_PREFIX} ${score}`)];
  const body = sortedKeys(bySlot).map((slotMs) => {
    const scores = (bySlot.get(slotMs) ?? []).map((row) => row.score);
    const counts = SCORE_VALUES.map((score) => scores.filter((value) => value === score).length);
    return [formatSlotLabel(new Date(slotMs)), scores.length, roundTo(averageOf(scores), 2), ...counts];
  });
  return { title: SHIFTS_TAB, values: [header, ...body] };
}

/** One row per day, one column per manager: the average score of the chats the manager took part in. */
export function buildManagerScoresTable(rows: ScoreRow[]): SheetTable {
  const byDay = groupByKey(rows, (row) => kyivDayKey(getReportSlot(row.recordedAt)));
  const managers = [...new Set(rows.flatMap((row) => row.managerNames.map(getCanonicalManagerName)))].sort();

  const body = sortedKeys(byDay).map((dayMs) => {
    const dayRows = byDay.get(dayMs) ?? [];
    const cells = managers.map((manager): SheetValue => {
      const scores = dayRows.filter((row) => row.managerNames.map(getCanonicalManagerName).includes(manager)).map((row) => row.score);
      return scores.length > 0 ? roundTo(averageOf(scores), 2) : '';
    });
    return [formatKyivDayMonth(new Date(dayMs)), ...cells];
  });
  return { title: MANAGER_SCORES_TAB, values: [[DAY_COLUMN_TITLE, ...managers], ...body] };
}

/** One row per day, one column per manager: average minutes the client waited, weighted by replies. */
export function buildManagerSpeedTable(slotSpeeds: SlotSpeed[]): SheetTable {
  const byDay = groupByKey(slotSpeeds, (slotSpeed) => kyivDayKey(slotSpeed.slot));
  const managers = [...new Set(slotSpeeds.flatMap((slotSpeed) => slotSpeed.speeds.map((speed) => speed.managerName)))].sort();

  const body = sortedKeys(byDay).map((dayMs) => {
    const totals = new Map<string, SpeedTotals>();
    for (const speed of (byDay.get(dayMs) ?? []).flatMap((slotSpeed) => slotSpeed.speeds)) {
      const current = totals.get(speed.managerName) ?? { replies: 0, weightedMinutes: 0 };
      totals.set(speed.managerName, {
        replies: current.replies + speed.replies,
        weightedMinutes: current.weightedMinutes + speed.averageMinutes * speed.replies,
      });
    }
    const cells = managers.map((manager): SheetValue => {
      const total = totals.get(manager);
      return total ? roundTo(total.weightedMinutes / total.replies, 1) : '';
    });
    return [formatKyivDayMonth(new Date(dayMs)), ...cells];
  });
  return { title: MANAGER_SPEED_TAB, values: [[DAY_COLUMN_TITLE, ...managers], ...body] };
}
