// The booking time rules, shared by the booking sheet (in the visitor's browser) and the server
// function (functions/api/book.js), so both always agree on which days and times can be booked.
// Plain JavaScript (not TypeScript) so the server function can import it as it is.
//
// All times are local time in TIME_ZONE, whatever clock zone the visitor's phone or the server is in.
// The rules come from the venue's content file (src/content/restaurant.json):
//   hours.week[]                  { day: "Monday", opens: "11:30", closes: "22:30" } per weekday
//                                 (or the older single hours.opens / hours.closes for every day)
//   reservations.slotMinutes      one table time every N minutes
//   reservations.lastSeating      last table time ("21:30"), or
//   reservations.lastSeatingBeforeClose   minutes before each day's closing time
//   reservations.noticeMinutes    a table today must be at least this far away
//   reservations.daysAhead        how many days can be chosen

const TIME_ZONE = 'Asia/Dubai';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "16:30" -> 990 (minutes since midnight) */
export const toMinutes = (hhmm) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

/** 990 -> "16:30" */
const fromMinutes = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Today's date in the venue's time zone ("2026-10-25") and the minutes since midnight there. */
export function dubaiClock(date = new Date()) {
  const [today, hhmm] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).split(' ');
  return { today, now: toMinutes(hhmm) };
}

/** "2026-10-25" -> "Sunday" */
export const weekdayOf = (dayValue) => WEEKDAYS[new Date(`${dayValue}T12:00:00Z`).getUTCDay()];

/** Opening hours on one date: { opens: "11:30", closes: "22:30" }, or null if closed that day. */
export function dayHours(restaurant, dayValue) {
  const { hours } = restaurant;
  if (!hours.week) return { opens: hours.opens, closes: hours.closes };
  return hours.week.find((entry) => entry.day === weekdayOf(dayValue)) ?? null;
}

/** The last table time on one date, in minutes. */
function lastSeatingOn(restaurant, hoursToday) {
  const { lastSeating, lastSeatingBeforeClose = 0 } = restaurant.reservations;
  return lastSeating ? toMinutes(lastSeating) : toMinutes(hoursToday.closes) - lastSeatingBeforeClose;
}

/** Every table time in any day, earliest opening to latest last table: ["10:30", "11:00", ...]. */
export function slotTimes(restaurant) {
  const { slotMinutes } = restaurant.reservations;
  const days = restaurant.hours.week ?? [restaurant.hours];
  const first = Math.min(...days.map((d) => toMinutes(d.opens)));
  const last = Math.max(...days.map((d) => lastSeatingOn(restaurant, d)));
  const times = [];
  for (let t = first; t <= last; t += slotMinutes) times.push(fromMinutes(t));
  return times;
}

/** True when this table time on this date can be booked: open then, and (today) far enough ahead. */
export function slotOpen(restaurant, dayValue, time, clock = dubaiClock()) {
  if (!dayValue || dayValue < clock.today) return false;
  const hoursToday = dayHours(restaurant, dayValue);
  if (!hoursToday) return false;
  const t = toMinutes(time);
  if (t < toMinutes(hoursToday.opens) || t > lastSeatingOn(restaurant, hoursToday)) return false;
  if (dayValue > clock.today) return true;
  return t >= clock.now + restaurant.reservations.noticeMinutes;
}

/**
 * The days that can be chosen, as dates like "2026-10-25". Today is left out once no table time
 * is left today, and so is any closed day.
 */
export function bookableDays(restaurant, clock = dubaiClock()) {
  const times = slotTimes(restaurant);
  const [year, month, day] = clock.today.split('-').map(Number);
  const days = [];
  for (let i = 0; days.length < restaurant.reservations.daysAhead && i < restaurant.reservations.daysAhead + 7; i++) {
    // Noon UTC keeps the date stable whatever the device's own time zone is.
    const value = new Date(Date.UTC(year, month - 1, day + i, 12)).toISOString().slice(0, 10);
    if (times.some((time) => slotOpen(restaurant, value, time, clock))) days.push(value);
  }
  return days;
}

/**
 * "2026-10-25" -> "Saturday 25 October" (or another format, e.g. { weekday: 'short' }).
 * @param {string} dayValue
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function dayLabel(dayValue, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${dayValue}T12:00:00Z`));
}

/** "19:00" -> "7 PM", "12:30" -> "12:30 PM" */
export function timeLabel(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const hour12 = hours % 12 || 12;
  return `${hour12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "22:30" -> "10:30 PM" (always with minutes, for the opening hours list) */
export function clockLabel(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}
