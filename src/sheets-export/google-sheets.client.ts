import { auth, sheets, type sheets_v4 } from '@googleapis/sheets';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { buildClearLinkRequest, buildLinkRequests, extractCellLinks } from './cell-links';
import type { SheetBlock } from './sheets-export.types';

const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const ALPHABET_SIZE = 26;

type WriteBlocksParams = { sheetId: number; title: string; blocks: SheetBlock[] };
type RebuildTabParams = { sheetId: number; requests: sheets_v4.Schema$Request[] };

/** "A", "B", ..., "Z", "AA" — the A1 letters of a zero-based column index. */
function columnLetters(index: number): string {
  const letter = String.fromCharCode(65 + (index % ALPHABET_SIZE));
  return index < ALPHABET_SIZE ? letter : columnLetters(Math.floor(index / ALPHABET_SIZE) - 1) + letter;
}

/** Thin wrapper over the Google Sheets API for one spreadsheet, authorised as a service account. */
@Injectable()
export class GoogleSheetsClient {
  private api: sheets_v4.Sheets | null = null;

  constructor(private readonly appConfig: AppConfigService) {}

  isConfigured(): boolean {
    return this.appConfig.getGoogleSheetsId() !== null && this.appConfig.getGoogleKeyFile() !== null;
  }

  /** Creates the tabs that are missing, removes the retired ones and returns every tab's sheet id by title. */
  async syncTabs(params: { wanted: string[]; retired: string[] }): Promise<Map<string, number>> {
    const existing = await this.readTabIds();
    const addRequests = params.wanted.filter((title) => !existing.has(title)).map((title) => ({ addSheet: { properties: { title } } }));
    const deleteRequests = params.retired.filter((title) => existing.has(title)).map((title) => ({ deleteSheet: { sheetId: existing.get(title) } }));
    if (addRequests.length + deleteRequests.length === 0) return existing;

    await this.sendRequests([...addRequests, ...deleteRequests]);
    return this.readTabIds();
  }

  /**
   * Clears every value on the tab, then writes each block at its own position. The grid is grown
   * first, so a table wider than the default 26 columns never fails with "exceeds grid limits".
   */
  async writeBlocks(params: WriteBlocksParams): Promise<void> {
    const columnCount = Math.max(...params.blocks.map((block) => block.startColumn + Math.max(...block.values.map((row) => row.length))));
    const rowCount = Math.max(...params.blocks.map((block) => block.startRow + block.values.length));
    await this.ensureGridSize({ sheetId: params.sheetId, columnCount, rowCount });

    const range = `'${params.title}'`;
    const { blocks, linkedCells } = extractCellLinks(params.blocks);
    await this.getApi().spreadsheets.values.clear({ spreadsheetId: this.getSpreadsheetId(), range });
    await this.sendRequests([buildClearLinkRequest(params.sheetId)]);
    const data = blocks.map((block) => ({ range: `${range}!${columnLetters(block.startColumn)}${block.startRow + 1}`, values: block.values }));
    await this.getApi().spreadsheets.values.batchUpdate({ spreadsheetId: this.getSpreadsheetId(), requestBody: { valueInputOption: 'RAW', data } });
    await this.sendRequests(buildLinkRequests({ sheetId: params.sheetId, linkedCells }));
  }

  /** Charts keep the row range they were created with, so the tab's charts are dropped and drawn again with the new requests. */
  async rebuildTab(params: RebuildTabParams): Promise<void> {
    const spreadsheet = await this.getApi().spreadsheets.get({ spreadsheetId: this.getSpreadsheetId() });
    const tab = spreadsheet.data.sheets?.find((sheet) => sheet.properties?.sheetId === params.sheetId);
    const deleteRequests = (tab?.charts ?? []).map((chart) => ({ deleteEmbeddedObject: { objectId: chart.chartId } }));
    await this.sendRequests([...deleteRequests, ...params.requests]);
  }

  private async ensureGridSize(params: { sheetId: number; columnCount: number; rowCount: number }): Promise<void> {
    const spreadsheet = await this.getApi().spreadsheets.get({ spreadsheetId: this.getSpreadsheetId() });
    const grid = spreadsheet.data.sheets?.find((sheet) => sheet.properties?.sheetId === params.sheetId)?.properties?.gridProperties;
    const columnCount = Math.max(grid?.columnCount ?? 0, params.columnCount);
    const rowCount = Math.max(grid?.rowCount ?? 0, params.rowCount);
    if (columnCount === grid?.columnCount && rowCount === grid?.rowCount) return;

    await this.sendRequests([
      { updateSheetProperties: { properties: { sheetId: params.sheetId, gridProperties: { columnCount, rowCount } }, fields: 'gridProperties.columnCount,gridProperties.rowCount' } },
    ]);
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
