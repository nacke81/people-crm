import { dueList, birthdaysSoon, overdueDays, daysToBirthday, nextFollowUp, touch, validate, isoDay, parseDay } from "./logic.js";
import { seedPeople } from "./seed.js";

const KEY = "pcrm.v1";
const today = () => new Date();
const COLORS = ["#2f6f5e", "#b5482f", "#b8862b", "#4b5d9c", "#7a4f8f", "#3f7f9a", "#8a6b3d"];

function load() {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const people = seedPeople(today());
  localStorage.setItem(KEY, JSON.stringify(people)); // starter state persists on first load
  return people;
}
let people = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(people));

const $app = document.getElementById("app");
const $title = document.getElementById("title");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const color = (id) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const avatar = (p) => `<div class="av" style="background:${color(p.id)}">${esc(initials(p.name))}</div>`;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 1600);
}

function ago(dateStr) {
  if (!dateStr) return "never";
  const n = Math.round((parseDay(isoDay(today())) - parseDay(dateStr)) / 86400000);
  return n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

function statusTag(p) {
  const late = overdueDays(p, today());
  if (late === null) return "";
  if (late > 0) return `<span class="tag late">${late}d overdue</span>`;
  if (late === 0) return `<span class="tag late">due today</span>`;
  return `<span class="tag ok">in ${-late}d</span>`;
}
function bdayTag(p) {
  const d = daysToBirthday(p, today());
  if (d === null || d > 14) return "";
  return `<span class="tag bday">🎂 ${d === 0 ? "today" : `in ${d}d`}</span>`;
}

function row(p, extra = "") {
  return `<div class="card click" data-open="${p.id}" data-testid="row">
    ${avatar(p)}
    <div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.relationship || "")} · touched ${ago(p.lastTouched)}</div></div>
    ${extra}
  </div>`;
}

const views = {
  due() {
    $title.textContent = "Due now";
    const due = dueList(people, today());
    const bdays = birthdaysSoon(people, today());
    $app.innerHTML = `
      <h2>Follow up (${due.length})</h2>
      <div data-testid="due">${due.map((p) => row(p, `${statusTag(p)} <button class="primary small" data-touch="${p.id}">Touched</button>`)).join("") || `<div class="empty">Nobody's overdue. Nice.</div>`}</div>
      <h2>Birthdays, next 14 days (${bdays.length})</h2>
      <div data-testid="bdays">${bdays.map((p) => row(p, bdayTag(p))).join("") || `<div class="empty">No birthdays coming up.</div>`}</div>`;
  },
  people() {
    $title.textContent = "People";
    $app.innerHTML = `<input class="search" id="q" placeholder="Search ${people.length} people" autocomplete="off"><div id="list"></div>`;
    const draw = (q = "") => {
      const list = people.filter((p) => (p.name + " " + (p.relationship || "")).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));
      document.getElementById("list").innerHTML = list.map((p) => row(p, statusTag(p) + bdayTag(p))).join("") || `<div class="empty">No match.</div>`;
    };
    document.getElementById("q").addEventListener("input", (e) => draw(e.target.value));
    draw();
  },
  add(p = null) {
    $title.textContent = p ? "Edit" : "Add person";
    const v = p || { name: "", relationship: "", cadenceDays: 30, birthday: "", notes: "" };
    $app.innerHTML = `<form id="f" novalidate class="detail">
      <label>Name</label><input name="name" value="${esc(v.name)}">
      <label>Relationship</label><input name="relationship" value="${esc(v.relationship)}" placeholder="Friend, Family, Mentor...">
      <div class="row">
        <div><label>Stay in touch every (days)</label><input name="cadenceDays" inputmode="numeric" value="${esc(v.cadenceDays ?? "")}"></div>
        <div><label>Birthday (YYYY-MM-DD)</label><input name="birthday" value="${esc(v.birthday || "")}" placeholder="1985-03-14"></div>
      </div>
      <label>Notes</label><textarea name="notes" rows="3">${esc(v.notes)}</textarea>
      <div class="err" id="err"></div>
      <div class="row" style="margin-top:10px"><button class="primary" type="submit">Save</button>${p ? `<button class="ghost" type="button" id="cancel">Cancel</button>` : ""}</div>
    </form>`;
    if (p) document.getElementById("cancel").onclick = () => go(`#/p/${p.id}`);
    document.getElementById("f").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const errs = validate(d);
      if (errs.length) { document.getElementById("err").textContent = errs.join(" "); return; }
      const rec = { ...d, name: d.name.trim(), cadenceDays: d.cadenceDays === "" ? null : Number(d.cadenceDays), birthday: d.birthday || null };
      if (p) Object.assign(p, rec);
      else people.push({ id: "p" + Date.now(), lastTouched: isoDay(today()), followUp: null, gifts: [], ...rec });
      save(); toast("Saved");
      go(p ? `#/p/${p.id}` : "#/people");
    };
  },
  person(id) {
    const p = people.find((x) => x.id === id);
    if (!p) return go("#/people");
    $title.textContent = p.name;
    const nf = nextFollowUp(p);
    const bd = daysToBirthday(p, today());
    $app.innerHTML = `<button class="back" id="back">‹ Back</button>
      <div class="detail">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">${avatar(p)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.relationship || "")}</div></div>${statusTag(p)}</div>
        <button class="primary" id="touch" style="width:100%;margin:6px 0 10px">Touched today</button>
        <div class="kv"><span class="sub">Last touched</span><span>${ago(p.lastTouched)}</span></div>
        <div class="kv"><span class="sub">Stay in touch</span><span>${p.cadenceDays ? `every ${p.cadenceDays} days` : "no schedule"}</span></div>
        <div class="kv"><span class="sub">Next follow-up</span><span>${nf ? isoDay(nf) : "—"}</span></div>
        <div class="kv"><span class="sub">Birthday</span><span>${p.birthday ? `${esc(p.birthday)}${bd !== null ? ` (in ${bd}d)` : ""}` : "—"}</span></div>
        <div class="kv" style="display:block"><span class="sub">Gift ideas</span>
          <ul class="gifts">${(p.gifts || []).map((g, i) => `<li>${esc(g)} <button class="ghost small" data-delgift="${i}">✕</button></li>`).join("") || `<li class="sub">none yet</li>`}</ul>
          <div class="row" style="margin-top:8px"><input id="gift" placeholder="Add a gift idea"><button class="ghost" id="addgift" style="flex:none">Add</button></div>
        </div>
        <div class="kv" style="display:block"><span class="sub">Notes</span><div style="white-space:pre-wrap;margin-top:4px">${esc(p.notes) || `<span class="sub">—</span>`}</div></div>
        <div class="row" style="margin-top:12px"><button class="ghost" id="edit">Edit</button><button class="ghost" id="del" style="color:var(--warn)">Delete</button></div>
      </div>`;
    document.getElementById("back").onclick = () => history.back();
    document.getElementById("touch").onclick = () => { Object.assign(p, touch(p, today())); save(); toast(`Logged: ${p.name}`); render(); };
    document.getElementById("edit").onclick = () => views.add(p);
    document.getElementById("del").onclick = () => { if (confirm(`Delete ${p.name}?`)) { people = people.filter((x) => x !== p); save(); go("#/people"); } };
    document.getElementById("addgift").onclick = () => {
      const g = document.getElementById("gift").value.trim();
      if (!g) return;
      p.gifts = [...(p.gifts || []), g]; save(); render();
    };
    $app.querySelectorAll("[data-delgift]").forEach((b) => (b.onclick = () => { p.gifts.splice(Number(b.dataset.delgift), 1); save(); render(); }));
  },
};

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  const h = location.hash || "#/due";
  const m = h.match(/^#\/p\/(.+)$/);
  const tab = m ? "people" : h.slice(2) || "due";
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (m) views.person(m[1]);
  else (views[tab] || views.due)();
  window.scrollTo(0, 0);
}

document.querySelector("nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) go(`#/${b.dataset.tab}`);
});
$app.addEventListener("click", (e) => {
  const t = e.target.closest("[data-touch]");
  if (t) {
    e.stopPropagation();
    const p = people.find((x) => x.id === t.dataset.touch);
    Object.assign(p, touch(p, today())); save(); toast(`Logged: ${p.name}`); render();
    return;
  }
  const o = e.target.closest("[data-open]");
  if (o) go(`#/p/${o.dataset.open}`);
});
window.addEventListener("hashchange", render);
render();
