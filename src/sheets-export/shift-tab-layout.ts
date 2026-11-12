import {
  CHART_DATA_TITLE,
  DAY_TITLE,
  LOG_HEADER,
  ROSTER_TITLE,
  SHIFT_PROBLEMS_LABEL,
  SHIFT_SCORE_TITLE,
  SHIFT_SPEED_TITLE,
} from './sheet-tabs.constants';
import type { ShiftRoster } from '../shifts/shift-roster.constants';
import type { SheetBlock, SheetValue, ShiftDay } from './sheets-export.types';

/** Rows kept empty under the roster for the charts that are drawn over them. */
export const CHART_BAND_ROWS = 17;
/** Chart data sits to the right of the charts, out of the way of the log. */
const CHART_DATA_COLUMN = 12;
const BLOCK_GAP_COLUMNS = 1;

/** Where the chart data of one tab lies: the header row, the row after the last day and each series column. */
export type ChartDataPlacement = {
  headerRow: number;
  endRow: number;
  shiftDayColumn: number;
  shiftScoreColumn: number;
  managersScoreDayColumn: number;
  managerScoreColumns: number[];
  managersSpeedDayColumn: number;
  managerSpeedColumns: number[];
};

export type ShiftTabLayout = {
  blocks: SheetBlock[];
  rosterEndRow: number;
  chartBandRow: number;
  logHeaderRow: number;
  logEndRow: number;
  dayStartRows: number[];
  chartData: ChartDataPlacement;
};

function blankIfNull(value: number | null): SheetValue {
  return value ?? '';
}

/** "2026-11-11" → "11.11". */
function formatDayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split('-');
  return `${day}.${month}`;
}

function columnRange(params: { start: number; count: number }): number[] {
  return Array.from({ length: params.count }, (_, index) => params.start + index);
}

function buildLogRows(days: ShiftDay[]): { rows: SheetValue[][]; dayOffsets: number[] } {
  const rows: SheetValue[][] = [];
  const dayOffsets: number[] = [];
  for (const day of days) {
    dayOffsets.push(rows.length);
    rows.push([formatDayLabel(day.dayKey), SHIFT_PROBLEMS_LABEL, '', day.chats, blankIfNull(day.averageScore), blankIfNull(day.averageMinutes), day.problemsText]);
    for (const manager of day.managers) {
      rows.push(['', manager.managerName, manager.roleLabel, manager.chats, blankIfNull(manager.averageScore), blankIfNull(manager.averageMinutes), manager.text]);
    }
  }
  return { rows, dayOffsets };
}

/** Three side-by-side tables, oldest day first: the shift totals, scores per manager, speed per manager. */
function buildChartBlocks(params: { shift: ShiftRoster; days: ShiftDay[] }): { blocks: SheetBlock[]; placement: ChartDataPlacement } {
  const ascending = [...params.days].reverse();
  const names = params.shift.members.map((member) => member.managerName);
  const headerRow = 1;
  const valueOf = (day: ShiftDay, name: string, field: 'averageScore' | 'averageMinutes'): SheetValue =>
    blankIfNull(day.managers.find((manager) => manager.managerName === name)?.[field] ?? null);

  const shiftDayColumn = CHART_DATA_COLUMN;
  const managersScoreDayColumn = shiftDayColumn + 3 + BLOCK_GAP_COLUMNS;
  const managersSpeedDayColumn = managersScoreDayColumn + names.length + 1 + BLOCK_GAP_COLUMNS;

  const shiftBlock: SheetBlock = {
    startRow: 0,
    startColumn: shiftDayColumn,
    values: [
      [CHART_DATA_TITLE],
      [DAY_TITLE, SHIFT_SCORE_TITLE, SHIFT_SPEED_TITLE],
      ...ascending.map((day) => [formatDayLabel(day.dayKey), blankIfNull(day.averageScore), blankIfNull(day.averageMinutes)]),
    ],
  };
  const scoreBlock: SheetBlock = {
    startRow: headerRow,
    startColumn: managersScoreDayColumn,
    values: [[DAY_TITLE, ...names], ...ascending.map((day) => [formatDayLabel(day.dayKey), ...names.map((name) => valueOf(day, name, 'averageScore'))])],
  };
  const speedBlock: SheetBlock = {
    startRow: headerRow,
    startColumn: managersSpeedDayColumn,
    values: [[DAY_TITLE, ...names], ...ascending.map((day) => [formatDayLabel(day.dayKey), ...names.map((name) => valueOf(day, name, 'averageMinutes'))])],
  };

  return {
    blocks: [shiftBlock, scoreBlock, speedBlock],
    placement: {
      headerRow,
      endRow: headerRow + 1 + ascending.length,
      shiftDayColumn,
      shiftScoreColumn: shiftDayColumn + 1,
      managersScoreDayColumn,
      managerScoreColumns: columnRange({ start: managersScoreDayColumn + 1, count: names.length }),
      managersSpeedDayColumn,
      managerSpeedColumns: columnRange({ start: managersSpeedDayColumn + 1, count: names.length }),
    },
  };
}

/**
 * The whole tab of one shift: title and roster on top, a band of empty rows the charts are drawn
 * over, then the day-by-day log (newest day first: the shift's problems, then each manager's line).
 */
export function buildShiftTabLayout(params: { shift: ShiftRoster; days: ShiftDay[] }): ShiftTabLayout {
  const rosterRows: SheetValue[][] = [[params.shift.tabTitle], [ROSTER_TITLE], ...params.shift.members.map((member) => [member.roleLabel, member.managerName])];
  const chartBandRow = rosterRows.length + 1;
  const logHeaderRow = chartBandRow + CHART_BAND_ROWS;
  const log = buildLogRows(params.days);
  const chart = buildChartBlocks(params);

  return {
    blocks: [
      { startRow: 0, startColumn: 0, values: rosterRows },
      { startRow: logHeaderRow, startColumn: 0, values: [LOG_HEADER, ...log.rows] },
      ...chart.blocks,
    ],
    rosterEndRow: rosterRows.length,
    chartBandRow,
    logHeaderRow,
    logEndRow: logHeaderRow + 1 + log.rows.length,
    dayStartRows: log.dayOffsets.map((offset) => logHeaderRow + 1 + offset),
    chartData: chart.placement,
  };
}
