// Google Apps Script for the venue's bookings Sheet and Calendar.
// The website's server function (functions/api/book.js) sends each table request here. This script:
//   1. adds one row to the first sheet (headers are written on the first request)
//   2. adds an event to the Google Calendar of the account that deployed it
// Setup: booking-test-accounts-setup.md, part 2. After any edit: Deploy, Manage deployments,
// Edit, New version, otherwise the old code keeps running.
//
// Only the website's server knows SECRET, so strangers who find this script's URL cannot add rows.
// Use the same long random text as SHEET_SECRET in .dev.vars / Cloudflare.
const SECRET = 'PASTE-THE-SAME-SECRET-AS-SHEET_SECRET';
// Leave empty for the account's main calendar, or paste a calendar ID (Calendar settings,
// "Integrate calendar") to use a separate bookings calendar.
const CALENDAR_ID = '';
const HEADERS = ['Received', 'Type', 'Name', 'Phone', 'Party size', 'Seating', 'Day', 'Time', 'Notes', 'Status'];
const STATUSES = ['New', 'Confirmed', 'Seated', 'Cancelled'];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'bad json' });
  }
  if (data.secret !== SECRET || !Array.isArray(data.row)) return reply({ ok: false, error: 'not allowed' });

  // Several requests at the same moment: take turns so no row overwrites another.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    // A leading ' stops Sheets reading "+971..." or "=..." as a number or formula.
    // Party size (column 5) stays a real number, so the sheet can add up guests.
    sheet.appendRow(data.row.map((v, i) => (i === 4 ? Number(v) : "'" + String(v))));
    // Status (last column) becomes a dropdown: New, Confirmed, Seated, Cancelled.
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sheet.getRange(sheet.getLastRow(), HEADERS.length).setValue('New').setDataValidation(rule);
  } finally {
    lock.releaseLock();
  }

  // The calendar event. A failure here never loses the row, which is already saved.
  let calendar = 'skipped';
  if (data.event && data.event.start && data.event.end) {
    try {
      const cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
      cal.createEvent(data.event.title, new Date(data.event.start), new Date(data.event.end), { description: data.event.description || '' });
      calendar = 'added';
    } catch (err) {
      calendar = 'failed: ' + err;
    }
  }
  return reply({ ok: true, calendar: calendar });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
