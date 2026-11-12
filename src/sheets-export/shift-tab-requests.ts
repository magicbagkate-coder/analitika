import type { sheets_v4 } from '@googleapis/sheets';
import {
  CHART_GAP_PIXELS,
  CHART_HEIGHT_PIXELS,
  CHART_WIDTH_PIXELS,
  DAY_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  FIXED_COLUMN_WIDTHS,
  MANAGER_SCORE_CHART_TITLE,
  MANAGER_SPEED_CHART_TITLE,
  SHIFT_SCORE_CHART_TITLE,
} from './sheet-tabs.constants';
import { FIXED_COLUMNS, type ShiftTabLayout } from './shift-tab-layout';
import type { ChartTable } from './shift-chart-data';

const DEFAULT_COLUMN_WIDTH = 100;
const BODY_FONT_SIZE = 11;
const BOLD_FONT_SIZE = 12;
const HEADER_BACKGROUND = { red: 0.85, green: 0.85, blue: 0.85 };
const PROBLEMS_BACKGROUND = { red: 1, green: 0.95, blue: 0.8 };
const GROUP_BORDER = { style: 'SOLID_MEDIUM', color: { red: 0.4, green: 0.4, blue: 0.4 } };
const CELL_BORDER = { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } };
const BOLD_TEXT = { bold: true, fontSize: BOLD_FONT_SIZE };

type CellArea = { startRow: number; endRow: number; startColumn: number; endColumn: number };
type ChartParams = { sheetId: number; table: ChartTable; title: string; axisTitle: string; anchorRow: number; position: number };

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

/** A chart-data table: bold title, grey bold header, every cell outlined. */
function formatChartTable(sheetId: number, table: ChartTable): sheets_v4.Schema$Request[] {
  const width = { startColumn: 0, endColumn: table.columnCount };
  const titleArea = { ...width, startRow: table.titleRow, endRow: table.titleRow + 1 };
  const gridArea = { ...width, startRow: table.headerRow, endRow: table.endRow };
  // The title is not merged across the table: Sheets refuses merges that cross the frozen columns.
  return [
    formatArea({ sheetId, area: titleArea, format: { textFormat: BOLD_TEXT, horizontalAlignment: 'LEFT' } }),
    formatArea({ sheetId, area: { ...gridArea, endRow: table.headerRow + 1 }, format: { backgroundColor: HEADER_BACKGROUND, textFormat: BOLD_TEXT, wrapStrategy: 'WRAP' } }),
    formatArea({ sheetId, area: { ...gridArea, startRow: table.headerRow + 1, endColumn: 1 }, format: { textFormat: BOLD_TEXT } }),
    {
      updateBorders: {
        range: gridRange(sheetId, gridArea),
        top: CELL_BORDER,
        bottom: CELL_BORDER,
        left: CELL_BORDER,
        right: CELL_BORDER,
        innerHorizontal: CELL_BORDER,
        innerVertical: CELL_BORDER,
      },
    },
  ];
}

function addLineChart(params: ChartParams): sheets_v4.Schema$Request {
  const dataOf = (column: number): sheets_v4.Schema$ChartData => ({
    sourceRange: { sources: [gridRange(params.sheetId, { startRow: params.table.headerRow, endRow: params.table.endRow, startColumn: column, endColumn: column + 1 })] },
  });
  const seriesColumns = Array.from({ length: params.table.columnCount - 1 }, (_, index) => index + 1);
  const basicChart: sheets_v4.Schema$BasicChartSpec = {
    chartType: 'LINE',
    legendPosition: 'BOTTOM_LEGEND',
    headerCount: 1,
    axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS', title: params.axisTitle }],
    domains: [{ domain: dataOf(0) }],
    series: seriesColumns.map((column) => ({ series: dataOf(column), targetAxis: 'LEFT_AXIS' })),
  };
  const overlayPosition = {
    anchorCell: { sheetId: params.sheetId, rowIndex: params.anchorRow, columnIndex: 0 },
    offsetYPixels: params.position * (CHART_HEIGHT_PIXELS + CHART_GAP_PIXELS),
    widthPixels: CHART_WIDTH_PIXELS,
    heightPixels: CHART_HEIGHT_PIXELS,
  };
  return { addChart: { chart: { spec: { title: params.title, basicChart }, position: { overlayPosition } } } };
}

/**
 * Owner's style (2026-11-12): everything centred, font 11; headers, dates, names and metric labels
 * bold 12, tables outlined. Old merges and formatting are cleared first, since the table grows every run.
 */
export function buildFormatRequests(params: { sheetId: number; layout: ShiftTabLayout }): sheets_v4.Schema$Request[] {
  const { sheetId, layout } = params;
  const table = { startRow: 0, endRow: layout.tableEndRow, startColumn: 0, endColumn: layout.tableEndColumn };
  const body = { ...table, startRow: layout.headerRow };
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
  const { shiftTotals, managerScores, managerSpeeds } = layout.chartData;

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
    columnWidth({ sheetId, startIndex: FIXED_COLUMNS, endIndex: Math.max(layout.tableEndColumn, FIXED_COLUMNS + 1), pixelSize: DAY_COLUMN_WIDTH }),
    {
      repeatCell: {
        range: { sheetId },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { fontSize: BODY_FONT_SIZE } } },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat',
      },
    },
    formatArea({ sheetId, area: table, format: { wrapStrategy: 'WRAP' } }),
    formatArea({ sheetId, area: { ...table, endRow: 1 }, format: { textFormat: { ...BOLD_TEXT, fontSize: 14 } } }),
    formatArea({ sheetId, area: { ...body, endRow: layout.headerRow + 1 }, format: { backgroundColor: HEADER_BACKGROUND, textFormat: BOLD_TEXT } }),
    formatArea({ sheetId, area: { ...body, startRow: layout.headerRow + 1, endColumn: 1 }, format: { textFormat: BOLD_TEXT } }),
    formatArea({ sheetId, area: { ...body, startRow: layout.headerRow + 1, startColumn: 2, endColumn: 3 }, format: { textFormat: BOLD_TEXT } }),
    ...problemRows,
    { updateBorders: { range: gridRange(sheetId, body), top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER, innerHorizontal: CELL_BORDER, innerVertical: CELL_BORDER } },
    ...groupMerges,
    ...groupBorders,
    ...[shiftTotals, managerScores, managerSpeeds].flatMap((chartTable) => formatChartTable(sheetId, chartTable)),
    { autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: layout.tableEndRow } } },
  ];
}

/** The three charts of a shift tab, one under another below the table. */
export function buildChartRequests(params: { sheetId: number; layout: ShiftTabLayout }): sheets_v4.Schema$Request[] {
  const { shiftTotals, managerScores, managerSpeeds } = params.layout.chartData;
  if (shiftTotals.endRow <= shiftTotals.headerRow + 1) return [];
  const base = { sheetId: params.sheetId, anchorRow: params.layout.chartBandRow };
  // The shift chart shows the score only; its speed column stays in the table.
  const shiftScoreOnly = { ...shiftTotals, columnCount: 2 };

  return [
    addLineChart({ ...base, table: shiftScoreOnly, title: SHIFT_SCORE_CHART_TITLE, axisTitle: 'Оценка', position: 0 }),
    addLineChart({ ...base, table: managerScores, title: MANAGER_SCORE_CHART_TITLE, axisTitle: 'Оценка', position: 1 }),
    addLineChart({ ...base, table: managerSpeeds, title: MANAGER_SPEED_CHART_TITLE, axisTitle: 'Минут', position: 2 }),
  ];
}
