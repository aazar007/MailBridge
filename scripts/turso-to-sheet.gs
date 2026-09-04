/**
 * turso-to-sheet.gs
 *
 * ONE-TIME migration helper. The live app now reads/writes Google Sheets
 * directly (lib/sheetsClient.ts). Turso only keeps `send_tokens` (OAuth).
 *
 * Use this script only if you still have leftover rows in Turso tables that
 * need to be copied into the Sheet once. Do NOT sync `send_tokens`.
 *
 * Setup:
 * 1. Open the MailBridge Google Sheet.
 * 2. Extensions > Apps Script, paste this file.
 * 3. Project Settings > Script Properties:
 *      TURSO_DATABASE_URL
 *      TURSO_AUTH_TOKEN
 * 4. Run syncTursoToSheet once and approve permissions.
 */

// Legacy Turso tables to copy (omit send_tokens — stays on Turso).
const TABLES = [
  'work_sessions',
  'files_handler',
  'send_jobs',
  'send_recipients',
  'campaigns',
  'campaign_recipients',
  'campaign_attachments',
];

// Columns to leave out of the exported sheet, per table.
const OMIT_COLUMNS = {
  send_jobs: ['gmail_token', 'outlook_tokens'],
  campaigns: ['smtp_config_json'],
  // Old Turso chunks were up to ~950k chars — omit content; re-upload via app
  // if you need attachment bodies (live app uses ≤40k Sheets-safe chunks).
  files_handler: ['content_base64'],
};

function syncTursoToSheet() {
  const { url, token } = getTursoConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  TABLES.forEach(table => {
    const data = runQuery(url, token, `SELECT * FROM ${table}`);
    writeTableToSheet(ss, table, data, OMIT_COLUMNS[table] || []);
  });

  ss.toast('Synced ' + TABLES.length + ' tables from Turso.', 'Sync complete', 5);
  Logger.log('Turso -> Sheets sync complete: ' + new Date());
}

function getTursoConfig() {
  const props = PropertiesService.getScriptProperties();
  const rawUrl = props.getProperty('TURSO_DATABASE_URL');
  const token = props.getProperty('TURSO_AUTH_TOKEN');
  if (!rawUrl || !token) {
    throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Script Properties first.');
  }
  return { url: rawUrl.replace(/^libsql:\/\//, 'https://'), token };
}

function runQuery(url, token, sql) {
  const res = UrlFetchApp.fetch(url + '/v2/pipeline', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql } },
        { type: 'close' },
      ],
    }),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Turso query failed: ' + res.getContentText());
  }

  const body = JSON.parse(res.getContentText());
  const result = body.results[0].response.result;
  const cols = result.cols.map(c => c.name);
  const rows = result.rows.map(row => row.map(cellValue));
  return { cols, rows };
}

function cellValue(cell) {
  if (!cell || cell.type === 'null') return '';
  if (cell.type === 'integer' || cell.type === 'float') return Number(cell.value);
  return cell.value;
}

function writeTableToSheet(ss, table, data, omitCols) {
  let sheet = ss.getSheetByName(table);
  if (!sheet) sheet = ss.insertSheet(table);
  sheet.clearContents();

  const keep = data.cols
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => omitCols.indexOf(name) === -1);

  const headers = keep.map(({ name }) => name);
  const rows = data.rows.map(row => keep.map(({ i }) => row[i]));

  if (headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, Math.max(headers.length, 1));
}
