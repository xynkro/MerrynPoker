// ============================================================================
// Merryn Poker — Google Apps Script
// Paste into script.google.com > New Project > Save > Deploy > Web App
// Execute as: Me   |   Who has access: Anyone
// Sheet ID: 1VNARRkpb3E67Ggw23iiKG_XDsJFJBEjKq2OzbZwmHvA
// ============================================================================

const SHEET_ID = '1VNARRkpb3E67Ggw23iiKG_XDsJFJBEjKq2OzbZwmHvA';

const RAW_TABLES = [
  'players', 'sessions', 'sessionEntries',
  'floatTransactions', 'carryBalances', 'tablePayments', 'dealerStashTransactions',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonOk(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatTabName(dateStr) {
  // dateStr = "2026-04-13"  →  "13 Apr"
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + months[d.getMonth()];
}

// Move a sheet to the very end and hide it
function hideAndSendToEnd(ss, sheet) {
  sheet.hideSheet();
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());
}

function logSync(ss, direction, rows) {
  let s = ss.getSheetByName('_sync_log');
  if (!s) {
    s = ss.insertSheet('_sync_log');
    s.appendRow(['Timestamp', 'Direction', 'Rows']);
    s.getRange(1,1,1,3).setFontWeight('bold');
  }
  s.appendRow([new Date().toLocaleString(), direction, rows]);
  hideAndSendToEnd(ss, s);
}

// ── POST — receives data from the app ────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // Auto-sync: app sends session + entries on every write
    if (data.action === 'updateSession') {
      return updateSessionTab(ss, data.session, data.entries, data.players);
    }

    // Delete a session tab when a session is deleted in the app
    if (data.action === 'deleteTab') {
      return deleteSessionTab(ss, data.sessionId, data.sessionDate);
    }

    // Manual push from Settings: dump all raw tables
    return pushAllTables(ss, data);

  } catch (err) {
    return jsonErr(err.message);
  }
}

// ── Per-session tab (auto-sync) ───────────────────────────────────────────────
// Layout: S/N | Player | B/I 1 … B/I N | Total B/I | C/O | Sum | Remarks | Dealer stuff

function updateSessionTab(ss, session, entries, players) {
  const baseName = formatTabName(session.date);
  const idSuffix = session.id.slice(-4);

  let tabName = baseName;
  const existing = ss.getSheetByName(baseName);
  if (existing) {
    const marker = existing.getRange('A1').getNote();
    if (marker && marker !== session.id) tabName = baseName + ' #' + idSuffix;
  }

  let sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName, 0); // session tabs stay at front
  sheet.getRange('A1').setNote(session.id);

  const playerMap = {};
  players.forEach(p => playerMap[p.id] = p);

  // Non-dealer, non-deleted entries
  const playerEntries = entries.filter(e => {
    const p = playerMap[e.player_id];
    return p && p.role !== 'dealer' && !e.deleted_at;
  });

  // Dealer entry
  const dealerEntry   = entries.find(e => playerMap[e.player_id]?.role === 'dealer');
  const totalBuyIns   = playerEntries.reduce((s, e) => s + (e.buy_ins || []).reduce((acc, b) => acc + b.amount, 0), 0);
  const totalCashOuts = playerEntries.reduce((s, e) => s + (e.cash_out || 0), 0);
  const dealerTake    = dealerEntry?.cash_out != null ? dealerEntry.cash_out : (totalBuyIns - totalCashOuts);

  // Dynamic buy-in column count = max buy-ins any one player has done
  const NUM_BUYIN_COLS = Math.max(1, ...playerEntries.map(e => (e.buy_ins || []).length));

  // S/N + Player + N buy-in cols + Total B/I + C/O + Sum + Remarks + Dealer stuff
  const TOTAL_COLS = 2 + NUM_BUYIN_COLS + 5; // 2 fixed + N buyin + 5 trailing

  // Column indices (0-based within row array):
  // 0: S/N, 1: Player, 2..2+N-1: B/I cols, 2+N: Total B/I, 2+N+1: C/O, 2+N+2: Sum, 2+N+3: Remarks, 2+N+4: Dealer stuff
  const COL_TOTAL_BI = 2 + NUM_BUYIN_COLS;
  const COL_CO       = COL_TOTAL_BI + 1;
  const COL_SUM      = COL_TOTAL_BI + 2;
  const COL_REMARKS  = COL_TOTAL_BI + 3;
  const COL_DEALER   = COL_TOTAL_BI + 4;

  const headers = ['S/N', 'Player'];
  for (let i = 1; i <= NUM_BUYIN_COLS; i++) headers.push('B/I ' + i);
  headers.push('Total B/I', 'C/O', 'Sum', 'Remarks', 'Dealer stuff');

  // ── Build rows ──────────────────────────────────────────────────────────────
  const rows = playerEntries.map((e, idx) => {
    const player  = playerMap[e.player_id];
    const buyIns  = e.buy_ins || [];
    const totalIn = buyIns.reduce((s, b) => s + b.amount, 0);
    const cashedOut = e.cash_out != null;
    const sum = cashedOut ? e.cash_out - totalIn : '';

    const row = [idx + 1, player ? player.name : '?'];
    for (let i = 0; i < NUM_BUYIN_COLS; i++) row.push(buyIns[i] ? buyIns[i].amount : '');
    row.push(totalIn);
    row.push(cashedOut ? e.cash_out : '');
    row.push(sum);
    row.push(''); // Remarks — filled manually
    row.push(''); // Dealer stuff — filled manually
    return row;
  });

  // ── Write ───────────────────────────────────────────────────────────────────
  sheet.clear();

  // Row 1: date + status info
  sheet.getRange(1, 1).setValue('Date:');
  sheet.getRange(1, 2).setValue(session.date);
  sheet.getRange(1, 4).setValue('Status:');
  sheet.getRange(1, 5).setValue(session.status.toUpperCase());
  sheet.getRange(1, 7).setValue('Last updated:');
  sheet.getRange(1, 8).setValue(new Date().toLocaleString());

  // Row 2: blank
  // Row 3: headers
  sheet.getRange(3, 1, 1, TOTAL_COLS).setValues([headers]);

  // Rows 4+: data
  if (rows.length > 0) {
    sheet.getRange(4, 1, rows.length, TOTAL_COLS).setValues(rows);
  }

  const dataEndRow = 3 + rows.length;

  // Totals row (2 rows below data)
  const totalsRowNum = dataEndRow + 2;
  const totalsRow = new Array(TOTAL_COLS).fill('');
  totalsRow[0]          = 'TOTAL';
  totalsRow[COL_TOTAL_BI] = totalBuyIns;
  totalsRow[COL_CO]       = totalCashOuts;
  totalsRow[COL_SUM]      = totalCashOuts - totalBuyIns;
  sheet.getRange(totalsRowNum, 1, 1, TOTAL_COLS).setValues([totalsRow]);

  // Dealer gets row
  const dealerRowNum = totalsRowNum + 1;
  sheet.getRange(dealerRowNum, 1).setValue('Dealer gets:');
  sheet.getRange(dealerRowNum, 2).setValue(dealerTake);

  // ── Formatting ──────────────────────────────────────────────────────────────
  // Header row — navy background, white bold text
  sheet.getRange(3, 1, 1, TOTAL_COLS)
    .setBackground('#1e3a5f').setFontColor('#ffffff').setFontWeight('bold');

  // Sum column (COL_SUM is 0-based; sheet columns are 1-based)
  const sumSheetCol = COL_SUM + 1;
  for (let i = 0; i < rows.length; i++) {
    const sum = rows[i][COL_SUM];
    if (sum !== '') {
      const cell = sheet.getRange(4 + i, sumSheetCol);
      cell.setFontWeight('bold');
      cell.setFontColor(sum > 0 ? '#00c853' : sum < 0 ? '#ff1744' : '#888888');
    }
    // In-play rows: light yellow background (C/O is blank)
    if (rows[i][COL_CO] === '') {
      sheet.getRange(4 + i, 1, 1, TOTAL_COLS).setBackground('#fffde7');
    }
  }

  // Totals row bold
  sheet.getRange(totalsRowNum, 1, 1, TOTAL_COLS).setFontWeight('bold').setBackground('#f0f0f0');

  // Dealer gets row — green highlight
  sheet.getRange(dealerRowNum, 1, 1, 2).setFontWeight('bold').setFontColor('#00c853');

  // Auto-resize all columns
  for (let i = 1; i <= TOTAL_COLS; i++) sheet.autoResizeColumn(i);

  logSync(ss, 'auto-push', rows.length);
  return jsonOk({ ok: true, tab: tabName, rows: rows.length });
}

// ── Delete session tab ────────────────────────────────────────────────────────

function deleteSessionTab(ss, sessionId, sessionDate) {
  // Find tab by A1 note matching sessionId (most reliable)
  const sheets = ss.getSheets();
  for (const sheet of sheets) {
    const note = sheet.getRange('A1').getNote();
    if (note === sessionId) {
      ss.deleteSheet(sheet);
      logSync(ss, 'delete-tab', 1);
      return jsonOk({ ok: true, deleted: sheet.getName() });
    }
  }

  // Fallback: suffixed name
  const baseName = formatTabName(sessionDate);
  const idSuffix = sessionId.slice(-4);
  const suffixed = baseName + ' #' + idSuffix;
  const fallback = ss.getSheetByName(suffixed);
  if (fallback) {
    ss.deleteSheet(fallback);
    logSync(ss, 'delete-tab', 1);
    return jsonOk({ ok: true, deleted: suffixed });
  }

  return jsonOk({ ok: true, deleted: null, note: 'Tab not found' });
}

// ── Manual full push (Settings button) ───────────────────────────────────────

function pushAllTables(ss, data) {
  for (const table of RAW_TABLES) {
    if (!data[table] || data[table].length === 0) continue;

    let sheet = ss.getSheetByName('_raw_' + table);
    if (!sheet) {
      sheet = ss.insertSheet('_raw_' + table);
    }

    const rows    = data[table];
    const headers = Object.keys(rows[0]);

    sheet.clear();
    sheet.appendRow(headers);

    const values = rows.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
      return val;
    }));

    if (values.length > 0) {
      sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }
    for (let i = 1; i <= headers.length; i++) sheet.autoResizeColumn(i);

    // Hide and move to end
    hideAndSendToEnd(ss, sheet);
  }

  const totalRows = RAW_TABLES.reduce((s, t) => s + (data[t]?.length || 0), 0);
  logSync(ss, 'manual-push', totalRows);

  return jsonOk({ ok: true, rows: totalRows, timestamp: new Date().toISOString() });
}

// ── GET — pull all raw tables back to app ────────────────────────────────────

function doGet(e) {
  try {
    const ss     = SpreadsheetApp.openById(SHEET_ID);
    const result = {};

    for (const table of RAW_TABLES) {
      const sheet = ss.getSheetByName('_raw_' + table);
      if (!sheet || sheet.getLastRow() < 2) { result[table] = []; continue; }

      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows    = [];

      for (let i = 1; i < data.length; i++) {
        const row = {};
        for (let j = 0; j < headers.length; j++) {
          let val = data[i][j];
          if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
            try { val = JSON.parse(val); } catch (_) {}
          }
          if (val === '') val = null;
          row[headers[j]] = val;
        }
        rows.push(row);
      }
      result[table] = rows;
    }

    const totalRows = RAW_TABLES.reduce((s, t) => s + (result[t]?.length || 0), 0);
    logSync(ss, 'pull', totalRows);

    return jsonOk({ ok: true, data: result, timestamp: new Date().toISOString() });

  } catch (err) {
    return jsonErr(err.message);
  }
}
