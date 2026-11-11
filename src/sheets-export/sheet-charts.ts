import type { sheets_v4 } from '@googleapis/sheets';
import { AVERAGE_COLUMN_TITLE, MANAGER_SCORES_TAB, MANAGER_SPEED_TAB, SCORE_VALUES, SHIFTS_TAB } from './sheet-tabs.constants';
import type { SheetTable } from './sheets-export.types';

const CHART_WIDTH_PIXELS = 640;
const CHART_HEIGHT_PIXELS = 360;
const GRID_COLUMN_STEP = 9;
const GRID_ROW_STEP = 20;
const FIRST_SCORE_COLUMN = 3;

type ChartPlan = {
  title: string;
  leftAxisTitle: string;
  table: SheetTable;
  sourceSheetId: number;
  seriesColumns: number[];
  stacked: boolean;
  chartType: 'LINE' | 'COLUMN';
};

type BuildChartsParams = {
  chartsSheetId: number;
  tabIds: Map<string, number>;
  tables: SheetTable[];
};

function columnRange(params: { sheetId: number; rowCount: number; column: number }): sheets_v4.Schema$ChartData {
  const range = { sheetId: params.sheetId, startRowIndex: 0, endRowIndex: params.rowCount, startColumnIndex: params.column, endColumnIndex: params.column + 1 };
  return { sourceRange: { sources: [range] } };
}

function buildAddChartRequest(params: { plan: ChartPlan; chartsSheetId: number; position: number }): sheets_v4.Schema$Request {
  const { plan } = params;
  const rowCount = plan.table.values.length;
  const rangeOf = (column: number) => columnRange({ sheetId: plan.sourceSheetId, rowCount, column });

  const basicChart: sheets_v4.Schema$BasicChartSpec = {
    chartType: plan.chartType,
    ...(plan.stacked ? { stackedType: 'STACKED' } : {}),
    legendPosition: 'BOTTOM_LEGEND',
    headerCount: 1,
    axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS', title: plan.leftAxisTitle }],
    domains: [{ domain: rangeOf(0) }],
    series: plan.seriesColumns.map((column) => ({ series: rangeOf(column), targetAxis: 'LEFT_AXIS' })),
  };
  const anchorCell = {
    sheetId: params.chartsSheetId,
    rowIndex: Math.floor(params.position / 2) * GRID_ROW_STEP,
    columnIndex: (params.position % 2) * GRID_COLUMN_STEP,
  };
  const position = { overlayPosition: { anchorCell, widthPixels: CHART_WIDTH_PIXELS, heightPixels: CHART_HEIGHT_PIXELS } };
  return { addChart: { chart: { spec: { title: plan.title, basicChart }, position } } };
}

function wideSeriesColumns(table: SheetTable): number[] {
  return Array.from({ length: Math.max(table.values[0].length - 1, 0) }, (_, index) => index + 1);
}

/** The four charts of the «Графики» tab; a chart is left out while its table has no data rows yet. */
export function buildChartRequests(params: BuildChartsParams): sheets_v4.Schema$Request[] {
  const tableOf = (title: string): SheetTable | undefined => params.tables.find((table) => table.title === title);
  const idOf = (title: string): number => params.tabIds.get(title) ?? 0;
  const shifts = tableOf(SHIFTS_TAB);
  const scores = tableOf(MANAGER_SCORES_TAB);
  const speed = tableOf(MANAGER_SPEED_TAB);

  const plans: ChartPlan[] = [];
  if (shifts) plans.push({ title: 'Средняя оценка по отчётам', leftAxisTitle: AVERAGE_COLUMN_TITLE, table: shifts, sourceSheetId: idOf(SHIFTS_TAB), seriesColumns: [2], stacked: false, chartType: 'LINE' });
  if (shifts) {
    const scoreColumns = SCORE_VALUES.map((_, index) => FIRST_SCORE_COLUMN + index);
    plans.push({ title: 'Сколько чатов получили каждую оценку', leftAxisTitle: 'Чатов', table: shifts, sourceSheetId: idOf(SHIFTS_TAB), seriesColumns: scoreColumns, stacked: true, chartType: 'COLUMN' });
  }
  if (scores) plans.push({ title: 'Средняя оценка по менеджерам', leftAxisTitle: AVERAGE_COLUMN_TITLE, table: scores, sourceSheetId: idOf(MANAGER_SCORES_TAB), seriesColumns: wideSeriesColumns(scores), stacked: false, chartType: 'LINE' });
  if (speed) plans.push({ title: 'Скорость ответа менеджеров, минут', leftAxisTitle: 'Минут', table: speed, sourceSheetId: idOf(MANAGER_SPEED_TAB), seriesColumns: wideSeriesColumns(speed), stacked: false, chartType: 'LINE' });

  return plans
    .filter((plan) => plan.table.values.length > 1 && plan.seriesColumns.length > 0)
    .map((plan, position) => buildAddChartRequest({ plan, chartsSheetId: params.chartsSheetId, position }));
}
