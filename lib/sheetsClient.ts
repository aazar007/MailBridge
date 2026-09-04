/**
 * lib/sheetsClient.ts
 * طبقة وصول منخفضة المستوى لـ Google Sheets — تحل محل @libsql/client لكل شيء
 * عدا رموز OAuth الحية (تبقى على Turso، انظر lib/token-store.ts).
 *
 * تستخدم Service Account (خادم-لخادم)، منفصل عن OAuth الخاص بإرسال البريد.
 */

import { google } from 'googleapis';
import { TAB_HEADERS, type SheetTab } from '@/lib/sheetsSchema';

export type SheetRow = Record<string, string | number> & { _row: number };

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sheetsApi: any = null;

function getSheetsApi() {
  if (_sheetsApi) return _sheetsApi;

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!SPREADSHEET_ID || !clientEmail || !privateKey) {
    throw new Error(
      'Missing GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY env vars',
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheetsApi = google.sheets({ version: 'v4', auth });
  return _sheetsApi;
}

// ── كاش قصير المدى لكل تبويب لتقليل عدد الطلبات ضمن نفس التِك ──
const _cache = new Map<string, { rows: SheetRow[]; fetchedAt: number }>();
const CACHE_TTL_MS = 3000;

function invalidate(tab: SheetTab): void {
  _cache.delete(tab);
}

function headerFor(tab: SheetTab): readonly string[] {
  return TAB_HEADERS[tab];
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rowToObject(headers: readonly string[], rowArray: unknown[]): Record<string, string | number> {
  const obj: Record<string, string | number> = {};
  headers.forEach((h, i) => {
    const v = rowArray[i];
    obj[h] = v === undefined || v === null ? '' : (v as string | number);
  });
  return obj;
}

function objectToRow(headers: readonly string[], obj: Record<string, unknown>): (string | number)[] {
  return headers.map((h) => {
    const v = obj[h];
    return v === undefined || v === null ? '' : (v as string | number);
  });
}

// ── تهيئة تلقائية لمرة واحدة لكل بداية تشغيل (بديل ensureSchema() في db.ts القديم) ──
let _readyPromise: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!_readyPromise) _readyPromise = ensureHeaders();
  return _readyPromise;
}

export async function getRows(tab: SheetTab): Promise<SheetRow[]> {
  const cached = _cache.get(tab);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.rows;

  await ensureReady();
  const headers = headerFor(tab);
  const sheets = getSheetsApi();
  const range = `${tab}!A2:${colLetter(headers.length)}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const values: unknown[][] = res.data.values || [];

  const rows: SheetRow[] = values
    .map((arr, i) => ({ _row: i + 2, ...rowToObject(headers, arr) }) as SheetRow)
    .filter((r) => headers.some((h) => r[h] !== '' && r[h] !== undefined));

  _cache.set(tab, { rows, fetchedAt: Date.now() });
  return rows;
}

export async function appendRow(tab: SheetTab, obj: Record<string, unknown>): Promise<void> {
  return appendRows(tab, [obj]);
}

export async function appendRows(tab: SheetTab, objs: Record<string, unknown>[]): Promise<void> {
  if (!objs.length) return;
  await ensureReady();
  const headers = headerFor(tab);
  const sheets = getSheetsApi();
  const values = objs.map((o) => objectToRow(headers, o));
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  invalidate(tab);
}

export interface RowUpdate {
  row: number;
  obj: Record<string, unknown>;
}

export async function updateRow(tab: SheetTab, rowNumber: number, obj: Record<string, unknown>): Promise<void> {
  return batchUpdateRows(tab, [{ row: rowNumber, obj }]);
}

export async function batchUpdateRows(tab: SheetTab, updates: RowUpdate[]): Promise<void> {
  if (!updates.length) return;
  const headers = headerFor(tab);
  const sheets = getSheetsApi();
  const data = updates.map(({ row, obj }) => ({
    range: `${tab}!A${row}:${colLetter(headers.length)}${row}`,
    values: [objectToRow(headers, obj)],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  });
  invalidate(tab);
}

/** Update a single column for many rows without rewriting the rest of the row.
 *  Critical for files_handler: rewriting content_base64 can wipe large cells. */
export async function batchUpdateColumn(
  tab: SheetTab,
  column: string,
  updates: Array<{ row: number; value: string | number }>,
): Promise<void> {
  if (!updates.length) return;
  const headers = headerFor(tab);
  const colIndex = headers.indexOf(column);
  if (colIndex < 0) throw new Error(`Unknown column ${column} on tab ${tab}`);
  const letter = colLetter(colIndex + 1);
  const sheets = getSheetsApi();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates.map(({ row, value }) => ({
        range: `${tab}!${letter}${row}`,
        values: [[value]],
      })),
    },
  });
  invalidate(tab);
}

const _sheetIdCache = new Map<string, number>();
async function getSheetId(tab: SheetTab): Promise<number> {
  if (_sheetIdCache.has(tab)) return _sheetIdCache.get(tab)!;
  const sheets = getSheetsApi();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of meta.data.sheets as any[]) {
    _sheetIdCache.set(s.properties.title, s.properties.sheetId);
  }
  const id = _sheetIdCache.get(tab);
  if (id === undefined) {
    throw new Error(`Sheet tab not found: ${tab}. Run ensureHeaders() or create it manually first.`);
  }
  return id;
}

export async function deleteRows(tab: SheetTab, rowNumbers: number[]): Promise<void> {
  if (!rowNumbers.length) return;
  const sheetId = await getSheetId(tab);
  const sheets = getSheetsApi();
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  const requests = sorted.map((row) => ({
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
    },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
  invalidate(tab);
}

export async function ensureHeaders(): Promise<void> {
  const sheets = getSheetsApi();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingTitles = new Set((meta.data.sheets as any[]).map((s) => s.properties.title));

  const allTabs = Object.keys(TAB_HEADERS) as SheetTab[];
  const missingTabs = allTabs.filter((t) => !existingTitles.has(t));
  if (missingTabs.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })) },
    });
  }

  for (const tab of allTabs) {
    const headers = TAB_HEADERS[tab];
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A1:1` });
    const firstRow = (res.data.values || [])[0];
    if (!firstRow || firstRow.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  }
}

export async function nextId(tab: SheetTab): Promise<number> {
  const rows = await getRows(tab);
  let max = 0;
  for (const r of rows) {
    const id = Number(r.id) || 0;
    if (id > max) max = id;
  }
  return max + 1;
}
