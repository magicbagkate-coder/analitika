import {
  CHART_DATA_TITLE,
  DAY_TITLE,
  MANAGER_METRICS,
  SHIFT_GROUP_LABEL,
  SHIFT_METRICS,
  SHIFT_SCORE_TITLE,
  SHIFT_SPEED_TITLE,
  TABLE_HEADER,
} from './sheet-tabs.constants';
import type { ShiftRoster } from '../shifts/shift-roster.constants';
import type { ManagerDay, SheetBlock, SheetValue, ShiftDay } from './sheets-export.types';

/** Columns before the first day: who, role, metric. */
export const FIXED_COLUMNS = 3;
const CHART_DATA_GAP_COLUMNS = 2;
const TITLE_ROW = 0;
const HEADER_ROW = 1;

/** Where the chart data of one tab lies: the header row, the row after the last day and each series column. */
export type ChartDataPlacement = {
  headerRow: number;
  endRow: number;
  firstColumn: number;
  shiftDayColumn: number;
  shiftScoreColumn: number;
  managersScoreDayColumn: number;
  managerScoreColumns: number[];
  managersSpeedDayColumn: number;
  managerSpeedColumns: number[];
  endColumn: number;
};

/** Rows of one group (the whole shift, or one manager) — its name and role cells are merged over them. */
export type RowGroup = { startRow: number; endRow: number };

export type ShiftTabLayout = {
  blocks: SheetBlock[];
  headerRow: number;
  tableEndRow: number;
  tableEndColumn: number;
  groups: RowGroup[];
  problemRows: number[];
  textRows: number[];
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

function managerOf(day: ShiftDay, managerName: string): ManagerDay | undefined {
  return day.managers.find((manager) => manager.managerName === managerName);
}

function shiftRows(days: ShiftDay[]): SheetValue[][] {
  const [problems, chats, score, speed] = SHIFT_METRICS;
  return [
    [SHIFT_GROUP_LABEL, '', problems, ...days.map((day) => day.problemsText)],
    ['', '', chats, ...days.map((day) => day.chats)],
    ['', '', score, ...days.map((day) => blankIfNull(day.averageScore))],
    ['', '', speed, ...days.map((day) => blankIfNull(day.averageMinutes))],
  ];
}

function managerRows(params: { days: ShiftDay[]; managerName: string; roleLabel: string }): SheetValue[][] {
  const [chats, score, speed, review] = MANAGER_METRICS;
  const cellsOf = (valueOf: (manager: ManagerDay) => SheetValue): SheetValue[] =>
    params.days.map((day) => {
      const manager = managerOf(day, params.managerName);
      return manager ? valueOf(manager) : '';
    });
  return [
    [params.managerName, params.roleLabel, chats, ...cellsOf((manager) => manager.chats)],
    ['', '', score, ...cellsOf((manager) => blankIfNull(manager.averageScore))],
    ['', '', speed, ...cellsOf((manager) => blankIfNull(manager.averageMinutes))],
    ['', '', review, ...cellsOf((manager) => manager.text)],
  ];
}

/** Three tables for the charts, oldest day first, placed to the right of the main table. */
function buildChartBlocks(params: { shift: ShiftRoster; days: ShiftDay[]; firstColumn: number }): { blocks: SheetBlock[]; placement: ChartDataPlacement } {
  const ascending = [...params.days].reverse();
  const names = params.shift.members.map((member) => member.managerName);
  const headerRow = HEADER_ROW;
  const valueOf = (day: ShiftDay, name: string, field: 'averageScore' | 'averageMinutes'): SheetValue => blankIfNull(managerOf(day, name)?.[field] ?? null);

  const shiftDayColumn = params.firstColumn;
  const managersScoreDayColumn = shiftDayColumn + 4;
  const managersSpeedDayColumn = managersScoreDayColumn + names.length + 2;
  const dayLabels = ascending.map((day) => formatDayLabel(day.dayKey));

  const blocks: SheetBlock[] = [
    {
      startRow: TITLE_ROW,
      startColumn: shiftDayColumn,
      values: [[CHART_DATA_TITLE], [DAY_TITLE, SHIFT_SCORE_TITLE, SHIFT_SPEED_TITLE], ...ascending.map((day, index) => [dayLabels[index], blankIfNull(day.averageScore), blankIfNull(day.averageMinutes)])],
    },
    {
      startRow: headerRow,
      startColumn: managersScoreDayColumn,
      values: [[DAY_TITLE, ...names], ...ascending.map((day, index) => [dayLabels[index], ...names.map((name) => valueOf(day, name, 'averageScore'))])],
    },
    {
      startRow: headerRow,
      startColumn: managersSpeedDayColumn,
      values: [[DAY_TITLE, ...names], ...ascending.map((day, index) => [dayLabels[index], ...names.map((name) => valueOf(day, name, 'averageMinutes'))])],
    },
  ];

  return {
    blocks,
    placement: {
      headerRow,
      endRow: headerRow + 1 + ascending.length,
      firstColumn: shiftDayColumn,
      shiftDayColumn,
      shiftScoreColumn: shiftDayColumn + 1,
      managersScoreDayColumn,
      managerScoreColumns: columnRange({ start: managersScoreDayColumn + 1, count: names.length }),
      managersSpeedDayColumn,
      managerSpeedColumns: columnRange({ start: managersSpeedDayColumn + 1, count: names.length }),
      endColumn: managersSpeedDayColumn + 1 + names.length,
    },
  };
}

/**
 * The tab of one shift (owner's layout of 2026-11-12): days run to the right, oldest first; rows go
 * down by group — the whole shift (problems and totals), then each manager (chats, score, speed,
 * characteristic). Charts are drawn under the table; their data sits to the right of it.
 */
export function buildShiftTabLayout(params: { shift: ShiftRoster; days: ShiftDay[] }): ShiftTabLayout {
  // Owner's request (2026-11-12): oldest day on the left, today on the right, like her shift
  // schedule — so she can hide the old columns and keep the latest days in view.
  const ascending = [...params.days].reverse();
  const header: SheetValue[] = [...TABLE_HEADER, ...ascending.map((day) => formatDayLabel(day.dayKey))];
  const groupRows = [
    shiftRows(ascending),
    ...params.shift.members.map((member) => managerRows({ days: ascending, managerName: member.managerName, roleLabel: member.roleLabel })),
  ];

  const firstGroupRow = HEADER_ROW + 1;
  const groups = groupRows.reduce<RowGroup[]>((all, rows) => {
    const startRow = all.length > 0 ? all[all.length - 1].endRow : firstGroupRow;
    return [...all, { startRow, endRow: startRow + rows.length }];
  }, []);
  const tableEndRow = groups[groups.length - 1].endRow;
  const tableEndColumn = FIXED_COLUMNS + params.days.length;
  const chart = buildChartBlocks({ shift: params.shift, days: params.days, firstColumn: tableEndColumn + CHART_DATA_GAP_COLUMNS });

  return {
    blocks: [
      { startRow: TITLE_ROW, startColumn: 0, values: [[params.shift.tabTitle]] },
      { startRow: HEADER_ROW, startColumn: 0, values: [header, ...groupRows.flat()] },
      ...chart.blocks,
    ],
    headerRow: HEADER_ROW,
    tableEndRow,
    tableEndColumn,
    groups,
    problemRows: [groups[0].startRow],
    textRows: [groups[0].startRow, ...groups.slice(1).map((group) => group.endRow - 1)],
    chartData: chart.placement,
  };
}
