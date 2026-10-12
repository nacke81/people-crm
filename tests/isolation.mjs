// Golden test 2 (positive control): a second account and the logged-out key each read 0 of Mike's people.
// Runs against any Supabase: SUPABASE_URL + SUPABASE_ANON_KEY (defaults to the local stack).
// Prints one line per attack and a final score. Exit 1 if anything leaks.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || "http://127.0.0.1:57321";
const KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const run = Date.now().toString(36);
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

// Hosted: sign-ups are off, so test accounts are made with the admin key and deleted at the end.
const SECRET = process.env.SUPABASE_SECRET_KEY;
const admin = SECRET ? createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const made = [];
async function account(tag) {
  const c = mk();
  const email = `${tag}-${run}@spike.test`, password = "spike-" + run + "-pw";
  if (admin) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`create ${tag}: ${error.message}`);
    made.push(data.user.id);
    const s = await c.auth.signInWithPassword({ email, password });
    if (s.error) throw new Error(`sign in ${tag}: ${s.error.message}`);
    return { c, id: data.user.id, email };
  }
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(`signup ${tag}: ${error.message}`);
  return { c, id: data.user.id, email };
}

const mike = await account("mike");
const intruder = await account("intruder");
const anon = mk();

// Mike adds 3 people.
const seed = ["Mom", "Jake Nacke", "Sarah Klein"].map((name) => ({ name, relationship: "Family", cadence_days: 30 }));
const ins = await mike.c.from("people").insert(seed).select();
check("Mike can add 3 people", !ins.error && ins.data.length === 3, ins.error?.message);
const ids = (ins.data || []).map((r) => r.id);
check("rows are stamped with Mike as owner", (ins.data || []).every((r) => r.owner === mike.id));

// Positive control: Mike reads his own back (proves "0" below isn't just a broken query).
const own = await mike.c.from("people").select("*");
check("CONTROL: Mike reads his own 3", own.data?.length === 3, `got ${own.data?.length}`);

// Attacks.
const iAll = await intruder.c.from("people").select("*");
check("intruder: read all -> 0 rows", (iAll.data || []).length === 0, `got ${iAll.data?.length}`);
const iById = await intruder.c.from("people").select("*").in("id", ids);
check("intruder: read by Mike's row ids -> 0 rows", (iById.data || []).length === 0, `got ${iById.data?.length}`);
const iByOwner = await intruder.c.from("people").select("*").eq("owner", mike.id);
check("intruder: filter owner = Mike -> 0 rows", (iByOwner.data || []).length === 0, `got ${iByOwner.data?.length}`);
const iUpd = await intruder.c.from("people").update({ notes: "pwned" }).in("id", ids).select();
check("intruder: edit Mike's people -> 0 changed", (iUpd.data || []).length === 0, `got ${iUpd.data?.length}`);
const iDel = await intruder.c.from("people").delete().in("id", ids).select();
check("intruder: delete Mike's people -> 0 deleted", (iDel.data || []).length === 0, `got ${iDel.data?.length}`);
const iPlant = await intruder.c.from("people").insert({ name: "Planted", owner: mike.id }).select();
check("intruder: add a row owned by Mike -> refused", !!iPlant.error, iPlant.error ? "refused" : "ACCEPTED");
const iSteal = await intruder.c.from("people").update({ owner: intruder.id }).in("id", ids).select();
check("intruder: take ownership of Mike's rows -> 0", (iSteal.data || []).length === 0, `got ${iSteal.data?.length}`);

const aAll = await anon.from("people").select("*");
check("logged out: read all -> 0 rows", (aAll.data || []).length === 0, aAll.error ? "refused" : `got ${aAll.data?.length}`);
const aIns = await anon.from("people").insert({ name: "x" }).select();
check("logged out: add -> refused", !!aIns.error, aIns.error ? "refused" : "ACCEPTED");

// Mike's data survived every attack.
const after = await mike.c.from("people").select("*").order("name");
check("Mike still has his 3, untouched", after.data?.length === 3 && after.data.every((r) => r.notes === "" && r.owner === mike.id),
  `got ${after.data?.length}`);

if (admin) {
  const stranger = await mk().auth.signUp({ email: `stranger-${run}@spike.test`, password: "x-" + run + "-pw-long" });
  check("stranger: create an account -> refused (sign-ups off)", !!stranger.error, stranger.error ? "refused" : "ACCEPTED");
  if (stranger.data?.user?.id) made.push(stranger.data.user.id);
  for (const id of made) await admin.auth.admin.deleteUser(id); // rows go too (on delete cascade)
}
const passed = results.filter(Boolean).length;
console.log(`\nISOLATION SCORE: ${passed} of ${results.length}`);
process.exit(passed === results.length ? 0 : 1);
