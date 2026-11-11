import { auth, sheets, type sheets_v4 } from '@googleapis/sheets';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { SheetTable } from './sheets-export.types';

const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

type RebuildChartsParams = {
  chartsSheetId: number;
  addRequests: sheets_v4.Schema$Request[];
};

/** Thin wrapper over the Google Sheets API for one spreadsheet, authorised as a service account. */
@Injectable()
export class GoogleSheetsClient {
  private api: sheets_v4.Sheets | null = null;

  constructor(private readonly appConfig: AppConfigService) {}

  isConfigured(): boolean {
    return this.appConfig.getGoogleSheetsId() !== null && this.appConfig.getGoogleKeyFile() !== null;
  }

  /** Creates the tabs that are missing and returns the sheet id of every requested tab by its title. */
  async ensureTabs(titles: string[]): Promise<Map<string, number>> {
    const existing = await this.readTabIds();
    const missing = titles.filter((title) => !existing.has(title));
    if (missing.length > 0) {
      await this.sendRequests(missing.map((title) => ({ addSheet: { properties: { title } } })));
      return this.readTabIds();
    }
    return existing;
  }

  /** Replaces everything on the table's tab with the table's cells. */
  async writeTable(table: SheetTable): Promise<void> {
    const range = `'${table.title}'`;
    await this.getApi().spreadsheets.values.clear({ spreadsheetId: this.getSpreadsheetId(), range });
    await this.getApi().spreadsheets.values.update({
      spreadsheetId: this.getSpreadsheetId(),
      range: `${range}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: table.values },
    });
  }

  /** Charts keep the row range they were created with, so they are dropped and drawn again after each update. */
  async rebuildCharts(params: RebuildChartsParams): Promise<void> {
    const spreadsheet = await this.getApi().spreadsheets.get({ spreadsheetId: this.getSpreadsheetId() });
    const chartsSheet = spreadsheet.data.sheets?.find((sheet) => sheet.properties?.sheetId === params.chartsSheetId);
    const deleteRequests = (chartsSheet?.charts ?? []).map((chart) => ({ deleteEmbeddedObject: { objectId: chart.chartId } }));
    await this.sendRequests([...deleteRequests, ...params.addRequests]);
  }

  private async readTabIds(): Promise<Map<string, number>> {
    const spreadsheet = await this.getApi().spreadsheets.get({ spreadsheetId: this.getSpreadsheetId() });
    const tabs = (spreadsheet.data.sheets ?? []).map((sheet) => [sheet.properties?.title ?? '', sheet.properties?.sheetId ?? 0] as const);
    return new Map(tabs);
  }

  private async sendRequests(requests: sheets_v4.Schema$Request[]): Promise<void> {
    if (requests.length === 0) return;
    await this.getApi().spreadsheets.batchUpdate({ spreadsheetId: this.getSpreadsheetId(), requestBody: { requests } });
  }

  private getApi(): sheets_v4.Sheets {
    if (this.api) return this.api;
    const googleAuth = new auth.GoogleAuth({ keyFile: this.getKeyFile(), scopes: [SPREADSHEETS_SCOPE] });
    this.api = sheets({ version: 'v4', auth: googleAuth });
    return this.api;
  }

  private getSpreadsheetId(): string {
    const spreadsheetId = this.appConfig.getGoogleSheetsId();
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set');
    return spreadsheetId;
  }

  private getKeyFile(): string {
    const keyFile = this.appConfig.getGoogleKeyFile();
    if (!keyFile) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set');
    return keyFile;
  }
}
