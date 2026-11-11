import { Injectable, Logger } from '@nestjs/common';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { ReplyTimesService } from '../reply-times/reply-times.service';
import { getShiftWindow } from '../reply-times/shift-window';
import { GoogleSheetsClient } from './google-sheets.client';
import { buildChartRequests } from './sheet-charts';
import { buildManagerScoresTable, buildManagerSpeedTable, buildShiftsTable, getReportSlot } from './sheet-tables';
import { CHARTS_TAB } from './sheet-tabs.constants';
import type { ScoreRow, SlotSpeed } from './sheets-export.types';

const PRODUCT_SELECTION_SOURCE = 'product_selection';

/**
 * Rebuilds the analytics spreadsheet from the database after each report: shifts, scores per manager,
 * reply speed per manager and the charts built on them. Everything is recomputed from the full
 * history every time, so a run never duplicates rows and the first run backfills the past by itself.
 * Only 'product_selection' evaluations count — 'order_created' uses another scale (see manager-trends).
 */
@Injectable()
export class SheetsExportService {
  private readonly logger = new Logger(SheetsExportService.name);

  constructor(
    private readonly sheetsClient: GoogleSheetsClient,
    private readonly evaluationHistoryService: EvaluationHistoryService,
    private readonly replyTimesService: ReplyTimesService,
  ) {}

  /** Throws on any Google or database failure — the caller decides how to tell the owner. */
  async exportAll(): Promise<void> {
    if (!this.sheetsClient.isConfigured()) {
      this.logger.log('Google Sheets export is not configured (GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_KEY_FILE), skipping');
      return;
    }

    const history = await this.evaluationHistoryService.findScoresSince(new Date(0));
    const rows: ScoreRow[] = history
      .filter((row) => row.source === PRODUCT_SELECTION_SOURCE)
      .map((row) => ({ managerNames: row.managerNames, score: row.score, recordedAt: row.recordedAt }));

    const tables = [buildShiftsTable(rows), buildManagerScoresTable(rows), buildManagerSpeedTable(await this.loadSlotSpeeds(rows))];
    const tabIds = await this.sheetsClient.ensureTabs([...tables.map((table) => table.title), CHARTS_TAB]);
    for (const table of tables) await this.sheetsClient.writeTable(table);

    const chartsSheetId = tabIds.get(CHARTS_TAB) ?? 0;
    await this.sheetsClient.rebuildCharts({ chartsSheetId, addRequests: buildChartRequests({ chartsSheetId, tabIds, tables }) });
    this.logger.log(`Google Sheets updated: ${rows.length} evaluations`);
  }

  private async loadSlotSpeeds(rows: ScoreRow[]): Promise<SlotSpeed[]> {
    const slotTimes = [...new Set(rows.map((row) => getReportSlot(row.recordedAt).getTime()))].sort((first, second) => first - second);
    const slotSpeeds: SlotSpeed[] = [];
    for (const slotTime of slotTimes) {
      const slot = new Date(slotTime);
      slotSpeeds.push({ slot, speeds: await this.replyTimesService.findSpeedByManager(getShiftWindow(slot)) });
    }
    return slotSpeeds;
  }
}
