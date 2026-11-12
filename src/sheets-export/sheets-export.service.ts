import { Injectable, Logger } from '@nestjs/common';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { ReplyTimesService } from '../reply-times/reply-times.service';
import { ReportTextsService } from '../report-texts/report-texts.service';
import { SHIFT_ROSTERS } from '../shifts/shift-roster.constants';
import { GoogleSheetsClient } from './google-sheets.client';
import { RETIRED_TABS } from './sheet-tabs.constants';
import { buildShiftDays } from './shift-days';
import { buildShiftTabLayout } from './shift-tab-layout';
import { buildChartRequests, buildFormatRequests } from './shift-tab-requests';
import type { ScoreRow } from './sheets-export.types';

const PRODUCT_SELECTION_SOURCE = 'product_selection';

/**
 * Rebuilds the spreadsheet after each report: one tab per shift (owner's layout of 2026-11-12) with
 * the roster, three charts and a day-by-day log of the shift's problems and each manager's numbers
 * and characteristic. Recomputed from the database every time, so a run never duplicates rows.
 * Only 'product_selection' scores count — 'order_created' uses another scale (see manager-trends).
 */
@Injectable()
export class SheetsExportService {
  private readonly logger = new Logger(SheetsExportService.name);

  constructor(
    private readonly sheetsClient: GoogleSheetsClient,
    private readonly evaluationHistoryService: EvaluationHistoryService,
    private readonly replyTimesService: ReplyTimesService,
    private readonly reportTextsService: ReportTextsService,
  ) {}

  /** Throws on any Google or database failure — the caller decides how to tell the owner. */
  async exportAll(): Promise<void> {
    if (!this.sheetsClient.isConfigured()) {
      this.logger.log('Google Sheets export is not configured (GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_KEY_FILE), skipping');
      return;
    }

    const history = await this.evaluationHistoryService.findScoresSince(new Date(0));
    const scores: ScoreRow[] = history
      .filter((row) => row.source === PRODUCT_SELECTION_SOURCE)
      .map((row) => ({ managerNames: row.managerNames, score: row.score, recordedAt: row.recordedAt }));
    const speeds = await this.replyTimesService.findDailySpeed();
    const texts = await this.reportTextsService.findAll();

    const tabIds = await this.sheetsClient.syncTabs({ wanted: SHIFT_ROSTERS.map((shift) => shift.tabTitle), retired: RETIRED_TABS });
    for (const shift of SHIFT_ROSTERS) {
      const sheetId = tabIds.get(shift.tabTitle) ?? 0;
      const layout = buildShiftTabLayout({ shift, days: buildShiftDays({ shift, scores, speeds, texts }) });
      await this.sheetsClient.writeBlocks({ title: shift.tabTitle, blocks: layout.blocks });
      await this.sheetsClient.rebuildTab({ sheetId, requests: [...buildFormatRequests({ sheetId, layout }), ...buildChartRequests({ sheetId, layout })] });
    }
    this.logger.log(`Google Sheets updated: ${SHIFT_ROSTERS.length} shift tabs, ${scores.length} evaluations, ${texts.length} report texts`);
  }
}
