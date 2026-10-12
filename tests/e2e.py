"""Skeleton end-to-end check in a real browser: sign in by emailed code, add a person, see them on a second device.
Usage: python tests/e2e.py <base_url> <supabase_url> <publishable_key> <secret_key> [mailpit_url]
With mailpit_url (local stack) the code is read from the email; without it (hosted), the admin API
mints the code with generateLink, so the browser still types a real code into the real form.
Creates one throwaway account and deletes it at the end. Exit 1 on any failure."""
import glob, json, os, re, sys, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

base, sb_url, pub, secret = sys.argv[1:5]
mail = sys.argv[5] if len(sys.argv) > 5 else None
run = str(int(time.time()))[-7:]
email = f"e2e-{run}@example.com"
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


def code_for(since):
    if mail:
        for _ in range(40):
            q = json.load(urllib.request.urlopen(mail + "/api/v1/search?query=" + urllib.parse.quote("to:" + email)))["messages"]
            q = [m for m in q if m["Created"] > since]
            if q:
                return re.search(r"code: (\d{6})", q[0]["Subject"]).group(1)
            time.sleep(0.5)
        raise RuntimeError("no email")
    raise RuntimeError("hosted mode uses admin codes")


def sign_in(pg):
    pg.goto(base + "?e2e=" + run); pg.wait_for_selector("#email")
    pg.fill("#email", email)
    if mail:
        since = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 2))
        # Auth allows one code email per second per address; a fast second sign-in can be refused. Retry, don't guess a pause.
        for attempt in range(4):
            pg.locator("#lf button[type=submit]").click()
            try:
                pg.wait_for_selector("#code", timeout=5000); break
            except Exception:
                if attempt == 3: raise
                time.sleep(1.2)
        code = code_for(since)
    else:
        # Hosted: don't spend the 2-per-hour email quota. Mint a real one-time code with the admin key,
        # then drive the real code screen (codeView) the same way a user would.
        link = api("POST", "/auth/v1/admin/generate_link", {"type": "magiclink", "email": email})
        code = link.get("email_otp") or link["properties"]["email_otp"]
        pg.evaluate("e => window.__pcrm_codeView(e)", email); pg.wait_for_selector("#code")
    pg.fill("#code", code); pg.locator("#cf button[type=submit]").click()
    pg.wait_for_selector("#signout", timeout=20000)
    pg.wait_for_selector("body[data-loaded]", timeout=20000)


try:
    # Windows box: pin the installed headless shell (version drift). CI: Playwright's own.
    exe = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe")))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe[-1]) if exe else p.chromium.launch()
        cfg = f"window.PCRM_CONFIG = {{ url: {json.dumps(sb_url)}, key: {json.dumps(pub)} }};"
        errs = []

        def ctx():
            c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            c.add_init_script(cfg)
            pg = c.new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)))
            return c, pg

        c1, phone = ctx()
        phone.goto(base); phone.wait_for_selector("#email")
        check("logged out: sign-in screen, no people shown", phone.locator("#nav").is_hidden() and phone.locator("[data-testid=row]").count() == 0)
        sign_in(phone)
        check("signed in: empty account says how to start", phone.locator("[data-testid=welcome]").count() == 1)
        phone.locator("nav [data-tab=add]").click()
        phone.fill("input[name=name]", "Golden Test Person"); phone.fill("input[name=birthday]", "5/17/1986")
        phone.locator("#f button[type=submit]").click(); phone.wait_for_selector("#list")
        check("phone: person added", "Golden Test Person" in phone.locator("#list").inner_text())
        phone.locator("#list .card", has_text="Golden Test Person").click(); phone.wait_for_selector("#gift")
        phone.locator("#gift").click(); phone.keyboard.type("Bourbon"); phone.keyboard.press("Enter")
        for _ in range(60):  # saved = the gift is in the database, not a fixed pause
            if api("GET", f"/rest/v1/people?owner=eq.{uid}&select=gifts") == [{"gifts": ["Bourbon"]}]:
                break
            time.sleep(0.25)

        c2, laptop = ctx()
        sign_in(laptop)
        laptop.locator("nav [data-tab=people]").click(); laptop.wait_for_selector("#list")
        check("GOLDEN 1: laptop (new browser, same login) sees the person", "Golden Test Person" in laptop.locator("#list").inner_text())
        laptop.locator("#list .card", has_text="Golden Test Person").click(); laptop.wait_for_selector("[data-testid=bday]")
        check("laptop: birthday 5/17/1986 and gift came through", laptop.locator("[data-testid=bday]").inner_text().startswith("5/17/1986")
              and "Bourbon" in laptop.locator(".gifts").inner_text())
        rows = api("GET", f"/rest/v1/people?owner=eq.{uid}&select=name,birthday,gifts")
        check(f"database row is real ({rows})", rows == [{"name": "Golden Test Person", "birthday": "1986-05-17", "gifts": ["Bourbon"]}])
        laptop.locator("#signout").click(); laptop.wait_for_selector("#email")
        check("sign out returns to the sign-in screen", laptop.locator("[data-testid=row]").count() == 0)
        check(f"no page errors ({errs})", not errs)
        b.close()
finally:
    api("DELETE", f"/auth/v1/admin/users/{uid}")  # cascades to the person rows
    left = api("GET", f"/rest/v1/people?owner=eq.{uid}&select=id")
    print("cleanup: test account deleted, rows left:", len(left))
print("ALL PASS" if all(ok) else "SOME FAILED")
sys.exit(0 if all(ok) else 1)
