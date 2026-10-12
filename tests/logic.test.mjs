// Golden test 3 against the fixture, run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { dueList, birthdaysSoon, validate, touch, isoDay } from "../site/logic.js";
import { seedPeople } from "./seed.mjs";

const days = [new Date(2026, 9, 9), new Date(2026, 11, 28), new Date(2027, 1, 27), new Date(2028, 1, 29)];

for (const today of days) {
  test(`golden 3: fixture gives exactly 3 due and 2 birthdays (${isoDay(today)})`, () => {
    const people = seedPeople(today);
    assert.equal(people.length, 10);
    assert.deepEqual(dueList(people, today).map((p) => p.id).sort(), ["p1", "p3", "p6"]);
    assert.deepEqual(birthdaysSoon(people, today).map((p) => p.id), ["p2", "p7"]);
  });
}

test("touched today clears someone from the due list", () => {
  const today = days[0];
  const people = seedPeople(today).map((p) => (p.id === "p3" ? touch(p, today) : p));
  assert.deepEqual(dueList(people, today).map((p) => p.id).sort(), ["p1", "p6"]);
});

test("validation gives friendly errors", () => {
  assert.deepEqual(validate({ name: " ", cadenceDays: "0", birthday: "march" }),
    ["Name is required.", "Stay in touch every 1 to 730 days.", "Birthday should look like 5/17/1986."]);
  assert.deepEqual(validate({ name: "Al", cadenceDays: "", birthday: "" }), []);
});

import { usDate, parseUsDate } from "../site/logic.js";

test("review fix 1: dates show as 5/17/1986 (Mike's format)", () => {
  assert.equal(usDate("1986-05-17"), "5/17/1986");
  assert.equal(usDate("12-03"), "12/3");
  assert.equal(parseUsDate("5/17/1986"), "1986-05-17");
  assert.equal(parseUsDate("05/17/1986"), "1986-05-17");
  assert.equal(parseUsDate("2/29"), "02-29");
  assert.equal(parseUsDate("2/30/1990"), null);
  assert.equal(parseUsDate("1986-05-17"), "1986-05-17");
  assert.deepEqual(validate({ name: "A", cadenceDays: "", birthday: "13/1/1990" }), ["Birthday should look like 5/17/1986."]);
});
