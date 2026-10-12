"""Ordered saves in a real browser: two quick gift adds, the FIRST save request is held back 1.5s, both gifts must end up in the database.
On the unfixed app the first save ([A]) lands after the second ([A,B]) and overwrites it, so B is lost.
Usage: python tests/ordered_saves.py <base_url> <supabase_url> <publishable_key> <secret_key> [mailpit_url]
One throwaway account, deleted at the end. Exit 1 on any failure."""
import glob, json, os, re, sys, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

base, sb_url, pub, secret = sys.argv[1:5]
mail = sys.argv[5] if len(sys.argv) > 5 else None
run = str(int(time.time()))[-7:]
email = f"os-{run}@example.com"
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


def gifts_in_db():
    r = api("GET", f"/rest/v1/people?owner=eq.{uid}&select=gifts")
    return r[0]["gifts"] if r else None


def code_for(since):
    for _ in range(40):
        q = json.load(urllib.request.urlopen(mail + "/api/v1/search?query=" + urllib.parse.quote("to:" + email)))["messages"]
        q = [m for m in q if m["Created"] > since]
        if q:
            return re.search(r"code: (\d{6})", q[0]["Subject"]).group(1)
        time.sleep(0.5)
    raise RuntimeError("no email")


def sign_in(pg):
    pg.goto(base + "?os=" + run); pg.wait_for_selector("#email")
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


try:
    # one person, created straight in the database so the test is only about gift saves
    api("POST", "/rest/v1/people", {"owner": uid, "id": "00000000-0000-4000-8000-0000000000a1", "name": "Dana Doe", "gifts": [], "last_touched": "2026-10-01"})
    exe = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe")))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe[-1]) if exe else p.chromium.launch()
        cfg = f"window.PCRM_CONFIG = {{ url: {json.dumps(sb_url)}, key: {json.dumps(pub)} }};"
        errs = []
        c = b.new_context(viewport={"width": 390, "height": 844})
        c.add_init_script(cfg)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        sign_in(pg)
        pg.locator("nav [data-tab=people]").click(); pg.wait_for_selector("#list")

        # Hold back the FIRST write to /rest/v1/people by 1.5s, before it reaches the database. Later writes go straight through.
        # The first one is parked and released from the main loop below (a sleep here would freeze Playwright and keep the order).
        seen = []
        held = []

        def hold_first(route):
            req = route.request
            if req.method in ("POST", "PATCH") and "/rest/v1/people" in req.url:
                seen.append(json.loads(req.post_data or "{}"))
                if len(seen) == 1:
                    held.append((route, time.time())); return
            route.continue_()

        pg.route("**/rest/v1/people*", hold_first)

        pg.locator("#list .card", has_text="Dana Doe").click(); pg.wait_for_selector("#gift")
        for g in ("Gift A", "Gift B"):
            pg.locator("#gift").click(); pg.keyboard.type(g); pg.keyboard.press("Enter")
        check("UI shows both gifts at once (instant)", pg.locator(".gifts li:not(.sub)").count() == 2)

        # wait on database state, not a fixed sleep: until both gifts are there, or 8s
        end = time.time() + 8
        while time.time() < end and gifts_in_db() != ["Gift A", "Gift B"]:
            if held and time.time() - held[0][1] >= 1.5:
                held.pop()[0].continue_()
            pg.wait_for_timeout(100)
        while held:
            held.pop()[0].continue_()
        pg.unroute("**/rest/v1/people*")
        check(f"saves were sent ({len(seen)} write requests, gifts bodies {[s.get('gifts') if isinstance(s, dict) else s for s in seen]})", len(seen) >= 1)
        check(f"both gifts are in the database (got {gifts_in_db()})", gifts_in_db() == ["Gift A", "Gift B"])

        pg.reload(); pg.wait_for_selector("body[data-loaded]"); pg.locator("nav [data-tab=people]").click(); pg.wait_for_selector("#list")
        pg.locator("#list .card", has_text="Dana Doe").click(); pg.wait_for_selector(".gifts")
        txt = pg.locator(".gifts").inner_text()
        check(f"after reload the UI shows both gifts ({txt!r})", "Gift A" in txt and "Gift B" in txt)
        check(f"no page errors ({errs})", not errs)
        b.close()
finally:
    api("DELETE", f"/auth/v1/admin/users/{uid}")
    left = api("GET", f"/rest/v1/people?owner=eq.{uid}&select=id")
    print("cleanup: test account deleted, rows left:", len(left))
print("ALL PASS" if all(ok) else "SOME FAILED")
sys.exit(0 if all(ok) else 1)
