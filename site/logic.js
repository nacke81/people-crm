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

export function validate(input) {
  const errs = [];
  if (!input.name || !input.name.trim()) errs.push("Name is required.");
  const c = Number(input.cadenceDays);
  if (input.cadenceDays !== "" && input.cadenceDays != null && (!Number.isInteger(c) || c < 1 || c > 730))
    errs.push("Stay in touch every 1 to 730 days.");
  if (input.birthday && !/^(\d{4}-)?\d{2}-\d{2}$/.test(input.birthday)) errs.push("Birthday looks wrong.");
  return errs;
}
