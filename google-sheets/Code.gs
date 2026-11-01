/**
 * Postcard MVP: event logger for Google Sheets.
 *
 * Setup (about 5 minutes):
 *  1. Create a new Google Sheet. Extensions → Apps Script. Paste this file over Code.gs.
 *  2. Pick `setup` in the function dropdown and click Run (approve the permissions).
 *     This creates the "Events" and "Summary" tabs.
 *  3. Deploy → New deployment → type "Web app".
 *     Execute as: Me. Who has access: Anyone. Click Deploy and copy the /exec URL.
 *  4. Paste that URL into LOG_URL in config.js.
 *  5. The Execution log from `setup` prints your ADMIN KEY. Enter it on admin.html to
 *     see the analytics dashboard. Run `showAdminKey` any time to see it again.
 *
 * After editing this file, publish the change: Deploy → Manage deployments → ✏️ →
 * Version: "New version" → Deploy. The /exec URL stays the same.
 */

const HEADERS = ['timestamp', 'event', 'uid', 'ref', 'role', 'tripId', 'city', 'numPlaces', 'seconds', 'detail', 'account'];

function setup() {
  const ss = SpreadsheetApp.getActive();
  const events = ss.getSheetByName('Events') || ss.insertSheet('Events');
  events.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  events.setFrozenRows(1);

  // Summary tab: the success thresholds from the MVP plan, computed live.
  // Columns: B=event C=uid E=role H=numPlaces I=seconds
  const sum = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  const rows = [
    ['Metric', 'Value', 'Notes'],
    ['Participants who started a trip', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="trip_started")),0)', 'Unique devices'],
    ['Finished with 5+ places', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="ranking_finished", Events!H2:H>=5)),0)', ''],
    ['% who ranked 5+ places', '=IFERROR(B3/B2,0)', 'Target: at least 50%'],
    ['Median minutes to finish (5+ places)', '=IFERROR(MEDIAN(FILTER(Events!I2:I, Events!B2:B="ranking_finished", Events!H2:H>=5))/60,"")', 'Includes idle time'],
    ['Participants who shared', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="list_shared")),0)', ''],
    ['% who shared', '=IFERROR(B6/B2,0)', 'Target: at least 10%'],
    ['Trips opened by a friend', '=IFERROR(COUNTUNIQUE(FILTER(Events!F2:F, Events!B2:B="friend_opened", Events!E2:E="friend")),0)', 'Self-opens are excluded'],
    ['Friend saves', '=COUNTIF(Events!B2:B,"friend_saved")', '"Saving for my trip" taps'],
    ['Friend map clicks', '=COUNTIF(Events!B2:B,"friend_map_click")', ''],
    ['Friends who started their own postcard', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="friend_started_own")),0)', 'Viral-loop signal'],
    ['Saw the sign-up screen', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="signup_viewed")),0)', 'Unique devices'],
    ['Created an account', '=IFERROR(COUNTUNIQUE(FILTER(Events!C2:C, Events!B2:B="account_created")),0)', ''],
    ['% who finished sign-up', '=IFERROR(B13/B12,0)', 'Drop-off caused by requiring an account'],
    ['Places with photos or video', '=IFERROR(ROWS(FILTER(Events!J2:J, Events!B2:B="place_added", REGEXMATCH(Events!J2:J, "(photos|videos).:[1-9]"))),0)', 'Media attached while ranking'],
  ];
  sum.getRange(1, 1, rows.length, 3).setValues(rows);
  sum.getRange(1, 1, 1, 3).setFontWeight('bold');
  sum.getRange('B4').setNumberFormat('0%');
  sum.getRange('B7').setNumberFormat('0%');
  sum.getRange('B14').setNumberFormat('0%');
  sum.getRange('B5').setNumberFormat('0.0');
  sum.autoResizeColumns(1, 3);
  Logger.log('Created "Events" and "Summary" tabs in: ' + ss.getName() + '  ' + ss.getUrl());
  showAdminKey();
  return events;
}

// The dashboard's password. Stored in this script's properties, never in the public repo.
function adminKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('ADMIN_KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '').slice(0, 16); props.setProperty('ADMIN_KEY', key); }
  return key;
}
function showAdminKey() { Logger.log('Your admin key: ' + adminKey()); }

function doPost(e) {
  if (!e || !e.postData) return setup(); // clicked Run on doPost in the editor: do setup instead
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActive().getSheetByName('Events') || setup();
    sheet.appendRow(HEADERS.map(function (h) { return h === 'timestamp' ? d.ts : (d[h] === undefined ? '' : d[h]); }));
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

// admin.html calls ?key=<admin key> to read every event as JSON.
function doGet(e) {
  const key = e && e.parameter && e.parameter.key;
  if (!key) return ContentService.createTextOutput('Postcard logger is running.');
  if (key !== adminKey()) return json({ error: 'Wrong admin key' });
  const sheet = SpreadsheetApp.getActive().getSheetByName('Events');
  const values = sheet ? sheet.getDataRange().getValues() : [HEADERS];
  const head = values[0];
  const rows = values.slice(1).map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
  return json({ rows: rows, generated: new Date().toISOString() });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
