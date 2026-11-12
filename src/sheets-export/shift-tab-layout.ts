import {
  CHART_COUNT,
  CHART_GAP_PIXELS,
  CHART_HEIGHT_PIXELS,
  DEFAULT_ROW_HEIGHT,
  MANAGER_METRICS,
  SHIFT_GROUP_LABEL,
  SHIFT_METRICS,
  TABLE_HEADER,
} from './sheet-tabs.constants';
import { buildChartData, formatDayLabel, type ChartData } from './shift-chart-data';
import type { ShiftRoster } from '../shifts/shift-roster.constants';
import type { ManagerDay, SheetValue, ShiftDay, SheetBlock } from './sheets-export.types';

/** Columns before the first day: who, role, metric. */
export const FIXED_COLUMNS = 3;
const TITLE_ROW = 0;
const HEADER_ROW = 1;
const ROWS_ABOVE_CHARTS = 2;
// Rows the charts cover at the default row height, plus a little air before the chart data.
const CHART_BAND_ROWS = Math.ceil((CHART_COUNT * CHART_HEIGHT_PIXELS + (CHART_COUNT - 1) * CHART_GAP_PIXELS) / DEFAULT_ROW_HEIGHT) + 3;

/** Rows of one group (the whole shift, or one manager) — its name and role cells are merged over them. */
export type RowGroup = { startRow: number; endRow: number };

export type ShiftTabLayout = {
  blocks: SheetBlock[];
  headerRow: number;
  tableEndRow: number;
  tableEndColumn: number;
  groups: RowGroup[];
  problemRows: number[];
  chartBandRow: number;
  chartData: ChartData;
};

function blankIfNull(value: number | null): SheetValue {
  return value ?? '';
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
      const manager = day.managers.find((item) => item.managerName === params.managerName);
      return manager ? valueOf(manager) : '';
    });
  return [
    [params.managerName, params.roleLabel, chats, ...cellsOf((manager) => manager.chats)],
    ['', '', score, ...cellsOf((manager) => blankIfNull(manager.averageScore))],
    ['', '', speed, ...cellsOf((manager) => blankIfNull(manager.averageMinutes))],
    ['', '', review, ...cellsOf((manager) => manager.text)],
  ];
}

/**
 * The tab of one shift (owner's layout of 2026-11-12): days run to the right, oldest first, like her
 * shift schedule; rows go down by group — the whole shift (problems and totals), then each manager
 * (chats, score, speed, characteristic). Under the table come the charts, then the tables they read.
 */
export function buildShiftTabLayout(params: { shift: ShiftRoster; days: ShiftDay[] }): ShiftTabLayout {
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
  const chartBandRow = tableEndRow + ROWS_ABOVE_CHARTS;
  const chartData = buildChartData({ shift: params.shift, days: params.days, startRow: chartBandRow + CHART_BAND_ROWS });

  return {
    blocks: [
      { startRow: TITLE_ROW, startColumn: 0, values: [[params.shift.tabTitle]] },
      { startRow: HEADER_ROW, startColumn: 0, values: [header, ...groupRows.flat()] },
      ...chartData.blocks,
    ],
    headerRow: HEADER_ROW,
    tableEndRow,
    tableEndColumn: FIXED_COLUMNS + params.days.length,
    groups,
    problemRows: [groups[0].startRow],
    chartBandRow,
    chartData,
  };
}
