const ZONE = 'Asia/Jakarta';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = [
  ['sunday', 'minggu', 'sun'], ['monday', 'senin', 'mon'], ['tuesday', 'selasa', 'tue'],
  ['wednesday', 'rabu', 'wed'], ['thursday', 'kamis', 'thu'], ['friday', 'jumat', 'jum\u0027at', 'fri'], ['saturday', 'sabtu', 'sat'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const dateValue = (value) => value instanceof Date ? value : new Date(value);
export function wibParts(value = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(dateValue(value)).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, weekday: DAY_NAMES.indexOf(parts.weekday) };
}
/** Month is one-based; output represents a WIB local wall-clock time. */
export const wibDate = (year, month, day, hour = 0, minute = 0) => new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
export function resolveDay(text, now = Date.now()) {
  const body = String(text).toLowerCase(), current = wibParts(now);
  const midnight = wibDate(current.year, current.month, current.day);
  let offset;
  if (/\b(lusa|day after tomorrow)\b/.test(body)) offset = 2;
  else if (/\b(besok|tomorrow)\b/.test(body)) offset = 1;
  else if (/\b(hari ini|today)\b/.test(body)) offset = 0;
  else {
    const day = WEEKDAYS.findIndex((names) => names.some((name) => new RegExp('\\b' + name + '\\b', 'i').test(body)));
    if (day < 0) return null;
    offset = (day - current.weekday + 7) % 7;
  }
  return new Date(midnight.getTime() + offset * 86400000);
}
export function formatSlot(value) {
  const p = wibParts(value);
  return `${DAY_NAMES[p.weekday]}, ${p.day} ${MONTHS[p.month - 1][0].toUpperCase() + MONTHS[p.month - 1].slice(1)}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} WIB`;
}
export function formatWindow(start, end) {
  const p = wibParts(end);
  return formatSlot(start).replace(' WIB', '') + '–' + String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0') + ' WIB';
}
export function parseSchedule(text, now = Date.now()) {
  const body = String(text).toLowerCase();
  const instant = /\b20\d{2}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})\b/i.exec(body);
  if (instant) {
    const start = new Date(instant[0]);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Number(dateValue(now))) return null;
    const end = new Date(start.getTime() + 7200000);
    return { label: formatWindow(start, end), time_window: { start: start.toISOString(), end: end.toISOString() } };
  }
  if (/\b(?:utc|gmt|wita|wit|pst|pdt|est|edt)\b/.test(body)) return null;
  let day = null;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(body);
  if (iso) {
    day = wibDate(+iso[1], +iso[2], +iso[3]);
    const actual = wibParts(day);
    if (actual.year !== +iso[1] || actual.month !== +iso[2] || actual.day !== +iso[3]) return null;
  } else {
    const date = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|mei|jun(?:e)?|jul(?:y)?|aug(?:ust)?|agu(?:stus)?|sep(?:tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?|des(?:ember)?)(?:\s+(20\d{2}))?\b/.exec(body);
    if (date) {
      let month = date[2].slice(0, 3).replace('mei', 'may').replace('agu', 'aug').replace('okt', 'oct').replace('des', 'dec');
      day = wibDate(date[3] ? +date[3] : wibParts(now).year, MONTHS.indexOf(month) + 1, +date[1]);
      if (wibParts(day).day !== +date[1]) return null;
    } else day = resolveDay(body, now);
  }
  if (!day) return null;
  const dp = wibParts(day);
  let startHour = 8, startMinute = 0, endHour = 17, endMinute = 0;
  let range = /\b(\d{1,2})(?:[:.](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*wib)?\b/.exec(body.replace(/20\d{2}-\d{2}-\d{2}/g, ''));
  if (range && !/[:.]/.test(range[0]) && !/\b(?:jam|pukul|at)\s*$/i.test(body.slice(0, range.index))) range = null;
  const clock = /(?:\b(?:jam|pukul|at)\s*)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/.exec(body.replace(/20\d{2}-\d{2}-\d{2}/g, ''));
  if (range) {
    startHour = +range[1]; startMinute = +(range[2] ?? 0);
    endHour = +range[3]; endMinute = +(range[4] ?? 0);
    if (startHour > 23 || endHour > 24 || startMinute > 59 || endMinute > 59 || (endHour === 24 && endMinute !== 0)) return null;
    if (endHour * 60 + endMinute <= startHour * 60 + startMinute) return null;
  } else if (clock) {
    startHour = +(clock[1] ?? clock[4]); startMinute = +(clock[2] ?? clock[5] ?? 0);
    const meridiem = clock[3] ?? clock[6];
    if (meridiem && (startHour < 1 || startHour > 12)) return null;
    if (meridiem === 'pm' && startHour !== 12) startHour += 12;
    if (meridiem === 'am' && startHour === 12) startHour = 0;
    if (!meridiem && /\b(malam|evening|night)\b/.test(body) && startHour < 12) startHour += 12;
    if (startHour > 23 || startMinute > 59) return null;
    endHour = Math.min(24, startHour + 2); endMinute = endHour === 24 ? 0 : startMinute;
  } else if (/\b(pagi|morning)\b/.test(body)) { startHour = 8; endHour = 12; }
  else if (/\b(sore|late afternoon)\b/.test(body)) { startHour = 15; endHour = 18; }
  else if (/\b(siang|afternoon)\b/.test(body)) { startHour = 12; endHour = 15; }
  else if (/\b(malam|evening|night)\b/.test(body)) { startHour = 18; endHour = 21; }
  const start = wibDate(dp.year, dp.month, dp.day, startHour, startMinute);
  const end = wibDate(dp.year, dp.month, dp.day, endHour, endMinute);
  if (end.getTime() <= Number(dateValue(now))) return null;
  return { label: formatWindow(start, end), time_window: { start: start.toISOString(), end: end.toISOString() } };
}
