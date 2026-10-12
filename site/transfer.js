// Pure export / import rules. No DOM, no database. Tested directly.
export const APP = "people-crm";
export const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BIRTHDAY = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/;

const realDay = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// The app's fields only. Never an owner.
export function cleanPerson(p) {
  return {
    id: p.id, name: p.name, relationship: p.relationship || "",
    lastTouched: p.lastTouched ?? null, cadenceDays: p.cadenceDays ?? null, followUp: p.followUp ?? null,
    birthday: p.birthday ?? null, gifts: [...(p.gifts || [])], notes: p.notes || "",
  };
}

export function serialize(people, now = new Date()) {
  return JSON.stringify({ app: APP, version: VERSION, exported: now.toISOString(), people: people.map(cleanPerson) }, null, 2);
}

export function exportFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `people-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

// Returns a list of friendly problems for one row (empty = fine).
export function rowProblems(r) {
  const e = [];
  if (r === null || typeof r !== "object" || Array.isArray(r)) return ["is not a person"];
  if (typeof r.id !== "string" || !UUID.test(r.id)) e.push("has no valid id");
  if (typeof r.name !== "string" || !r.name.trim()) e.push("has no name");
  if (r.relationship != null && typeof r.relationship !== "string") e.push("relationship should be text");
  for (const k of ["lastTouched", "followUp"]) {
    if (r[k] == null) continue;
    const m = typeof r[k] === "string" && r[k].match(ISO_DAY);
    if (!m || !realDay(+m[1], +m[2], +m[3])) e.push(`${k === "lastTouched" ? "last touched" : "follow-up"} is not a date like 2026-10-12`);
  }
  if (r.cadenceDays != null && (!Number.isInteger(r.cadenceDays) || r.cadenceDays < 1 || r.cadenceDays > 730)) e.push("stay-in-touch days should be 1 to 730");
  if (r.birthday != null) {
    const m = typeof r.birthday === "string" && r.birthday.match(BIRTHDAY);
    if (!m || !realDay(m[1] ? +m[1] : 2000, +m[2], +m[3])) e.push("birthday is not a date like 1986-05-17 or 05-17");
  }
  if (r.gifts != null && (!Array.isArray(r.gifts) || r.gifts.some((g) => typeof g !== "string"))) e.push("gift ideas should be a list of text");
  if (r.notes != null && typeof r.notes !== "string") e.push("notes should be text");
  return e;
}

// Text of a file -> { ok:true, people } or { ok:false, errors:[friendly strings] }.
export function parseImport(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { ok: false, errors: ["That file isn't a People export (it isn't valid JSON)."] }; }
  if (d === null || typeof d !== "object" || Array.isArray(d) || d.app !== APP)
    return { ok: false, errors: ["That file isn't a People export. Pick a people-YYYY-MM-DD.json file you exported from this app."] };
  if (d.version !== VERSION)
    return { ok: false, errors: [`That export is version ${d.version === undefined ? "unknown" : JSON.stringify(d.version)}; this app reads version ${VERSION}.`] };
  if (!Array.isArray(d.people)) return { ok: false, errors: ["That export has no list of people."] };
  const errors = [];
  const seen = new Set();
  d.people.forEach((r, i) => {
    const probs = rowProblems(r);
    const who = r && typeof r.name === "string" && r.name.trim() ? `Person ${i + 1} (${r.name.trim()})` : `Person ${i + 1}`;
    if (probs.length) errors.push(`${who} ${probs.join(", ")}.`);
    else if (seen.has(r.id.toLowerCase())) errors.push(`${who} repeats an id used earlier in the file.`);
    else seen.add(r.id.toLowerCase());
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, people: d.people.map(cleanPerson) };
}
