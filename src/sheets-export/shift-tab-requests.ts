import type { sheets_v4 } from '@googleapis/sheets';
import {
  CHART_DATA_COLUMN_WIDTH,
  DAY_COLUMN_WIDTH,
  FIXED_COLUMN_WIDTHS,
  MANAGER_SCORE_CHART_TITLE,
  MANAGER_SPEED_CHART_TITLE,
  SHIFT_SCORE_CHART_TITLE,
} from './sheet-tabs.constants';
import { FIXED_COLUMNS, type ShiftTabLayout } from './shift-tab-layout';

// Owner's request (2026-11-12): charts four times the first size (twice as wide and twice as tall).
const CHART_WIDTH_PIXELS = 1040;
const CHART_HEIGHT_PIXELS = 660;
const CHART_GAP_PIXELS = 30;
const CHART_TOP_GAP_ROWS = 2;
const DEFAULT_ROW_HEIGHT = 21;
const DEFAULT_COLUMN_WIDTH = 100;
const BODY_FONT_SIZE = 11;
const BOLD_FONT_SIZE = 12;
const HEADER_BACKGROUND = { red: 0.85, green: 0.85, blue: 0.85 };
const PROBLEMS_BACKGROUND = { red: 1, green: 0.95, blue: 0.8 };
const GROUP_BORDER = { style: 'SOLID_MEDIUM', color: { red: 0.4, green: 0.4, blue: 0.4 } };

type CellArea = { startRow: number; endRow: number; startColumn: number; endColumn: number };
type ChartParams = { sheetId: number; layout: ShiftTabLayout; title: string; axisTitle: string; dayColumn: number; seriesColumns: number[]; position: number };

const BOLD_TEXT = { bold: true, fontSize: BOLD_FONT_SIZE };

function gridRange(sheetId: number, area: CellArea): sheets_v4.Schema$GridRange {
  return { sheetId, startRowIndex: area.startRow, endRowIndex: area.endRow, startColumnIndex: area.startColumn, endColumnIndex: area.endColumn };
}

function formatArea(params: { sheetId: number; area: CellArea; format: sheets_v4.Schema$CellFormat }): sheets_v4.Schema$Request {
  const fields = Object.keys(params.format).map((key) => `userEnteredFormat.${key}`).join(',');
  return { repeatCell: { range: gridRange(params.sheetId, params.area), cell: { userEnteredFormat: params.format }, fields } };
}

function columnWidth(params: { sheetId: number; startIndex: number; endIndex: number; pixelSize: number }): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId: params.sheetId, dimension: 'COLUMNS', startIndex: params.startIndex, endIndex: params.endIndex },
      properties: { pixelSize: params.pixelSize },
      fields: 'pixelSize',
    },
  };
}

function columnData(params: { sheetId: number; layout: ShiftTabLayout; column: number }): sheets_v4.Schema$ChartData {
  const { headerRow, endRow } = params.layout.chartData;
  return { sourceRange: { sources: [gridRange(params.sheetId, { startRow: headerRow, endRow, startColumn: params.column, endColumn: params.column + 1 })] } };
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
    anchorCell: { sheetId: params.sheetId, rowIndex: params.layout.tableEndRow + CHART_TOP_GAP_ROWS, columnIndex: 0 },
    offsetYPixels: params.position * (CHART_HEIGHT_PIXELS + CHART_GAP_PIXELS),
    widthPixels: CHART_WIDTH_PIXELS,
    heightPixels: CHART_HEIGHT_PIXELS,
  };
  return { addChart: { chart: { spec: { title: params.title, basicChart }, position: { overlayPosition } } } };
}

/**
 * Owner's style (2026-11-12): everything centred, font 11; headers, dates, names and metric labels
 * bold 12. Old merges and formatting are cleared first, since the table changes size every run.
 */
export function buildFormatRequests(params: { sheetId: number; layout: ShiftTabLayout }): sheets_v4.Schema$Request[] {
  const { sheetId, layout } = params;
  const table = { startRow: 0, endRow: layout.tableEndRow, startColumn: 0, endColumn: layout.tableEndColumn };
  const groupMerges = layout.groups.flatMap((group) =>
    [0, 1].map((column) => ({
      mergeCells: { range: gridRange(sheetId, { startRow: group.startRow, endRow: group.endRow, startColumn: column, endColumn: column + 1 }), mergeType: 'MERGE_ALL' },
    })),
  );
  const groupBorders = layout.groups.map((group) => ({
    updateBorders: { range: gridRange(sheetId, { ...table, startRow: group.startRow, endRow: group.endRow }), bottom: GROUP_BORDER },
  }));
  const problemRows = layout.problemRows.map((row) =>
    formatArea({ sheetId, area: { ...table, startRow: row, endRow: row + 1, startColumn: FIXED_COLUMNS }, format: { backgroundColor: PROBLEMS_BACKGROUND } }),
  );

  return [
    { unmergeCells: { range: { sheetId } } },
    { repeatCell: { range: { sheetId }, cell: {}, fields: 'userEnteredFormat' } },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: layout.headerRow + 1, frozenColumnCount: FIXED_COLUMNS } },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    // Earlier layouts left their own sizes on rows and columns; everything goes back to default first.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0 }, properties: { pixelSize: DEFAULT_ROW_HEIGHT }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0 }, properties: { pixelSize: DEFAULT_COLUMN_WIDTH }, fields: 'pixelSize' } },
    ...FIXED_COLUMN_WIDTHS.map((pixelSize, index) => columnWidth({ sheetId, startIndex: index, endIndex: index + 1, pixelSize })),
    columnWidth({ sheetId, startIndex: FIXED_COLUMNS, endIndex: layout.tableEndColumn, pixelSize: DAY_COLUMN_WIDTH }),
    columnWidth({ sheetId, startIndex: layout.chartData.firstColumn, endIndex: layout.chartData.endColumn, pixelSize: CHART_DATA_COLUMN_WIDTH }),
    // The whole tab is centred, the chart data on the right included (owner, 2026-11-12).
    {
      repeatCell: {
        range: { sheetId },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { fontSize: BODY_FONT_SIZE } } },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    formatArea({ sheetId, area: table, format: { wrapStrategy: 'WRAP' } }),
    formatArea({ sheetId, area: { ...table, endRow: 1 }, format: { textFormat: { ...BOLD_TEXT, fontSize: 14 } } }),
    formatArea({ sheetId, area: { ...table, startRow: layout.headerRow, endRow: layout.headerRow + 1 }, format: { backgroundColor: HEADER_BACKGROUND, textFormat: BOLD_TEXT } }),
    formatArea({ sheetId, area: { ...table, startRow: layout.headerRow + 1, endColumn: 1 }, format: { textFormat: BOLD_TEXT } }),
    formatArea({ sheetId, area: { ...table, startRow: layout.headerRow + 1, startColumn: 2, endColumn: 3 }, format: { textFormat: BOLD_TEXT } }),
    ...problemRows,
    ...groupMerges,
    ...groupBorders,
    { autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: layout.tableEndRow } } },
  ];
}

/** The three charts of a shift tab, one under another below the table. */
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
