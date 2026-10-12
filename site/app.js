import { dueList, birthdaysSoon, overdueDays, daysToBirthday, nextFollowUp, touch, validate, isoDay, parseDay, usDate, parseUsDate } from "./logic.js";
import { serialize, exportFileName, parseImport } from "./transfer.js";
import { createStore } from "./store.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const store = createStore(sb);
const today = () => new Date();
const COLORS = ["#2f6f5e", "#b5482f", "#b8862b", "#4b5d9c", "#7a4f8f", "#3f7f9a", "#8a6b3d"];

let people = [];
let loaded = false; // nothing is drawn as "empty" until the database has answered
// Every change is saved to the database for that one person. If the save fails, say so and reload the truth.
async function save(p) {
  try { await store.put(p); }
  catch (e) { toast("Not saved: " + (e.message || e)); await reload(); }
}
async function reload() {
  try { people = await store.list(); loaded = true; document.body.dataset.loaded = "1"; }
  catch (e) { toast("Couldn't load: " + (e.message || e)); }
  render();
}

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
      ${people.length ? "" : `<div class="empty" data-testid="welcome">No people yet. Tap <b>＋ Add</b> to add the first one.</div>`}
      <h2>Follow up (${due.length})</h2>
      <div data-testid="due">${due.map((p) => row(p, `${statusTag(p)} <button class="primary small" data-touch="${p.id}">Touched</button>`)).join("") || `<div class="empty">Nobody's overdue. Nice.</div>`}</div>
      <h2>Birthdays, next 14 days (${bdays.length})</h2>
      <div data-testid="bdays">${bdays.map((p) => row(p, bdayTag(p))).join("") || `<div class="empty">No birthdays coming up.</div>`}</div>`;
  },
  people() {
    $title.textContent = "People";
    $app.innerHTML = `<input class="search" id="q" placeholder="Search ${people.length} people" autocomplete="off"><div id="list"></div>
      <h2>Backup</h2>
      <div class="row"><button class="ghost" id="export" type="button">Export</button><button class="ghost" id="import" type="button">Import</button></div>
      <input type="file" id="importfile" accept=".json,application/json" hidden>
      <div id="importbox" data-testid="importbox"></div>`;
    wireTransfer();
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
        <div><label>Birthday</label><input name="birthday" inputmode="numeric" value="${esc(usDate(v.birthday))}" placeholder="5/17/1986"></div>
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
      const rec = { ...d, name: d.name.trim(), cadenceDays: d.cadenceDays === "" ? null : Number(d.cadenceDays), birthday: parseUsDate(d.birthday) || null };
      let target = p;
      if (p) Object.assign(p, rec);
      else { target = { id: crypto.randomUUID(), lastTouched: isoDay(today()), followUp: null, gifts: [], ...rec }; people.push(target); }
      save(target); toast("Saved");
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
        <div class="kv"><span class="sub">Next follow-up</span><span>${nf ? usDate(isoDay(nf)) : "—"}</span></div>
        <div class="kv"><span class="sub">Birthday</span><span data-testid="bday">${p.birthday ? `${esc(usDate(p.birthday))}${bd !== null ? ` (in ${bd}d)` : ""}` : "—"}</span></div>
        <div class="kv" style="display:block"><span class="sub">Gift ideas</span>
          <ul class="gifts">${(p.gifts || []).map((g, i) => `<li>${esc(g)} <button class="ghost small" data-delgift="${i}">✕</button></li>`).join("") || `<li class="sub">none yet</li>`}</ul>
          <form id="giftform" class="row" style="margin-top:8px"><input id="gift" placeholder="Add a gift idea" enterkeyhint="enter" autocomplete="off"><button class="ghost" id="addgift" type="submit" style="flex:none">Add</button></form>
        </div>
        <div class="kv" style="display:block"><span class="sub">Notes</span><div style="white-space:pre-wrap;margin-top:4px">${esc(p.notes) || `<span class="sub">—</span>`}</div></div>
        <div class="row" style="margin-top:12px"><button class="ghost" id="edit">Edit</button><button class="ghost" id="del" style="color:var(--warn)">Delete</button></div>
      </div>`;
    document.getElementById("back").onclick = () => history.back();
    document.getElementById("touch").onclick = () => { Object.assign(p, touch(p, today())); save(p); toast(`Logged: ${p.name}`); render(); };
    document.getElementById("edit").onclick = () => views.add(p);
    document.getElementById("del").onclick = () => { if (confirm(`Delete ${p.name}?`)) { people = people.filter((x) => x !== p); store.remove(p.id).catch((e) => { toast("Not deleted: " + e.message); reload(); }); go("#/people"); } };
    // Return on the keyboard adds the gift (a form submit), then the box stays focused for the next one.
    document.getElementById("giftform").onsubmit = (e) => {
      e.preventDefault();
      const g = document.getElementById("gift").value.trim();
      if (!g) return;
      p.gifts = [...(p.gifts || []), g]; save(p); render();
      document.getElementById("gift").focus();
    };
    $app.querySelectorAll("[data-delgift]").forEach((b) => (b.onclick = () => { p.gifts.splice(Number(b.dataset.delgift), 1); save(p); render(); }));
  },
};

function wireTransfer() {
  const box = document.getElementById("importbox");
  const file = document.getElementById("importfile");
  document.getElementById("export").onclick = () => {
    const url = URL.createObjectURL(new Blob([serialize(people, today())], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = exportFileName(today());
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${people.length} people`);
  };
  document.getElementById("import").onclick = () => { file.value = ""; file.click(); };
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    const r = parseImport(await f.text());
    if (!r.ok) {
      box.innerHTML = `<div class="detail" style="margin-top:10px"><div class="err" data-testid="import-error">${r.errors.slice(0, 6).map(esc).join("<br>")}${r.errors.length > 6 ? `<br>...and ${r.errors.length - 6} more.` : ""}</div><div class="sub">Nothing was imported.</div></div>`;
      return;
    }
    const n = r.people.length;
    box.innerHTML = `<div class="detail" style="margin-top:10px"><div data-testid="import-ask"><b>Import ${n} ${n === 1 ? "person" : "people"}?</b></div><div class="sub">People already here with the same id are updated, not duplicated.</div><div class="row" style="margin-top:10px"><button class="primary" id="importgo" type="button">Import</button><button class="ghost" id="importno" type="button">Cancel</button></div></div>`;
    document.getElementById("importno").onclick = () => { box.innerHTML = ""; };
    document.getElementById("importgo").onclick = async () => {
      try { await store.putMany(r.people); toast(`Imported ${n}`); await reload(); }
      catch (e) { box.innerHTML = `<div class="detail" style="margin-top:10px"><div class="err" data-testid="import-error">Not imported: ${esc(e.message || e)}</div></div>`; }
    };
  };
}

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

let signedIn = false;
function render() {
  if (!signedIn) return;
  if (!loaded) { $app.innerHTML = `<div class="empty">Loading...</div>`; return; }
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
    Object.assign(p, touch(p, today())); save(p); toast(`Logged: ${p.name}`); render();
    return;
  }
  const o = e.target.closest("[data-open]");
  if (o) go(`#/p/${o.dataset.open}`);
});
window.addEventListener("hashchange", render);

// Sign in: email -> 6-digit code typed here (works the same on phone and laptop, no link juggling).
function loginView() {
  signedIn = false;
  document.getElementById("nav").hidden = true;
  document.getElementById("me").textContent = "";
  $title.textContent = "People";
  $app.innerHTML = `<form class="login" id="lf" novalidate>
      <p>Sign in with your email. We'll send a 6-digit code.</p>
      <input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com">
      <button class="primary" type="submit" style="width:100%;margin-top:10px">Email me a code</button>
      <div class="err" id="lerr"></div>
    </form>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const err = document.getElementById("lerr");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "That email doesn't look right."; return; }
    err.textContent = "Sending...";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) { err.textContent = /signups? not allowed|not found/i.test(error.message) ? "That email isn't set up for this app." : error.message; return; }
    codeView(email);
  };
}
function codeView(email) {
  $app.innerHTML = `<form class="login" id="cf" novalidate>
      <p>Code sent to <b>${esc(email)}</b>. Type it here.</p>
      <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••">
      <button class="primary" type="submit" style="width:100%;margin-top:10px">Sign in</button>
      <div class="err" id="cerr"></div>
      <p class="sub" style="margin-top:10px"><a href="#" id="again">Use a different email</a></p>
    </form>`;
  document.getElementById("code").focus();
  document.getElementById("again").onclick = (e) => { e.preventDefault(); loginView(); };
  document.getElementById("cf").onsubmit = async (e) => {
    e.preventDefault();
    const token = document.getElementById("code").value.replace(/\D/g, "");
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) document.getElementById("cerr").textContent = "That code didn't work. Check it, or send a new one.";
  };
}
async function enter(session) {
  signedIn = true; loaded = false; delete document.body.dataset.loaded;
  document.getElementById("nav").hidden = false;
  document.getElementById("me").innerHTML = `${esc(session.user.email)} · <a href="#" id="signout">Sign out</a>`;
  document.getElementById("signout").onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
  $app.innerHTML = `<div class="empty">Loading...</div>`;
  await reload();
}

let current;
sb.auth.onAuthStateChange((event, session) => {
  const id = session?.user?.id || null;
  if (id === current) return; // token refreshes don't redraw
  current = id;
  setTimeout(() => (session ? enter(session) : loginView()), 0);
});

// Test hook: lets the hosted end-to-end check drive the real code screen without spending the email quota.
window.__pcrm_codeView = codeView;
