// Fake people for the prototype. Dates are relative to "today" so the demo never goes stale.
// Built to the golden-test fixture: exactly 3 due, exactly 2 birthdays within 14 days.
import { isoDay } from "./logic.js";

function ago(today, n) { return isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n)); }
function bdayIn(today, n, year) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  return `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function seedPeople(today) {
  const P = (id, name, relationship, touchedAgo, cadenceDays, bdayOffset, year, gifts = [], notes = "") => ({
    id, name, relationship,
    lastTouched: touchedAgo == null ? null : ago(today, touchedAgo),
    cadenceDays, followUp: null,
    birthday: bdayOffset == null ? null : bdayIn(today, bdayOffset, year),
    gifts, notes,
  });
  return [
    P("p1", "Mom", "Family", 10, 7, 120, 1958, ["Garden gloves", "Photo book of the kids"], "Knee surgery recovery going well."),
    P("p2", "Jake Nacke", "Brother", 3, 14, 5, 1984, ["Packers hoodie (XL)"], "Moving to Madison in spring."),
    P("p3", "Sarah Klein", "Friend", 45, 30, 220, 1986, [], "Ask about the new job."),
    P("p4", "Dad", "Family", 2, 7, 40, 1956, ["Fishing lures"], ""),
    P("p5", "Coach Tom", "Mentor", 20, 60, null, null, [], "Thank him for the intro."),
    P("p6", "Aunt Linda", "Family", 30, 30, 100, 1961, ["Puzzle (1000pc)"], ""),
    P("p7", "Chris Ortega", "College friend", 10, 90, 12, 1985, ["Bourbon"], "Kids: Mia and Leo."),
    P("p8", "Emily Shaw", "Neighbor", 5, 30, 15, 1990, [], "Borrowed our ladder."),
    P("p9", "Grandma", "Family", 1, 7, 200, 1935, ["Large-print crosswords"], ""),
    P("p10", "Pastor Dave", "Church", null, null, null, null, [], ""),
  ];
}
