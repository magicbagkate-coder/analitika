import type { sheets_v4 } from '@googleapis/sheets';
import { splitSheetLinks, type CellLink } from '../chat-links/chat-link-render';
import type { SheetBlock, SheetValue } from './sheets-export.types';

const LINK_COLOR = { red: 0.07, green: 0.33, blue: 0.8 };

/** A cell whose text holds links; `row` and `column` are zero-based sheet positions. */
export type LinkedCell = { row: number; column: number; textLength: number; links: CellLink[] };

export type BlocksWithLinks = { blocks: SheetBlock[]; linkedCells: LinkedCell[] };

/** Replaces the chat markers in every text cell with the plain label and remembers where the links go. */
export function extractCellLinks(blocks: SheetBlock[]): BlocksWithLinks {
  const linkedCells: LinkedCell[] = [];
  const plainBlocks = blocks.map((block) => ({
    ...block,
    values: block.values.map((row, rowIndex) =>
      row.map((value, columnIndex): SheetValue => {
        if (typeof value !== 'string') return value;
        const { text, links } = splitSheetLinks(value);
        if (links.length > 0) linkedCells.push({ row: block.startRow + rowIndex, column: block.startColumn + columnIndex, textLength: text.length, links });
        return text;
      }),
    ),
  }));
  return { blocks: plainBlocks, linkedCells };
}

/** Runs cover the text from their start to the next run, so a plain run follows every link. */
function buildTextRuns(cell: LinkedCell): sheets_v4.Schema$TextFormatRun[] {
  const first = cell.links[0].start > 0 ? [{ startIndex: 0, format: {} }] : [];
  const linkRuns = cell.links.flatMap((link) => {
    const linkRun = { startIndex: link.start, format: { link: { uri: link.url }, foregroundColor: LINK_COLOR, underline: true } };
    const linkEnd = link.start + link.length;
    return linkEnd < cell.textLength ? [linkRun, { startIndex: linkEnd, format: {} }] : [linkRun];
  });
  return [...first, ...linkRuns];
}

/** Makes the labels clickable; written after the values, which replace any earlier rich text. */
export function buildLinkRequests(params: { sheetId: number; linkedCells: LinkedCell[] }): sheets_v4.Schema$Request[] {
  return params.linkedCells.map((cell) => ({
    updateCells: {
      range: { sheetId: params.sheetId, startRowIndex: cell.row, endRowIndex: cell.row + 1, startColumnIndex: cell.column, endColumnIndex: cell.column + 1 },
      rows: [{ values: [{ textFormatRuns: buildTextRuns(cell) }] }],
      fields: 'textFormatRuns',
    },
  }));
}

/** No rows with a field mask clears that field over the whole tab — old links never outlive their text. */
export function buildClearLinkRequest(sheetId: number): sheets_v4.Schema$Request {
  return { updateCells: { range: { sheetId }, fields: 'textFormatRuns' } };
}
