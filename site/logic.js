// Pure rules. No DOM. Tested directly.
export const DAY = 86400000;

export function parseDay(s) {
  // "YYYY-MM-DD" -> local midnight Date
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(a, b) {
  return Math.round((midnight(b) - midnight(a)) / DAY);
}

// Next follow-up = last touched + cadence days (unless an explicit date is set).
export function nextFollowUp(p) {
  if (p.followUp) return parseDay(p.followUp);
  if (!p.lastTouched || !p.cadenceDays) return null;
  const d = parseDay(p.lastTouched);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + p.cadenceDays);
}

// Days until the next birthday (0 = today). Birthday stored as "MM-DD" or "YYYY-MM-DD".
export function daysToBirthday(p, today) {
  if (!p.birthday) return null;
  const parts = p.birthday.split("-").map(Number);
  const [m, d] = parts.length === 3 ? parts.slice(1) : parts;
  const t = midnight(today);
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  return daysBetween(t, next);
}

export function overdueDays(p, today) {
  const n = nextFollowUp(p);
  if (!n) return null;
  return daysBetween(n, today); // >= 0 means due
}

export function dueList(people, today) {
  return people
    .map((p) => ({ p, late: overdueDays(p, today) }))
    .filter((x) => x.late !== null && x.late >= 0)
    .sort((a, b) => b.late - a.late)
    .map((x) => x.p);
}

export function birthdaysSoon(people, today, within = 14) {
  return people
    .map((p) => ({ p, d: daysToBirthday(p, today) }))
    .filter((x) => x.d !== null && x.d <= within)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
}

export function touch(p, today) {
  return { ...p, lastTouched: isoDay(today), followUp: null };
}

// Mike's date format: 5/17/1986 (no leading zeros). Stored as ISO; shown as M/D/YYYY.
export function usDate(s) {
  if (!s) return "";
  const p = s.split("-").map(Number);
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : `${p[0]}/${p[1]}`;
}

// Accepts 5/17/1986, 05/17/1986, 5/17 (no year), or ISO. Returns ISO ("YYYY-MM-DD" or "MM-DD") or null.
export function parseUsDate(s) {
  s = (s || "").trim();
  if (!s) return "";
  const pad = (n) => String(n).padStart(2, "0");
  let y = null, m, d;
  let k = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (k) { m = +k[1]; d = +k[2]; y = k[3] ? +k[3] : null; }
  else if ((k = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +k[1]; m = +k[2]; d = +k[3]; }
  else return null;
  const probe = new Date(y ?? 2000, m - 1, d); // 2000 is a leap year, so 2/29 with no year is allowed
  if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return y ? `${y}-${pad(m)}-${pad(d)}` : `${pad(m)}-${pad(d)}`;
}

export function validate(input) {
  const errs = [];
  if (!input.name || !input.name.trim()) errs.push("Name is required.");
  const c = Number(input.cadenceDays);
  if (input.cadenceDays !== "" && input.cadenceDays != null && (!Number.isInteger(c) || c < 1 || c > 730))
    errs.push("Stay in touch every 1 to 730 days.");
  if (input.birthday && parseUsDate(input.birthday) === null) errs.push("Birthday should look like 5/17/1986.");
  return errs;
}
