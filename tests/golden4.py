"""Golden 4 in a real browser: add 3 people, export to JSON, delete all 3 in the UI, import the file, data is identical.
Usage: python tests/golden4.py <base_url> <supabase_url> <publishable_key> <secret_key> [mailpit_url]
Same sign-in approach as tests/e2e.py. One throwaway account, deleted at the end. Exit 1 on any failure."""
import glob, json, os, re, sys, tempfile, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

base, sb_url, pub, secret = sys.argv[1:5]
mail = sys.argv[5] if len(sys.argv) > 5 else None
run = str(int(time.time()))[-7:]
email = f"g4-{run}@example.com"
A = {"apikey": secret, "Authorization": "Bearer " + secret, "Content-Type": "application/json"}
ok = []


def check(name, cond):
    ok.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name, flush=True)


def api(method, path, body=None):
    r = urllib.request.Request(sb_url + path, method=method, headers=A, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(r, timeout=30) as f:
        t = f.read(); return json.loads(t) if t else None


user = api("POST", "/auth/v1/admin/users", {"email": email, "email_confirm": True})
uid = user["id"]
FIELDS = "id,name,relationship,birthday,gifts,notes,cadence_days,last_touched,follow_up"


def rows():
    return sorted(api("GET", f"/rest/v1/people?owner=eq.{uid}&select={FIELDS}"), key=lambda r: r["name"])


def wait_db(cond, what, secs=20):
    """Poll the database until cond(rows()) is true. Replaces fixed sleeps."""
    end = time.time() + secs
    while time.time() < end:
        if cond(rows()):
            return
        time.sleep(0.2)
    print("  timed out waiting for: " + what, flush=True)


def code_for(since):
    for _ in range(40):
        q = json.load(urllib.request.urlopen(mail + "/api/v1/search?query=" + urllib.parse.quote("to:" + email)))["messages"]
        q = [m for m in q if m["Created"] > since]
        if q:
            return re.search(r"code: (\d{6})", q[0]["Subject"]).group(1)
        time.sleep(0.5)
    raise RuntimeError("no email")


def sign_in(pg):
    pg.goto(base + "?g4=" + run); pg.wait_for_selector("#email")
    pg.fill("#email", email)
    if mail:
        since = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 2))
        pg.locator("#lf button[type=submit]").click(); pg.wait_for_selector("#code")
        code = code_for(since)
    else:
        link = api("POST", "/auth/v1/admin/generate_link", {"type": "magiclink", "email": email})
        code = link.get("email_otp") or link["properties"]["email_otp"]
        pg.evaluate("e => window.__pcrm_codeView(e)", email); pg.wait_for_selector("#code")
    pg.fill("#code", code); pg.locator("#cf button[type=submit]").click()
    pg.wait_for_selector("#signout", timeout=20000)
    pg.wait_for_selector("body[data-loaded]", timeout=20000)


PEOPLE = [
    ("Alice Anderson", "Friend", "30", "5/17/1986", "Likes tea\nSecond line", ["Bourbon", "Tea set"]),
    ("Bob Brown", "Mentor", "90", "2/29", "", ["Book: Deep Work"]),
    ("Cara Chen", "Family", "14", "12/3/1990", "Allergic to nuts", []),
]
LAST = {"Alice Anderson": "2026-09-01", "Bob Brown": "2026-07-15", "Cara Chen": "2026-10-10"}

try:
    exe = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe")))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe[-1]) if exe else p.chromium.launch()
        cfg = f"window.PCRM_CONFIG = {{ url: {json.dumps(sb_url)}, key: {json.dumps(pub)} }};"
        errs = []
        c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, accept_downloads=True)
        c.add_init_script(cfg)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        sign_in(pg)

        for name, rel, cad, bday, notes, gifts in PEOPLE:
            pg.locator("nav [data-tab=add]").click()
            pg.fill("input[name=name]", name); pg.fill("input[name=relationship]", rel)
            pg.fill("input[name=cadenceDays]", cad); pg.fill("input[name=birthday]", bday)
            pg.fill("textarea[name=notes]", notes)
            pg.locator("#f button[type=submit]").click(); pg.wait_for_selector("#list")
            if gifts:
                pg.locator("#list .card", has_text=name).click(); pg.wait_for_selector("#gift")
                for i, g in enumerate(gifts, 1):
                    pg.locator("#gift").click(); pg.keyboard.type(g); pg.keyboard.press("Enter")
                    pg.wait_for_function("n => document.querySelectorAll('.gifts li:not(.sub)').length >= n", arg=i)
                pg.locator("nav [data-tab=people]").click(); pg.wait_for_selector("#list")
        wait_db(lambda r: len(r) == 3 and [x["gifts"] for x in r] == [["Bourbon", "Tea set"], ["Book: Deep Work"], []], "3 people with their gifts saved")
        # Give each person a different last-touched day (the UI stamps today on add).
        for n, d in LAST.items():
            api("PATCH", f"/rest/v1/people?owner=eq.{uid}&name=eq.{urllib.parse.quote(n)}", {"last_touched": d})
        pg.reload(); pg.wait_for_selector("body[data-loaded]"); pg.locator("nav [data-tab=people]").click(); pg.wait_for_selector("#list")

        before = rows()
        check(f"setup: 3 people with gifts, notes, cadence, last touched in the database", len(before) == 3
              and [r["gifts"] for r in before] == [["Bourbon", "Tea set"], ["Book: Deep Work"], []]
              and [r["last_touched"] for r in before] == ["2026-09-01", "2026-07-15", "2026-10-10"]
              and before[1]["birthday"] == "02-29" and before[0]["notes"] == "Likes tea\nSecond line")

        with pg.expect_download() as dl:
            pg.locator("#export").click()
        path = os.path.join(tempfile.gettempdir(), f"g4-{run}.json")
        dl.value.save_as(path)
        check(f"export downloads {dl.value.suggested_filename}", re.fullmatch(r"people-\d{4}-\d{2}-\d{2}\.json", dl.value.suggested_filename))
        data = json.load(open(path, encoding="utf-8"))
        check("export file: app, version, exported, 3 people, no owner",
              data["app"] == "people-crm" and data["version"] == 1 and data["exported"] and len(data["people"]) == 3
              and all("owner" not in x for x in data["people"]))

        # wipe through the UI
        for name, *_ in PEOPLE:
            pg.locator("#list .card", has_text=name).click(); pg.wait_for_selector("#del")
            pg.locator("#del").click(); pg.wait_for_selector("#list")
        wait_db(lambda r: r == [], "all 3 people deleted")
        check("wiped: 0 people in the database", rows() == [])
        check("wiped: list is empty in the UI", pg.locator("[data-testid=row]").count() == 0)

        # friendly errors first (nothing imported)
        bad = os.path.join(tempfile.gettempdir(), f"g4-bad-{run}.json")
        for label, content, expect in [
            ("wrong file", '{"hello": 1}', "isn't a People export"),
            ("wrong version", json.dumps({**data, "version": 7}), "version 7"),
            ("bad row", json.dumps({**data, "people": [{**data["people"][0], "name": ""}]}), "Person 1 has no name"),
        ]:
            bad = os.path.join(tempfile.gettempdir(), f"g4-bad-{run}-{label.replace(' ', '-')}.json")  # distinct path so the browser fires a change event
            open(bad, "w", encoding="utf-8").write(content)
            pg.evaluate("document.getElementById('importbox').innerHTML = ''")  # so we wait for THIS file's answer
            pg.set_input_files("#importfile", bad)
            pg.wait_for_selector("[data-testid=import-error]")
            check(f"friendly error, {label}: {pg.locator('[data-testid=import-error]').inner_text()[:70]!r}", expect in pg.locator("[data-testid=import-error]").inner_text())
        check("bad files imported nothing", rows() == [])

        # the real import
        pg.set_input_files("#importfile", path)
        pg.wait_for_selector("[data-testid=import-ask]")
        check("asks 'Import 3 people?'", pg.locator("[data-testid=import-ask]").inner_text().strip() == "Import 3 people?")
        pg.locator("#importgo").click(); pg.wait_for_function("document.querySelectorAll('[data-testid=row]').length === 3")
        after = rows()
        check("GOLDEN 4: after import the data is identical (ids, names, birthdays, gifts, notes, cadence, last touched)", after == before)
        if after != before:
            print("  before:", json.dumps(before)); print("  after: ", json.dumps(after))

        # importing the same file again must not duplicate
        pg.set_input_files("#importfile", path)
        pg.wait_for_selector("[data-testid=import-ask]"); pg.locator("#importgo").click()
        pg.wait_for_selector("[data-testid=import-ask]", state="detached")  # import finished and the list reloaded
        check("re-import: still exactly 3, still identical", rows() == before)

        # gifts and notes show on the person page too
        pg.locator("#list .card", has_text="Alice Anderson").click(); pg.wait_for_selector(".gifts")
        check("UI shows Alice's gifts after import", "Bourbon" in pg.locator(".gifts").inner_text() and "Tea set" in pg.locator(".gifts").inner_text())
        check(f"no page errors ({errs})", not errs)
        b.close()
finally:
    api("DELETE", f"/auth/v1/admin/users/{uid}")  # cascades to the person rows
    left = api("GET", f"/rest/v1/people?owner=eq.{uid}&select=id")
    print("cleanup: test account deleted, rows left:", len(left))
print("ALL PASS" if all(ok) else "SOME FAILED")
sys.exit(0 if all(ok) else 1)
