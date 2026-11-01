/**
 * Postcard MVP: event logger for Google Sheets.
 *
 * Setup (about 5 minutes):
 *  1. Create a new Google Sheet. Extensions → Apps Script. Paste this file over Code.gs.
 *  2. Pick `setup` in the function dropdown and click Run (approve the permissions).
 *     This creates the "Events", "Summary" and "Accounts" tabs. Re-run it any time;
 *     it rebuilds Summary and Accounts and never touches logged events.
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
  const events = setupEvents(ss);
  buildSummary(ss);
  buildAccounts(ss);
  Logger.log('Set up "Events", "Summary" and "Accounts" tabs in: ' + ss.getName() + '  ' + ss.getUrl());
  showAdminKey();
  return events;
}

/* ---------- Events: the raw log, one row per action ---------- */
const HEADER_NOTES = {
  timestamp: 'When it happened (spreadsheet time zone)',
  event: 'What happened, e.g. trip_started, list_shared, friend_opened',
  uid: 'Anonymous device id: one per phone/browser',
  ref: 'Recruit tag from ?r= in the invite link. "test" rows are excluded from Summary.',
  role: 'owner = the traveler, friend = someone opening a shared link, owner_preview = owner opening their own link',
  tripId: 'Which postcard',
  city: 'Postcard city',
  numPlaces: 'Places on the postcard at that moment',
  seconds: 'ranking_finished only: seconds from starting the postcard',
  detail: 'Extra info as JSON (tier, place, name/email on sign-up, ...)',
  account: 'Account id of whoever was signed in',
};
function setupEvents(ss) {
  const events = ss.getSheetByName('Events') || ss.insertSheet('Events', 0);
  const head = events.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS]).setFontWeight('bold').setBackground('#efe7d6')
    .setNotes([HEADERS.map(function (h) { return HEADER_NOTES[h] || ''; })]);
  events.setFrozenRows(1);
  // Older rows stored the time as text; turn them into real dates so time filters work.
  const last = events.getLastRow();
  if (last > 1) {
    const col = events.getRange(2, 1, last - 1, 1);
    col.setValues(col.getValues().map(function (r) {
      const v = r[0];
      if (typeof v !== 'string' || !v) return [v];
      const d = new Date(v);
      return [isNaN(d.getTime()) ? v : d];
    }));
  }
  events.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  events.setColumnWidth(1, 160); events.setColumnWidth(2, 150); events.setColumnWidth(10, 280);
  return events;
}

/* ---------- Summary: every headline number, all time and last 7 days ---------- */
function buildSummary(ss) {
  const sum = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  sum.clear();
  const C = { ts: 'Events!A2:A', event: 'Events!B2:B', uid: 'Events!C2:C', ref: 'Events!D2:D', role: 'Events!E2:E', trip: 'Events!F2:F', places: 'Events!H2:H', secs: 'Events!I2:I', detail: 'Events!J2:J' };
  // FILTER conditions shared by every metric: the event name, no "test" rows, and optionally the last 7 days.
  function conds(event, extra, week) {
    return [C.event + '="' + event + '"', C.ref + '<>"test"'].concat(extra || []).concat(week ? [C.ts + '>=NOW()-7'] : []).join(', ');
  }
  const people = function (event, extra) { return function (w) { return 'IFERROR(COUNTUNIQUE(FILTER(' + C.uid + ', ' + conds(event, extra, w) + ')),0)'; }; };
  const times = function (event, extra) { return function (w) { return 'IFERROR(ROWS(FILTER(' + C.event + ', ' + conds(event, extra, w) + ')),0)'; }; };
  const postcards = function (event, extra) { return function (w) { return 'IFERROR(COUNTUNIQUE(FILTER(' + C.trip + ', ' + conds(event, extra, w) + ')),0)'; }; };
  const FRIEND = [C.role + '="friend"'];
  const FIVE = [C.places + '>=5'];

  // [section] or [id, label, formula-builder | {ratio:[a,b]} | {plus:[a,b]}, format, note]
  const spec = [
    ['Visitors & sign-up'],
    ['appVisitors', 'Unique visitors to the app', people('app_open'), '0', 'Different devices that opened Postcard'],
    ['appOpens', 'App visits (total)', times('app_open'), '0', 'Includes repeat visits'],
    ['sawSignup', 'Saw the sign-up screen', people('signup_viewed'), '0', ''],
    ['accounts', 'Created an account', people('account_created'), '0', ''],
    ['signupRate', '% who finished sign-up', { ratio: ['accounts', 'sawSignup'] }, '0%', 'Drop-off caused by requiring an account'],
    ['logins', 'Log-ins', times('logged_in'), '0', 'Returning users signing back in'],

    ['Ranking (the research question)'],
    ['starters', 'People who started a postcard', people('trip_started'), '0', ''],
    ['trips', 'Postcards started', postcards('trip_started'), '0', ''],
    ['placesRanked', 'Places ranked', times('place_added'), '0', ''],
    ['avgPlaces', 'Average places per postcard', { ratio: ['placesRanked', 'trips'] }, '0.0', ''],
    ['ranked5', 'People who ranked 5+ places', people('ranking_finished', FIVE), '0', ''],
    ['rank5Rate', '% who ranked 5+ places', { ratio: ['ranked5', 'starters'] }, '0%', 'TARGET: at least 50%'],
    ['medianMin', 'Median minutes to finish (5+ places)', function (w) { return 'IFERROR(MEDIAN(FILTER(' + C.secs + ', ' + conds('ranking_finished', FIVE, w) + '))/60,"")'; }, '0.0', 'Includes idle time'],
    ['mediaPlaces', 'Places with photos or video', function (w) { return 'IFERROR(ROWS(FILTER(' + C.event + ', ' + conds('place_added', ['REGEXMATCH(' + C.detail + ', "(photos|videos).:[1-9]")'], w) + ')),0)'; }, '0', 'Media attached while ranking'],

    ['Sharing'],
    ['sharers', 'People who shared a postcard', people('list_shared'), '0', ''],
    ['shareRate', '% who shared', { ratio: ['sharers', 'starters'] }, '0%', 'TARGET: at least 10%'],
    ['shares', 'Shares (total)', times('list_shared'), '0', 'Share-sheet sends + "Copy" taps'],

    ['Postcard reach'],
    ['visitors', 'Unique visitors to shared postcards', people('friend_opened', FRIEND), '0', 'Different people who opened a friend\'s link'],
    ['visits', 'Link visits (total)', times('friend_opened', FRIEND), '0', 'Opens by someone other than the owner, repeats included'],
    ['visitsPer', 'Visits per unique visitor', { ratio: ['visits', 'visitors'] }, '0.0', ''],
    ['visitedTrips', 'Postcards with at least 1 visit', postcards('friend_opened', FRIEND), '0', ''],
    ['previews', 'Owner previews', times('friend_opened', [C.role + '="owner_preview"']), '0', 'Owners opening their own link'],
    ['exampleViews', 'Example postcard views', times('example_viewed'), '0', ''],
    ['impressions', 'Impressions', { plus: ['visits', 'previews', 'exampleViews'] }, '0', 'Every time any postcard was shown'],

    ['What visitors did'],
    ['saves', 'Places saved ("Save for my trip")', times('friend_saved'), '0', ''],
    ['savers', 'Visitors who saved at least 1 place', people('friend_saved'), '0', ''],
    ['saveRate', '% of visitors who saved', { ratio: ['savers', 'visitors'] }, '0%', ''],
    ['mapClicks', 'Open in Maps clicks', times('friend_map_click'), '0', ''],
    ['converts', 'Visitors who started their own postcard', people('friend_started_own'), '0', 'Viral-loop signal'],
    ['convertRate', '% of visitors who started their own', { ratio: ['converts', 'visitors'] }, '0%', ''],

    ['Map & media'],
    ['mapViews', 'Travel map views', times('map_viewed'), '0', 'Shown after finishing a postcard'],
    ['mediaAdds', 'Photos/videos added later', times('media_added'), '0', 'Added to a postcard after ranking'],
  ];

  const TOP = 3; // rows 1-2 are the title and column headers
  const rowOf = {};
  spec.forEach(function (r, i) { if (r.length > 1) rowOf[r[0]] = TOP + i; });
  const cell = function (id, col) { return col + rowOf[id]; };
  const formula = function (f, col, week) {
    if (typeof f === 'function') return '=' + f(week);
    if (f.ratio) return '=IFERROR(' + cell(f.ratio[0], col) + '/' + cell(f.ratio[1], col) + ',0)';
    return '=' + f.plus.map(function (id) { return cell(id, col); }).join('+');
  };

  sum.getRange(1, 1).setValue('Postcard summary: updates automatically. Rows tagged "test" are excluded.').setFontWeight('bold').setFontSize(12);
  sum.getRange(2, 1, 1, 4).setValues([['Metric', 'All time', 'Last 7 days', 'Notes']]).setFontWeight('bold').setBackground('#efe7d6');
  spec.forEach(function (r, i) {
    const row = TOP + i;
    if (r.length === 1) {
      sum.getRange(row, 1, 1, 4).setValues([[r[0], '', '', '']]).setFontWeight('bold').setBackground('#f7f2e8');
      return;
    }
    sum.getRange(row, 1, 1, 4).setValues([[r[1], formula(r[2], 'B', false), formula(r[2], 'C', true), r[4]]]);
    sum.getRange(row, 2, 1, 2).setNumberFormat(r[3]).setHorizontalAlignment('right');
    if (/TARGET/.test(r[4])) sum.getRange(row, 1, 1, 4).setFontWeight('bold');
  });
  sum.setFrozenRows(2);
  sum.setColumnWidth(1, 320); sum.setColumnWidth(2, 100); sum.setColumnWidth(3, 100); sum.setColumnWidth(4, 380);
  sum.getRange(1, 4, TOP + spec.length, 1).setFontColor('#6b7680');
}

/* ---------- Accounts: everyone who signed up ---------- */
function buildAccounts(ss) {
  const sh = ss.getSheetByName('Accounts') || ss.insertSheet('Accounts');
  sh.clear();
  const isAcct = '(Events!B2:B="account_created")+(Events!B2:B="account_synced")';
  const field = function (name) { return '=IFERROR(ARRAYFORMULA(IFERROR(REGEXEXTRACT(FILTER(Events!J2:J, ' + isAcct + '), """' + name + '"":""([^""]*)"""), "")), "")'; };
  sh.getRange(1, 1, 1, 5).setValues([['Joined', 'Name', 'Email', 'Recruit tag', 'Device']]).setFontWeight('bold').setBackground('#efe7d6');
  sh.getRange(2, 1, 1, 5).setFormulas([[
    '=IFERROR(FILTER(Events!A2:A, ' + isAcct + '), "No accounts yet")',
    field('name'),
    field('email'),
    '=IFERROR(FILTER(Events!D2:D, ' + isAcct + '), "")',
    '=IFERROR(FILTER(Events!C2:C, ' + isAcct + '), "")',
  ]]);
  sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 240);
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
    sheet.appendRow(HEADERS.map(function (h) { return h === 'timestamp' ? new Date(d.ts) : (d[h] === undefined ? '' : d[h]); }));
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
