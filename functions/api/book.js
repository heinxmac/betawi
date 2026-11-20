// Table requests from the booking sheet land here (POST /api/book).
// A Cloudflare Pages Function: Cloudflare runs it on its servers, so the keys below never reach
// the visitor's browser. Everything venue-specific comes from
// src/content/restaurant.json. Differences for Betawi: seating (terrace, inside) instead of an occasion,
// and up to 12 guests. The guest asks for a table; the restaurant confirms on WhatsApp.
//
// For each request it does up to three things, side by side:
//   1. Google Sheet row + Google Calendar event (one call to the Apps Script in google-sheet/)
//   2. Notion card in a bookings database (status New, then Confirmed / Seated by hand)
//   3. Telegram alert to the venue, with buttons that open WhatsApp to the guest with the reply
//      already written ("Your table for 4 on Friday 7 November at 8 PM is confirmed.")
// The visitor only sees "Request sent" if at least one of them worked, so nothing is lost silently.
//
// Settings (Cloudflare Pages -> Settings -> Variables, as Secrets; on this PC the git-ignored file
// .dev.vars). heinx enters them. Never put the values in code or git.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID    the bot from @BotFather and the chat it alerts
//   SHEET_WEBHOOK_URL, SHEET_SECRET         the Apps Script web app and its shared secret
//   NOTION_TOKEN, NOTION_DB_ID              the integration secret and the database it may write to
// Any part whose settings are missing is skipped, so you can start with one.

import venue from '../../src/content/restaurant.json';
import { bookableDays, dayLabel, slotOpen, slotTimes, timeLabel } from '../../src/lib/slots.js';

const UTC_OFFSET = '+04:00'; // Dubai has no daylight saving
const LIMITS = { name: 60, phone: 20, notes: 500 };
const PARTS = {
  sheet: ['SHEET_WEBHOOK_URL', 'SHEET_SECRET'],
  notion: ['NOTION_TOKEN', 'NOTION_DB_ID'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
};

// Local dev only: open /api/book on localhost to check the setup. It says which settings exist, never their values.
export async function onRequestGet({ request, env }) {
  const host = new URL(request.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return new Response('Not found', { status: 404 });
  const status = Object.fromEntries(
    Object.entries(PARTS).map(([part, keys]) => {
      const missing = keys.filter((k) => !env[k]);
      return [part, missing.length ? `missing ${missing.join(', ')}` : 'set'];
    }),
  );
  return json(200, status);
}

export async function onRequestPost({ request, env }) {
  // Only pages of this site may send a request (a cheap guard against other sites and scripts).
  const origin = request.headers.get('origin');
  if (origin) {
    const { hostname } = new URL(origin);
    const here = new URL(request.url).hostname;
    if (hostname !== here && hostname !== 'localhost' && hostname !== '127.0.0.1') return reply(403, 'not allowed');
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return reply(400, 'invalid');
  }
  const text = (key) => String(body?.[key] ?? '').trim().slice(0, LIMITS[key]);

  // Spam trap: a hidden "website" box people never see. Bots fill every box: pretend it worked.
  if (String(body?.website ?? '')) return reply(200, 'ok');

  const party = Number(body?.party);
  // "3 to 4" when the guest picked a group. Only a plain range that ends at the booked number is kept.
  const rawLabel = String(body?.partyLabel ?? '');
  const rm = /^(\d{1,2}) to (\d{1,2})$/.exec(rawLabel);
  const partyText = rm && Number(rm[2]) === party && Number(rm[1]) < party ? rawLabel : String(party);
  const seating = String(body?.seating ?? '');
  const day = String(body?.day ?? '');
  const time = String(body?.time ?? '');
  const details = { name: text('name'), phone: text('phone'), notes: text('notes') };
  const digits = details.phone.replace(/\D/g, '');
  const { maxParty, seating: seatingChoices, durationMinutes = 90 } = venue.reservations;

  // Check everything again here: the page does too, but a request can be sent without the page.
  const valid =
    Number.isInteger(party) && party >= 1 && party <= maxParty &&
    (seating === '' || seatingChoices.includes(seating)) &&
    bookableDays(venue).includes(day) &&
    slotTimes(venue).includes(time) &&
    details.name && digits.length >= 7 && digits.length <= 15 &&
    body?.consent === true;
  if (!valid) return reply(400, 'invalid');
  // The page greys out times that are too soon or closed; this stops an old open page sending one.
  if (!slotOpen(venue, day, time)) return reply(400, 'time passed');

  const startIso = `${day}T${time}:00${UTC_OFFSET}`;
  const booking = {
    ...details,
    party,
    partyText,
    seating,
    day,
    time,
    dayText: dayLabel(day), // "Friday 7 November"
    timeText: timeLabel(time), // "8 PM"
    startIso,
    endIso: new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString(),
    received: venueNow(),
    whatsapp: `https://wa.me/${toInternational(digits)}`,
  };

  const names = ['sheet', 'notion', 'telegram'];
  const results = await Promise.allSettled([saveToSheet(booking, env), saveToNotion(booking, env), sendTelegram(booking, env)]);
  results.forEach((r) => r.status === 'rejected' && console.error(r.reason));
  const saved = results.some((r) => r.status === 'fulfilled' && r.value === true);
  // Which part failed, to help with setup: visible in the browser's network tab. Only the part's
  // name goes to the browser. The reason (which can echo an upstream error body or an ID) goes to
  // the Cloudflare function log above, never to the public response.
  const problems = results
    .map((r, i) => (r.status === 'rejected' ? `${names[i]}: failed (see function log)` : r.value ? null : `${names[i]} not set up`))
    .filter(Boolean);
  if (booking.calendar && booking.calendar !== 'added') problems.push('calendar: not added (see function log)');
  return reply(saved ? 200 : 502, saved ? 'ok' : 'failed', problems.length ? problems : undefined);
}

// ---------- Google Sheet row + Calendar event (google-sheet/Code.gs) ----------
// Sheet columns: Received, Type, Name, Phone, Party size, Seating, Day, Time, Notes, Status
async function saveToSheet(b, env) {
  if (!env.SHEET_WEBHOOK_URL || !env.SHEET_SECRET) return false;
  const res = await fetch(env.SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: env.SHEET_SECRET,
      row: [b.received, 'Table', b.name, b.phone, b.party, b.seating, b.dayText, b.timeText, b.notes, 'New'],
      event: {
        title: `Table for ${b.partyText ?? b.party}: ${b.name}`,
        start: b.startIso,
        end: b.endIso,
        description: [`Phone: ${b.phone}`, b.seating && `Seating: ${b.seating}`, b.notes && `Notes: ${b.notes}`, `WhatsApp: ${b.whatsapp}`]
          .filter(Boolean)
          .join('\n'),
      },
    }),
  });
  // The script answers {"ok":true} only after the row is really written.
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Sheet did not save the request (${res.status}${data.error ? `, ${data.error}` : ''})`);
  if (data.calendar && data.calendar !== 'added') console.error(`calendar: ${data.calendar}`);
  b.calendar = data.calendar ?? 'unknown';
  return true;
}

// ---------- Notion card ----------
// The database needs these columns (exact names): Name (title), Guests (number),
// Date/Time (date), Phone (phone), Notes (text), Status (select: New, Confirmed, Seated).
async function saveToNotion(b, env) {
  if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) return false;
  const notes = [b.seating && `Seating: ${b.seating}`, b.notes].filter(Boolean).join('. ');
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.NOTION_TOKEN}`,
      'notion-version': '2022-06-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DB_ID.replace(/-/g, '') },
      properties: {
        Name: { title: [{ text: { content: b.name } }] },
        Guests: { number: b.party },
        'Date/Time': { date: { start: b.startIso } },
        Phone: { phone_number: b.phone },
        Notes: { rich_text: notes ? [{ text: { content: notes.slice(0, 1900) } }] : [] },
        Status: { select: { name: 'New' } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Notion refused the card (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return true;
}

// ---------- Telegram ----------
async function sendTelegram(b, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  // Plain text (no Markdown), so names with * or _ cannot break the message.
  const message = [
    'New table request',
    '',
    `Guests: ${b.partyText ?? b.party}`,
    ...(b.seating ? [`Seating: ${b.seating}`] : []),
    `Day: ${b.dayText}`,
    `Time: ${b.timeText}`,
    `Name: ${b.name}`,
    `Phone: ${b.phone}`,
    ...(b.notes ? [`Notes: ${b.notes}`] : []),
    '',
    'Tap a button: WhatsApp opens to the guest with the reply written. Check it and press send.',
    `Received: ${b.received}`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: replyButtons(b) },
    }),
  });
  if (!res.ok) throw new Error(`Telegram refused the message (${res.status})`);
  return true;
}

// Buttons under the Telegram alert, each a one-tap WhatsApp reply to the guest:
//   [Confirm 8 PM]
//   [Fully booked]
//   [Open the chat]
export function replyButtons(b) {
  const link = (choice) => `${b.whatsapp}?text=${encodeURIComponent(replyText(b, choice))}`;
  const times = slotTimes(venue);
  const index = times.indexOf(b.time);
  const others = [times[index - 1], times[index + 1]].filter((t) => t && slotOpen(venue, b.day, t));
  return [
    [{ text: `Confirm ${b.timeText}`, url: link({ confirm: true }) }],
    ...(others.length ? [others.map((t) => ({ text: `Offer ${timeLabel(t)}`, url: link({ offer: t }) }))] : []),
    [{ text: 'Fully booked', url: link({ full: true }) }],
    [{ text: 'Open the chat', url: b.whatsapp }],
  ];
}

export function replyText(b, choice) {
  const asked = `${b.dayText} at ${b.timeText}`;
  const middle = choice.confirm
    ? `Your table for ${b.partyText ?? b.party} on ${asked} is confirmed. See you then!`
    : choice.offer
      ? `We're full at ${b.timeText} on ${b.dayText}, but we have a table for ${b.partyText ?? b.party} at ${timeLabel(choice.offer)}. Would that work for you?`
      : `Sorry, we're fully booked on ${asked}. Would another time or day suit you?`;
  return [`Hi ${b.name}, this is ${venue.shortName}. Thank you for your table request.`, '', middle, '', venue.shortName].join('\n');
}

// ---------- Helpers ----------

// "07/11/2026, 11:45" in the venue's time, whatever the server's own clock zone is
function venueNow() {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// UAE numbers typed as "055 616 3512" become "971556163512" for the wa.me link
function toInternational(digits) {
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `971${digits.slice(1)}`;
  return digits;
}

function reply(status, result, problems) {
  return json(status, { result, problems });
}

function json(status, data) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json' } });
}
