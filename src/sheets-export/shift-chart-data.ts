import {
  DAY_TITLE,
  MANAGER_SCORE_CHART_TITLE,
  MANAGER_SPEED_CHART_TITLE,
  SHIFT_SCORE_TITLE,
  SHIFT_SPEED_TITLE,
  SHIFT_TOTALS_DATA_TITLE,
} from './sheet-tabs.constants';
import { TOUCH_ROLE_LABEL, type ShiftRoster } from '../shifts/shift-roster.constants';
import type { SheetBlock, SheetValue, ShiftDay } from './sheets-export.types';

const ROWS_BETWEEN_TABLES = 2;

/** One small table the charts read: a title row, a header row, then one row per day (oldest first) from column A. */
export type ChartTable = {
  titleRow: number;
  headerRow: number;
  endRow: number;
  columnCount: number;
};

export type ChartData = {
  blocks: SheetBlock[];
  shiftTotals: ChartTable;
  managerScores: ChartTable;
  managerSpeeds: ChartTable;
};

type TableParams = { startRow: number; title: string; header: string[]; rows: SheetValue[][] };

function blankIfNull(value: number | null): SheetValue {
  return value ?? '';
}

/** "2026-11-11" → "11.11". */
export function formatDayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split('-');
  return `${day}.${month}`;
}

function buildTable(params: TableParams): { block: SheetBlock; table: ChartTable } {
  return {
    block: { startRow: params.startRow, startColumn: 0, values: [[params.title], params.header, ...params.rows] },
    table: {
      titleRow: params.startRow,
      headerRow: params.startRow + 1,
      endRow: params.startRow + 2 + params.rows.length,
      columnCount: params.header.length,
    },
  };
}

/**
 * The three tables the charts are drawn from, one under another below the charts: the shift's score
 * and speed, each manager's score, each manager's speed. Touch managers are left out (owner, 2026-11-12).
 */
export function buildChartData(params: { shift: ShiftRoster; days: ShiftDay[]; startRow: number }): ChartData {
  const ascending = [...params.days].reverse();
  const names = params.shift.members.filter((member) => member.roleLabel !== TOUCH_ROLE_LABEL).map((member) => member.managerName);
  const valueOf = (day: ShiftDay, name: string, field: 'averageScore' | 'averageMinutes'): SheetValue =>
    blankIfNull(day.managers.find((manager) => manager.managerName === name)?.[field] ?? null);
  const managerRows = (field: 'averageScore' | 'averageMinutes'): SheetValue[][] =>
    ascending.map((day) => [formatDayLabel(day.dayKey), ...names.map((name) => valueOf(day, name, field))]);

  const totals = buildTable({
    startRow: params.startRow,
    title: SHIFT_TOTALS_DATA_TITLE,
    header: [DAY_TITLE, SHIFT_SCORE_TITLE, SHIFT_SPEED_TITLE],
    rows: ascending.map((day) => [formatDayLabel(day.dayKey), blankIfNull(day.averageScore), blankIfNull(day.averageMinutes)]),
  });
  const scores = buildTable({
    startRow: totals.table.endRow + ROWS_BETWEEN_TABLES,
    title: MANAGER_SCORE_CHART_TITLE,
    header: [DAY_TITLE, ...names],
    rows: managerRows('averageScore'),
  });
  const speeds = buildTable({
    startRow: scores.table.endRow + ROWS_BETWEEN_TABLES,
    title: MANAGER_SPEED_CHART_TITLE,
    header: [DAY_TITLE, ...names],
    rows: managerRows('averageMinutes'),
  });

  return {
    blocks: [totals.block, scores.block, speeds.block],
    shiftTotals: totals.table,
    managerScores: scores.table,
    managerSpeeds: speeds.table,
  };
}
