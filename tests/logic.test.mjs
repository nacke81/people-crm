// Golden test 3 against the fixture, run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { dueList, birthdaysSoon, validate, touch, isoDay } from "../site/logic.js";
import { seedPeople } from "../site/seed.js";

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
    ["Name is required.", "Stay in touch every 1 to 730 days.", "Birthday looks wrong."]);
  assert.deepEqual(validate({ name: "Al", cadenceDays: "", birthday: "" }), []);
});
