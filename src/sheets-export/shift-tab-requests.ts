import type { sheets_v4 } from '@googleapis/sheets';
import {
  LOG_COLUMN_WIDTHS,
  MANAGER_SCORE_CHART_TITLE,
  MANAGER_SPEED_CHART_TITLE,
  SHIFT_SCORE_CHART_TITLE,
} from './sheet-tabs.constants';
import type { ShiftTabLayout } from './shift-tab-layout';

const CHART_WIDTH_PIXELS = 520;
const CHART_HEIGHT_PIXELS = 330;
const CHART_GAP_PIXELS = 10;
const LOG_COLUMN_COUNT = 7;
const HEADER_BACKGROUND = { red: 0.85, green: 0.85, blue: 0.85 };
const PROBLEMS_BACKGROUND = { red: 1, green: 0.95, blue: 0.8 };

type RowRange = { sheetId: number; startRow: number; endRow: number };
type ChartParams = { sheetId: number; layout: ShiftTabLayout; title: string; axisTitle: string; dayColumn: number; seriesColumns: number[]; position: number };

function rowRange(params: RowRange): sheets_v4.Schema$GridRange {
  return { sheetId: params.sheetId, startRowIndex: params.startRow, endRowIndex: params.endRow, startColumnIndex: 0, endColumnIndex: LOG_COLUMN_COUNT };
}

function formatRows(params: { range: sheets_v4.Schema$GridRange; format: sheets_v4.Schema$CellFormat }): sheets_v4.Schema$Request {
  const fields = Object.keys(params.format).map((key) => `userEnteredFormat.${key}`).join(',');
  return { repeatCell: { range: params.range, cell: { userEnteredFormat: params.format }, fields } };
}

function columnData(params: { sheetId: number; layout: ShiftTabLayout; column: number }): sheets_v4.Schema$ChartData {
  const { headerRow, endRow } = params.layout.chartData;
  const range = { sheetId: params.sheetId, startRowIndex: headerRow, endRowIndex: endRow, startColumnIndex: params.column, endColumnIndex: params.column + 1 };
  return { sourceRange: { sources: [range] } };
}

function addLineChart(params: ChartParams): sheets_v4.Schema$Request {
  const dataOf = (column: number): sheets_v4.Schema$ChartData => columnData({ sheetId: params.sheetId, layout: params.layout, column });
  const basicChart: sheets_v4.Schema$BasicChartSpec = {
    chartType: 'LINE',
    legendPosition: 'BOTTOM_LEGEND',
    headerCount: 1,
    axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS', title: params.axisTitle }],
    domains: [{ domain: dataOf(params.dayColumn) }],
    series: params.seriesColumns.map((column) => ({ series: dataOf(column), targetAxis: 'LEFT_AXIS' })),
  };
  const overlayPosition = {
    anchorCell: { sheetId: params.sheetId, rowIndex: params.layout.chartBandRow, columnIndex: 0 },
    offsetXPixels: params.position * (CHART_WIDTH_PIXELS + CHART_GAP_PIXELS),
    widthPixels: CHART_WIDTH_PIXELS,
    heightPixels: CHART_HEIGHT_PIXELS,
  };
  return { addChart: { chart: { spec: { title: params.title, basicChart }, position: { overlayPosition } } } };
}

/** Clears the old formatting of the tab, then styles the roster, the log and the problem rows. */
export function buildFormatRequests(params: { sheetId: number; layout: ShiftTabLayout }): sheets_v4.Schema$Request[] {
  const { sheetId, layout } = params;
  const widths = LOG_COLUMN_WIDTHS.map((pixelSize, index) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
      properties: { pixelSize },
      fields: 'pixelSize',
    },
  }));
  const problemRows = layout.dayStartRows.map((row) =>
    formatRows({
      range: rowRange({ sheetId, startRow: row, endRow: row + 1 }),
      format: { backgroundColor: PROBLEMS_BACKGROUND, textFormat: { bold: true } },
    }),
  );

  return [
    { repeatCell: { range: { sheetId }, cell: {}, fields: 'userEnteredFormat' } },
    ...widths,
    formatRows({ range: rowRange({ sheetId, startRow: 0, endRow: 1 }), format: { textFormat: { bold: true, fontSize: 14 } } }),
    formatRows({ range: rowRange({ sheetId, startRow: 1, endRow: 2 }), format: { textFormat: { bold: true } } }),
    formatRows({
      range: rowRange({ sheetId, startRow: layout.logHeaderRow, endRow: layout.logHeaderRow + 1 }),
      format: { backgroundColor: HEADER_BACKGROUND, textFormat: { bold: true } },
    }),
    formatRows({
      range: rowRange({ sheetId, startRow: layout.logHeaderRow + 1, endRow: layout.logEndRow }),
      format: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' },
    }),
    ...problemRows,
    { autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: layout.logHeaderRow, endIndex: layout.logEndRow } } },
  ];
}

/** The three charts of a shift tab, drawn side by side over the empty band under the roster. */
export function buildChartRequests(params: { sheetId: number; layout: ShiftTabLayout }): sheets_v4.Schema$Request[] {
  const { chartData } = params.layout;
  if (chartData.endRow <= chartData.headerRow + 1) return [];
  const base = { sheetId: params.sheetId, layout: params.layout };

  return [
    addLineChart({ ...base, title: SHIFT_SCORE_CHART_TITLE, axisTitle: 'Оценка', dayColumn: chartData.shiftDayColumn, seriesColumns: [chartData.shiftScoreColumn], position: 0 }),
    addLineChart({ ...base, title: MANAGER_SCORE_CHART_TITLE, axisTitle: 'Оценка', dayColumn: chartData.managersScoreDayColumn, seriesColumns: chartData.managerScoreColumns, position: 1 }),
    addLineChart({ ...base, title: MANAGER_SPEED_CHART_TITLE, axisTitle: 'Минут', dayColumn: chartData.managersSpeedDayColumn, seriesColumns: chartData.managerSpeedColumns, position: 2 }),
  ];
}
