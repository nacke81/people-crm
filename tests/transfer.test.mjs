import test from "node:test";
import assert from "node:assert/strict";
import { serialize, parseImport, exportFileName, rowProblems, friendlyImportError } from "../site/transfer.js";

const A = { id: "11111111-1111-4111-8111-111111111111", name: "Ann", relationship: "Friend", lastTouched: "2026-10-01", cadenceDays: 30, followUp: null, birthday: "1986-05-17", gifts: ["Bourbon", "Book"], notes: "Line1\nLine2", owner: "secret-owner" };
const B = { id: "22222222-2222-4222-8222-222222222222", name: "Bo", relationship: "", lastTouched: null, cadenceDays: null, followUp: "2026-11-02", birthday: "03-09", gifts: [], notes: "" };

test("export shape, no owner, file name", () => {
  const d = JSON.parse(serialize([A, B], new Date(2026, 9, 12, 10)));
  assert.equal(d.app, "people-crm"); assert.equal(d.version, 1);
  assert.ok(!Number.isNaN(Date.parse(d.exported)));
  assert.equal(d.people.length, 2);
  assert.ok(d.people.every((p) => !("owner" in p)));
  assert.equal(exportFileName(new Date(2026, 9, 2)), "people-2026-10-02.json");
});

test("round trip is identical (minus owner)", () => {
  const r = parseImport(serialize([A, B]));
  assert.equal(r.ok, true);
  const { owner, ...a } = A;
  assert.deepEqual(r.people, [a, B]);
});

test("friendly errors: not json, wrong file, wrong version, no list", () => {
  assert.match(parseImport("hello").errors[0], /isn't a People export/);
  assert.match(parseImport('{"foo":1}').errors[0], /isn't a People export/);
  assert.match(parseImport("[]").errors[0], /isn't a People export/);
  assert.match(parseImport('{"app":"people-crm","version":2,"people":[]}').errors[0], /version 2/);
  assert.match(parseImport('{"app":"people-crm","version":1}').errors[0], /no list/);
});

test("bad rows are named, all reported, nothing imported", () => {
  const bad = { app: "people-crm", version: 1, people: [A, { ...B, name: " " }, { ...B, id: "x" }, { ...A, birthday: "13-45", gifts: [1], cadenceDays: 0 }] };
  const r = parseImport(JSON.stringify(bad));
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /Person 2 has no name/);
  assert.match(r.errors[2], /Person 4 \(Ann\).*1 to 730.*birthday.*gift ideas/);
});

test("duplicate ids in a file are refused", () => {
  const r = parseImport(JSON.stringify({ app: "people-crm", version: 1, people: [A, A] }));
  assert.equal(r.ok, false); assert.match(r.errors[0], /repeats an id/);
});

test("rowProblems rejects impossible dates, accepts 02-29", () => {
  assert.deepEqual(rowProblems({ ...B, birthday: "02-29" }), []);
  assert.equal(rowProblems({ ...B, lastTouched: "2026-02-30" }).length, 1);
  assert.equal(rowProblems(null).length, 1);
});

test("QA: an export with zero people is refused with a friendly message", () => {
  const r = parseImport(JSON.stringify({ app: "people-crm", version: 1, exported: "2026-10-12T00:00:00Z", people: [] }));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no people/i);
});

test("QA: database refusals become friendly text, never raw Postgres", () => {
  const rls = friendlyImportError({ code: "42501", message: 'new row violates row-level security policy (USING expression) for table "people"' });
  assert.match(rls, /another account/i);
  assert.doesNotMatch(rls, /row-level|policy|postgres|42501/i);
  assert.match(friendlyImportError({ message: "Failed to fetch" }), /connection|try again/i);
  assert.match(friendlyImportError(new Error("weird")), /try again/i);
  assert.doesNotMatch(friendlyImportError(new Error("weird")), /weird/);
});
